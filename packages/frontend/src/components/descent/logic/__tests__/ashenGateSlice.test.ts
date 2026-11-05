import { describe, expect, test } from "bun:test";
import {
  type ReadPresentation,
  readPresentation,
} from "../../views/presentation";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  createAshenGateSim,
  isAshenGateSliceSnapshot,
} from "../ashenGateSlice";
import { buildingDef, footprintCovers, footprintGap } from "../economy";
import {
  AUTOSAVE_SLOT,
  attachLayerAutosave,
  readSaveSlot,
  TICKS_PER_SECOND,
} from "../sim";
import type { DescentSim } from "../sim/descentSim";
import { trainingPlan } from "../slice/sliceTraining";
import { type ClassId, RESOURCE_IDS, type SimSnapshot } from "../types";
import type { WaveClockState } from "../waves/types";

/**
 * Budget for the full Camp-to-Cinderjaw playthrough. It simulates the whole
 * layer (about 3.5s alone) and exceeds bun's 5s default when the suite runs
 * in parallel on a busy machine or CI runner.
 */
const FULL_PLAYTHROUGH_TIMEOUT_MS = 30_000;

/** In-memory `SaveStorage` for autosave tests. */
class MemoryStorage {
  private readonly values = new Map<string, string>();

  /**
   * @param key - Storage key
   * @returns Stored value or null
   */
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  /**
   * @param key - Storage key
   * @param value - Serialized value
   */
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

/**
 * @param snapshot - Sim snapshot
 * @returns Slice state
 */
function slice(snapshot: SimSnapshot): AshenGateSliceState {
  return snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID] as AshenGateSliceState;
}

/**
 * @param snapshot - Sim snapshot
 * @returns Normalized presentation read by the game UI
 */
function ui(snapshot: SimSnapshot): ReadPresentation {
  return readPresentation(snapshot.meta);
}

/**
 * @param sim - Running sim
 * @returns The audio tag on each live unit-birth effect, oldest first
 */
function birthSounds(sim: DescentSim): (string | undefined)[] {
  return (ui(sim.snapshot()).fx ?? [])
    .filter((effect) => effect.kind === "spawn")
    .map((effect) => ("sound" in effect ? effect.sound : undefined));
}

/**
 * @param snapshot - Sim snapshot
 * @returns Wave clock
 */
function waves(snapshot: SimSnapshot): WaveClockState {
  return snapshot.meta.waves as WaveClockState;
}

/**
 * @param sim - Sim
 * @returns Living Hold villager ids, sorted
 */
function villagerIds(sim: DescentSim): string[] {
  return sim
    .snapshot()
    .units.filter((unit) => unit.classId === "villager")
    .map((unit) => unit.id)
    .sort();
}

/**
 * Orders the opening economy the way a player would: two of the three
 * starting villagers on food and one on water. Villagers stand idle until told.
 * @param sim - Fresh Ashen Gate sim
 */
function putVillagersToWork(sim: DescentSim) {
  const ids = villagerIds(sim);
  sim.enqueue({
    nodeId: "ashen-food-near",
    type: "assign_gather",
    unitIds: ids.slice(0, 2),
  });
  sim.enqueue({
    nodeId: "ashen-water-near",
    type: "assign_gather",
    unitIds: ids.slice(2),
  });
  sim.step(1);
}

/**
 * @param sim - Sim
 * @returns The Hold's Camp cell; the layout moves it every run
 */
function campCell(sim: DescentSim): { x: number; y: number } {
  const camp = sim
    .snapshot()
    .buildings.find((building) => building.buildingType === "camp");
  if (!camp) throw new Error("Missing Camp");
  return { x: camp.x, y: camp.y };
}

/**
 * Finds the open center cell closest to an offset from the Camp: the whole
 * square of `buildingType` on the map and clear of buildings, deposits, and
 * vents. Generated layouts move deposits each run.
 * @param sim - Sim
 * @param dx - Columns east of the Camp
 * @param dy - Rows south of the Camp
 * @param buildingType - Building whose square must fit; a one-cell wall
 *   when the cell is only a rally point
 * @returns A cell a building or rally point can use
 */
function openCellNear(
  sim: DescentSim,
  dx: number,
  dy: number,
  buildingType = "wall",
): { x: number; y: number } {
  const snapshot = sim.snapshot();
  const camp = campCell(sim);
  const target = { x: camp.x + dx, y: camp.y + dy };
  const presentation = ui(snapshot);
  const radius = ((buildingDef(buildingType)?.footprint ?? 1) - 1) / 2;
  /**
   * @param x - Column
   * @param y - Row
   * @returns Whether one cell of the square is free ground
   */
  const freeCell = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < snapshot.map.width &&
    y < snapshot.map.height &&
    !(presentation.nodes ?? []).some((node) => node.x === x && node.y === y) &&
    !(presentation.vents ?? []).some(
      (vent) => Math.hypot(vent.x - x, vent.y - y) <= vent.radius + 0.5,
    );
  /**
   * @param x - Center column
   * @param y - Center row
   * @returns Whether the building's whole square could go here
   */
  const open = (x: number, y: number) => {
    const site = { buildingType, x, y };
    if (snapshot.buildings.some((entry) => footprintGap(entry, site) === 0)) {
      return false;
    }
    for (let cy = y - radius; cy <= y + radius; cy += 1) {
      for (let cx = x - radius; cx <= x + radius; cx += 1) {
        if (!freeCell(cx, cy) || !footprintCovers(site, cx, cy)) return false;
      }
    }
    return true;
  };
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let y = target.y - radius; y <= target.y + radius; y += 1) {
      for (let x = target.x - radius; x <= target.x + radius; x += 1) {
        const onRing =
          Math.max(Math.abs(x - target.x), Math.abs(y - target.y)) === radius;
        if (onRing && open(x, y)) return { x, y };
      }
    }
  }
  throw new Error(`No open cell near the Camp at ${dx},${dy}`);
}

/**
 * Places a building with three builders near an offset from the Camp and
 * runs one tick so the command applies. Builders return to their gather
 * order when the site is done.
 * @param sim - Sim
 * @param buildingType - Building type
 * @param dx - Columns east of the Camp
 * @param dy - Rows south of the Camp
 * @returns The cell the building was placed on
 */
function place(
  sim: DescentSim,
  buildingType: string,
  dx: number,
  dy: number,
): { x: number; y: number } {
  const { x, y } = openCellNear(sim, dx, dy, buildingType);
  sim.enqueue({
    builderIds: villagerIds(sim).slice(0, 3),
    buildingType,
    type: "place_building",
    x,
    y,
  });
  sim.step(1);
  return { x, y };
}

/**
 * Steps until a condition holds or a budget runs out.
 * @param sim - Sim
 * @param predicate - Condition
 * @param label - Failure label
 * @param maximumSeconds - Sim-second budget
 */
function stepUntil(
  sim: DescentSim,
  predicate: () => boolean,
  label: string,
  maximumSeconds = 600,
): void {
  const budget = maximumSeconds * TICKS_PER_SECOND;
  let stepped = 0;
  while (!predicate() && !sim.paused && stepped < budget) {
    sim.step(10);
    stepped += 10;
  }
  if (predicate()) return;
  const snapshot = sim.snapshot();
  throw new Error(
    `Timed out waiting for ${label} at tick ${sim.tick}: ${JSON.stringify({
      notices: slice(snapshot).notices.map((notice) => notice.text),
      outcome: slice(snapshot).outcome,
      resources: snapshot.resources,
    })}`,
  );
}

/**
 * Waits for a building type to finish construction.
 * @param sim - Sim
 * @param buildingType - Building type
 * @returns Its id
 */
function completed(sim: DescentSim, buildingType: string): string {
  stepUntil(
    sim,
    () =>
      sim.snapshot().buildings.some((building) => {
        if (building.buildingType !== buildingType) return false;
        return (
          ui(sim.snapshot()).buildings?.[building.id]?.constructing === false
        );
      }),
    `${buildingType} construction`,
    120,
  );
  const building = sim
    .snapshot()
    .buildings.find((entry) => entry.buildingType === buildingType);
  if (!building) throw new Error(`${buildingType} disappeared`);
  return building.id;
}

/**
 * Counts living Hold units of a class.
 * @param sim - Sim
 * @param classId - Class
 * @returns Count
 */
function holdCount(sim: DescentSim, classId: ClassId): number {
  const units = ui(sim.snapshot()).units ?? {};
  return sim
    .snapshot()
    .units.filter(
      (unit) =>
        unit.classId === classId && units[unit.id]?.factionId === "hold",
    ).length;
}

/** Soldiers a scripted player trains per squad, one order at a time. */
const SQUAD_SIZE = 5;

/**
 * Orders a squad one soldier at a time, as a player would, and waits for
 * all of them to arrive.
 * @param sim - Sim
 * @param barracksId - Barracks
 * @param classId - Class to train
 */
function trainSquad(sim: DescentSim, barracksId: string, classId: ClassId) {
  const before = holdCount(sim, classId);
  for (let ordered = 0; ordered < SQUAD_SIZE; ordered += 1) {
    stepUntil(
      sim,
      () =>
        ui(sim.snapshot()).trainOptions?.some(
          (option) =>
            option.buildingId === barracksId &&
            option.classId === classId &&
            option.allowed,
        ) === true,
      `${classId} order resources`,
      300,
    );
    sim.enqueue({ buildingId: barracksId, classId, type: "train_unit" });
    sim.step(1);
  }
  stepUntil(
    sim,
    () => holdCount(sim, classId) >= before + SQUAD_SIZE,
    `${classId} squad`,
    90,
  );
}

describe("Ashen Gate vertical slice", () => {
  test("the starting stockpile exactly funds the opening defense checklist", () => {
    const start = createAshenGateSim({ seed: 1 }).snapshot();
    const barracks = buildingDef("barracks");
    const omenTower = buildingDef("omen_tower");
    if (!barracks || !omenTower) throw new Error("Missing opening buildings");
    const costs = [
      trainingPlan("villager").cost,
      barracks.cost,
      ...Array.from({ length: SQUAD_SIZE }, () => trainingPlan("warden").cost),
      omenTower.cost,
    ];

    for (const resourceId of RESOURCE_IDS) {
      const required = costs.reduce(
        (total, cost) => total + (cost[resourceId] ?? 0),
        0,
      );
      expect(start.resources[resourceId]).toBe(required);
    }
  });

  test("cold boot publishes a playable Hold and villagers fill the stockpile", () => {
    const sim = createAshenGateSim({ seed: 1 });
    const start = sim.snapshot();
    expect(isAshenGateSliceSnapshot(start)).toBe(true);
    expect(start.map).toEqual({ height: 156, width: 252 });
    expect(ui(start).nodes).toHaveLength(16);
    expect(ui(start).nodes?.some((node) => node.x > start.map.width / 2)).toBe(
      true,
    );
    for (const resourceId of RESOURCE_IDS) {
      expect(
        ui(start).nodes?.filter((node) => node.resource === resourceId),
      ).toHaveLength(2);
    }
    expect(ui(start).vents?.length).toBeGreaterThanOrEqual(3);
    expect(ui(start).vents?.length).toBeLessThanOrEqual(4);
    expect(ui(start).wave?.etaSeconds).toBeGreaterThan(30);
    expect(ui(start).objectives?.every((objective) => !objective.done)).toBe(
      true,
    );
    const food = start.resources.food;
    sim.step(30 * TICKS_PER_SECOND);
    expect(sim.snapshot().resources.food).toBe(food);
    putVillagersToWork(sim);
    sim.step(30 * TICKS_PER_SECOND);
    expect(sim.snapshot().resources.food).toBeGreaterThan(food);
    expect(
      ui(sim.snapshot()).objectives?.find((entry) => entry.id === "gather")
        ?.done,
    ).toBe(true);
  });

  test("a Camp rallied on a resource sends new villagers to gather it", () => {
    const sim = createAshenGateSim({ seed: 13 });
    const camp = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (camp === undefined) throw new Error("Missing Camp");
    const startingVillagers = new Set(villagerIds(sim));
    const wood = ui(sim.snapshot()).nodes?.find(
      (node) => node.id === "ashen-wood-near",
    );
    if (wood === undefined) throw new Error("Missing near wood");
    sim.enqueue({
      buildingId: camp.id,
      nodeId: "ashen-wood-near",
      type: "set_rally_point",
      x: wood.x + 0.4,
      y: wood.y - 0.3,
    });
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[camp.id]?.rallyPoint).toEqual({
      nodeId: "ashen-wood-near",
      x: wood.x,
      y: wood.y,
    });
    const woodStock = sim.snapshot().resources.wood ?? 0;
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      type: "train_unit",
    });
    stepUntil(
      sim,
      () => villagerIds(sim).length === startingVillagers.size + 1,
      "villager training",
      25,
    );
    const trainedId = villagerIds(sim).find((id) => !startingVillagers.has(id));
    const trained = () =>
      sim.snapshot().units.find((unit) => unit.id === trainedId) as
        | { preferredNodeId?: string | null }
        | undefined;
    expect(trained()?.preferredNodeId).toBe("ashen-wood-near");
    stepUntil(
      sim,
      () => (sim.snapshot().resources.wood ?? 0) > woodStock,
      "rallied villager delivers wood",
      60,
    );
  });

  test("the Camp queues a villager and sends it to its rally point", () => {
    const sim = createAshenGateSim({ seed: 12 });
    const camp = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (camp === undefined) throw new Error("Missing Camp");
    const startingVillagers = new Set(villagerIds(sim));
    sim.enqueue({
      buildingId: camp.id,
      type: "set_rally_point",
      ...openCellNear(sim, 12, 0),
    });
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      type: "train_unit",
    });
    sim.step(2);
    expect(ui(sim.snapshot()).buildings?.[camp.id]?.trainingQueue).toEqual([
      {
        classId: "villager",
        count: 1,
        id: expect.any(String),
        label: "Villager",
        progress: expect.any(Number),
      },
    ]);
    stepUntil(
      sim,
      () => villagerIds(sim).length === startingVillagers.size + 1,
      "villager training",
      25,
    );
    const trainedId = villagerIds(sim).find((id) => !startingVillagers.has(id));
    expect(trainedId).toBeDefined();
    expect(ui(sim.snapshot()).units?.[trainedId ?? ""]?.task).toBe("Moving");
    expect(birthSounds(sim)).toEqual(["villager"]);
  });

  test("Barracks train one soldier per order and reserve its population", () => {
    const sim = createAshenGateSim({ seed: 2 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    const options = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === barracksId,
    );
    expect(options?.map((option) => option.classId)).toEqual([
      "warden",
      "hunter",
      "rider",
      "raider",
      "breaker",
      "adept",
    ]);
    const popBefore = ui(sim.snapshot()).pop?.used ?? 0;
    const rally = openCellNear(sim, 14, 3);
    sim.enqueue({
      buildingId: barracksId,
      type: "set_rally_point",
      ...rally,
    });
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[barracksId]?.rallyPoint).toEqual(
      rally,
    );
    sim.enqueue({
      buildingId: barracksId,
      classId: "hunter",
      type: "train_unit",
    });
    sim.step(2);
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 1);
    expect(holdCount(sim, "hunter")).toBe(0);
    expect(ui(sim.snapshot()).buildings?.[barracksId]?.activity).toContain(
      "Hunter",
    );
    const queue = ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue;
    expect(queue).toHaveLength(1);
    expect(queue?.[0]).toMatchObject({
      classId: "hunter",
      count: 1,
      id: expect.any(String),
      label: "Hunter",
    });
    expect(queue?.[0]?.progress).toBeGreaterThan(0);
    stepUntil(sim, () => holdCount(sim, "hunter") === 1, "hunter", 30);
    expect(birthSounds(sim)).toEqual(["soldier"]);
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 1);
    const hunterIds = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "hunter")
      .map((unit) => unit.id);
    expect(hunterIds).toHaveLength(1);
    for (const id of hunterIds) {
      expect(slice(sim.snapshot()).combat.bodies[id]?.order).toEqual({
        destination: rally,
        type: "move",
      });
    }
  });

  test("changing formation immediately reforms soldiers in place", () => {
    const sim = createAshenGateSim({ seed: 12 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    sim.enqueue({
      buildingId: barracksId,
      classId: "warden",
      type: "train_unit",
    });
    sim.step(1);
    stepUntil(sim, () => holdCount(sim, "warden") === 2, "second warden", 30);

    const before = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "warden");
    const unitIds = before.map((unit) => unit.id);
    const center = {
      x: before.reduce((total, unit) => total + unit.x, 0) / before.length,
      y: before.reduce((total, unit) => total + unit.y, 0) / before.length,
    };
    sim.enqueue({ formation: "line", type: "set_formation", unitIds });
    sim.step(1);

    const state = slice(sim.snapshot());
    const destinations = unitIds.map((unitId) => {
      const order = state.combat.bodies[unitId]?.order;
      expect(order?.type).toBe("move");
      if (order?.type !== "move") throw new Error("Missing formation move");
      return order.destination;
    });
    expect(destinations[0]).not.toEqual(destinations[1]);
    expect(
      destinations.reduce((total, point) => total + point.x, 0) /
        destinations.length,
    ).toBeCloseTo(center.x, 6);
    expect(
      destinations.reduce((total, point) => total + point.y, 0) /
        destinations.length,
    ).toBeCloseTo(center.y, 6);
    const after = sim.snapshot().units;
    expect(
      before.some((unit) => {
        const moved = after.find((entry) => entry.id === unit.id);
        if (moved === undefined) return false;
        return moved.x !== unit.x || moved.y !== unit.y;
      }),
    ).toBe(true);
  });

  test("a shift-click queues five orders and spends five times the cost", () => {
    const sim = createAshenGateSim({ seed: 8 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    const before = sim.snapshot().resources;
    const popBefore = ui(sim.snapshot()).pop?.used ?? 0;
    sim.enqueue({
      buildingId: barracksId,
      classId: "warden",
      count: 5,
      type: "train_unit",
    });
    sim.step(1);
    const queue = ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue;
    expect(queue).toHaveLength(5);
    expect(
      queue?.every((job) => job.classId === "warden" && job.count === 1),
    ).toBe(true);
    expect(sim.snapshot().resources.food).toBe((before.food ?? 0) - 150);
    expect(sim.snapshot().resources.water).toBe((before.water ?? 0) - 75);
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 5);
  });

  test("a shift-click stops when the queue has room for only part of the five", () => {
    const sim = createAshenGateSim({ seed: 9 });
    putVillagersToWork(sim);
    stepUntil(
      sim,
      () =>
        (sim.snapshot().resources.food ?? 0) >= 200 &&
        (sim.snapshot().resources.water ?? 0) >= 160,
      "resources for queue-capacity test",
      240,
    );
    const camp = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (camp === undefined) throw new Error("Missing Camp");
    for (let batch = 0; batch < 3; batch += 1) {
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        count: 5,
        type: "train_unit",
      });
    }
    for (let index = 0; index < 3; index += 1) {
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        type: "train_unit",
      });
    }
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[camp.id]?.trainingQueue).toHaveLength(
      18,
    );
    const food = sim.snapshot().resources.food;
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      count: 5,
      type: "train_unit",
    });
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[camp.id]?.trainingQueue).toHaveLength(
      20,
    );
    expect(sim.snapshot().resources.food).toBe((food ?? 0) - 20);
    expect(
      ui(sim.snapshot()).notices.some((notice) =>
        notice.text.includes("Queued 2 of 5"),
      ),
    ).toBe(true);
  });

  test("cancelling a queued order refunds it and frees its population", () => {
    const sim = createAshenGateSim({ seed: 6 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    const before = sim.snapshot().resources;
    const popBefore = ui(sim.snapshot()).pop?.used ?? 0;
    for (const classId of ["warden", "hunter"] as const) {
      sim.enqueue({ buildingId: barracksId, classId, type: "train_unit" });
    }
    sim.step(1);
    const queue = ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue;
    expect(queue?.map((job) => job.classId)).toEqual(["warden", "hunter"]);
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 2);
    const queued = queue?.[1];
    if (queued === undefined) throw new Error("Hunter was not queued");
    const afterOrders = sim.snapshot().resources;

    sim.enqueue({
      buildingId: barracksId,
      jobId: queued.id,
      type: "cancel_training",
    });
    sim.step(1);
    const after = sim.snapshot().resources;
    expect(
      ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue?.map(
        (job) => job.classId,
      ),
    ).toEqual(["warden"]);
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 1);
    const hunterCost = { food: 25, water: 20 };
    expect((after.food ?? 0) - (afterOrders.food ?? 0)).toBeGreaterThanOrEqual(
      hunterCost.food,
    );
    expect(
      (after.water ?? 0) - (afterOrders.water ?? 0),
    ).toBeGreaterThanOrEqual(hunterCost.water);
    expect(after.water).toBeLessThan(before.water ?? 0);
  });

  test("cancelling the order in training starts the next one", () => {
    const sim = createAshenGateSim({ seed: 8 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    for (const classId of ["warden", "hunter"] as const) {
      sim.enqueue({ buildingId: barracksId, classId, type: "train_unit" });
    }
    sim.step(20);
    const head = ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue?.[0];
    if (head === undefined) throw new Error("Nothing is training");
    expect(head.classId).toBe("warden");
    sim.enqueue({
      buildingId: barracksId,
      jobId: head.id,
      type: "cancel_training",
    });
    stepUntil(
      sim,
      () => holdCount(sim, "hunter") === 1,
      "hunter after cancel",
      30,
    );
    expect(holdCount(sim, "warden")).toBe(1);
  });

  test("the starting Warden alone clears the scout wave", () => {
    const sim = createAshenGateSim({ seed: 5 });
    putVillagersToWork(sim);
    stepUntil(
      sim,
      () => waves(sim.snapshot()).spawnedWaveIds.length > 0,
      "first wave",
      200,
    );
    stepUntil(
      sim,
      () => waves(sim.snapshot()).units.length === 0,
      "scouts cleared",
      120,
    );
    const captain = sim
      .snapshot()
      .units.find((unit) => unit.id === "ashen-captain");
    expect(captain).toBeDefined();
    expect(slice(sim.snapshot()).stats.kills).toBeGreaterThanOrEqual(2);
  });

  test("defenders kill the scouts and earn merit toward a breakthrough", () => {
    const sim = createAshenGateSim({ seed: 3 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    trainSquad(sim, barracksId, "warden");
    stepUntil(
      sim,
      () => waves(sim.snapshot()).spawnedWaveIds.length > 0,
      "first wave",
      200,
    );
    stepUntil(
      sim,
      () => waves(sim.snapshot()).units.length === 0,
      "scouts cleared",
      120,
    );
    const state = slice(sim.snapshot());
    expect(state.stats.kills).toBeGreaterThan(0);
    const merit = state.cultivation.units.reduce(
      (sum, unit) => sum + unit.merit,
      0,
    );
    expect(merit).toBeGreaterThan(0);
    expect(sim.snapshot().resources.essence).toBeGreaterThan(0);
  });

  test("walls stop the horde until they are broken", () => {
    const sim = createAshenGateSim({ seed: 4 });
    putVillagersToWork(sim);
    const wallColumns = new Set<number>();
    for (let dy = -6; dy <= 6; dy += 1) {
      wallColumns.add(place(sim, "wall", 18, dy).x);
    }
    stepUntil(
      sim,
      () =>
        sim
          .snapshot()
          .buildings.filter((building) => building.buildingType === "wall")
          .every(
            (building) =>
              ui(sim.snapshot()).buildings?.[building.id]?.constructing ===
              false,
          ),
      "walls built",
      240,
    );
    stepUntil(
      sim,
      () => waves(sim.snapshot()).units.length > 0,
      "first wave",
      200,
    );
    sim.step(20 * TICKS_PER_SECOND);
    const horde = waves(sim.snapshot()).units;
    const wallsStanding = sim
      .snapshot()
      .buildings.filter((building) => building.buildingType === "wall").length;
    if (wallsStanding === 13 && wallColumns.size === 1) {
      const [column = 0] = wallColumns;
      expect(horde.every((unit) => unit.x > column - 0.8)).toBe(true);
    }
  });

  test(
    "plays Camp through Cinderjaw, reloads, and ends on victory",
    () => {
      const storage = new MemoryStorage();
      // Seed 8 is a layout this scripted player reaches victory on; the
      // script's fixed build offsets and gather split are seed-sensitive.
      const sim = createAshenGateSim({ seed: 8 });
      attachLayerAutosave(sim, storage);
      sim.step(1);
      expect(readSaveSlot(storage, AUTOSAVE_SLOT)).not.toBeNull();
      putVillagersToWork(sim);

      place(sim, "barracks", 6, 3);
      place(sim, "omen_tower", 9, -3);
      place(sim, "ward_tower", 12, 0);
      const barracksId = completed(sim, "barracks");
      completed(sim, "omen_tower");
      trainSquad(sim, barracksId, "warden");
      trainSquad(sim, barracksId, "hunter");
      stepUntil(
        sim,
        () =>
          ui(sim.snapshot()).omen !== null ||
          waves(sim.snapshot()).spawnedWaveIds.length > 0,
        "Omen preview",
        200,
      );

      for (const classId of ["warden", "hunter", "adept", "warden"] as const) {
        trainSquad(sim, barracksId, classId);
        place(sim, "housing", 2 + holdCount(sim, "warden"), 8);
      }

      const save = sim.serialize();
      const reloaded = createAshenGateSim({ seed: 99 });
      reloaded.load(save);
      expect(reloaded.snapshot().resources).toEqual(sim.snapshot().resources);
      expect(reloaded.snapshot().buildings).toEqual(sim.snapshot().buildings);
      expect(slice(reloaded.snapshot()).cultivation).toEqual(
        slice(sim.snapshot()).cultivation,
      );

      stepUntil(
        sim,
        () =>
          waves(sim.snapshot()).bossGateCleared ||
          slice(sim.snapshot()).outcome !== "playing",
        "Cinderjaw",
        900,
      );
      expect(slice(sim.snapshot()).outcome).toBe("playing");
      expect(
        ui(sim.snapshot()).objectives?.find((entry) => entry.id === "boss")
          ?.done,
      ).toBe(true);

      sim.enqueue({ type: "descend" });
      sim.step(1);
      expect(slice(sim.snapshot()).outcome).toBe("victory");
      expect(ui(sim.snapshot()).outcome?.kind).toBe("victory");
      expect(sim.paused).toBe(true);
      const tick = sim.tick;
      sim.setPaused(false);
      expect(sim.step(5)).toBe(1);
      expect(sim.paused).toBe(true);
      expect(sim.tick).toBe(tick + 1);
    },
    FULL_PLAYTHROUGH_TIMEOUT_MS,
  );

  test("same seed and commands replay identically", () => {
    /**
     * @returns Serialized state after a scripted opening
     */
    const run = () => {
      const sim = createAshenGateSim({ seed: 11 });
      putVillagersToWork(sim);
      place(sim, "barracks", 6, 3);
      sim.step(20 * TICKS_PER_SECOND);
      const barracks = sim
        .snapshot()
        .buildings.find((building) => building.buildingType === "barracks");
      sim.enqueue({
        buildingId: barracks?.id ?? "",
        classId: "raider",
        type: "train_unit",
      });
      sim.step(150 * TICKS_PER_SECOND);
      return sim.serialize();
    };
    expect(run()).toBe(run());
  });
});
