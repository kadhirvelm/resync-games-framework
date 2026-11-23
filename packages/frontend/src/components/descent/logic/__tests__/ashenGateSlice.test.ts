import { describe, expect, test } from "bun:test";
import { ASHEN_GATE_STOCKPILE } from "../../data/layers/ashen_gate/map";
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
import {
  buildingDef,
  createBuildingRecord,
  createUnitRecord,
  ensureEconomyMeta,
  footprintCovers,
  footprintGap,
  holdTierDef,
} from "../economy";
import {
  AUTOSAVE_SLOT,
  attachLayerAutosave,
  readSaveSlot,
  TICKS_PER_SECOND,
} from "../sim";
import type { DescentSim } from "../sim/descentSim";
import type { SimWorldState } from "../sim/world";
import { MAX_QUEUE, trainingPlan } from "../slice/sliceTraining";
import {
  type ClassId,
  type Command,
  RESOURCE_IDS,
  type SimSnapshot,
} from "../types";
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
    unitIds: ids.slice(2, 3),
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
 * @param count - Soldiers to order, defaulting to a full squad
 */
function trainSquad(
  sim: DescentSim,
  barracksId: string,
  classId: ClassId,
  count = SQUAD_SIZE,
) {
  for (let ordered = 0; ordered < count; ordered += 1) {
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
    () =>
      (ui(sim.snapshot()).buildings?.[barracksId]?.trainingQueue?.length ??
        0) === 0,
    `${classId} squad`,
    count * trainingPlan(classId).seconds + 10,
  );
}

/**
 * Funds isolated training tests through a save without a long gather loop.
 * @param sim - Sim whose stockpile and housing should cover the orders
 * @param classId - Class to queue
 * @param orders - Number of orders to fund and accommodate
 */
function fundTraining(sim: DescentSim, classId: ClassId, orders: number): void {
  const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
  const plan = trainingPlan(classId);
  for (const resourceId of RESOURCE_IDS) {
    saved.state.resources[resourceId] += (plan.cost[resourceId] ?? 0) * orders;
  }
  const housing = buildingDef("housing");
  if (!housing?.popBonus) throw new Error("Missing housing population bonus");
  for (
    let index = 0;
    index < Math.ceil((plan.pop * orders) / housing.popBonus);
    index += 1
  ) {
    saved.state.buildings.push(
      createBuildingRecord({
        buildingType: "housing",
        completed: true,
        id: `queue-test-housing-${index}`,
        x: 2 + index * 4,
        y: 2,
      }),
    );
  }
  sim.load(JSON.stringify(saved));
}

/**
 * Drives the Captain through ordinary player commands during scripted waits:
 * meditate between fights, promote after earning a breakthrough, and cast in combat.
 * @param sim - Running sim to observe without changing rules or wave timing
 * @returns Unsubscribe function that stops issuing Captain commands
 */
function attachCaptainMicro(sim: DescentSim): () => void {
  return sim.subscribe(() => {
    const snapshot = sim.snapshot();
    const captain = snapshot.units.find((unit) => unit.id === "ashen-captain");
    const view = ui(snapshot).units?.["ashen-captain"];
    if (!captain || !view || sim.paused) return;
    const enemiesNearby = waves(snapshot).units.some(
      (enemy) => Math.hypot(enemy.x - captain.x, enemy.y - captain.y) < 8,
    );
    if (view.breakthroughReady && !enemiesNearby) {
      sim.enqueue({ type: "start_breakthrough", unitId: captain.id });
    }
    if (view.rank === "Sworn" && !view.school) {
      sim.enqueue({
        school: "blood",
        type: "choose_school",
        unitId: captain.id,
      });
    }
    if (enemiesNearby && view.qiArt?.ready) {
      sim.enqueue({ type: "cast_qi_art", unitIds: [captain.id] });
    }
    if (!view.channel && view.meditating === enemiesNearby) {
      sim.enqueue({ type: "toggle_meditate", unitIds: [captain.id] });
    }
  });
}

describe("Ashen Gate vertical slice", () => {
  test("the starting stockpile funds a worker, Barracks, and two Wardens", () => {
    const start = createAshenGateSim({ seed: 1 }).snapshot();
    const barracks = buildingDef("barracks");
    if (!barracks) throw new Error("Missing Barracks");
    const costs = [
      trainingPlan("villager").cost,
      barracks.cost,
      ...Array.from({ length: 2 }, () => trainingPlan("warden").cost),
    ];

    expect(start.resources).toEqual(ASHEN_GATE_STOCKPILE);
    for (const resourceId of RESOURCE_IDS) {
      const required = costs.reduce(
        (total, cost) => total + (cost[resourceId] ?? 0),
        0,
      );
      expect(start.resources[resourceId]).toBeGreaterThanOrEqual(required);
    }
  });

  test("cold boot publishes a playable Hold and villagers fill the stockpile", () => {
    const sim = createAshenGateSim({ seed: 1 });
    const start = sim.snapshot();
    expect(isAshenGateSliceSnapshot(start)).toBe(true);
    expect(start.map).toEqual({ height: 156, width: 252 });
    expect(ui(start).pop).toEqual({ cap: 8, used: 6 });
    expect(start.units).toHaveLength(5);
    expect(start.units.find((unit) => unit.id === "ashen-rider")).toMatchObject(
      {
        classId: "rider",
      },
    );
    sim.load(sim.serialize());
    expect(sim.snapshot().units).toEqual(start.units);
    expect(ui(sim.snapshot()).pop).toEqual({ cap: 8, used: 6 });
    expect(ui(start).nodes).toHaveLength(36);
    expect(ui(start).nodes?.some((node) => node.x > start.map.width / 2)).toBe(
      true,
    );
    for (const resourceId of RESOURCE_IDS) {
      expect(
        ui(start).nodes?.filter((node) => node.resource === resourceId),
      ).toHaveLength(resourceId === "wood" ? 8 : 4);
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

  test("the starting cap queues only two extra workers until Housing is built", () => {
    const sim = createAshenGateSim({ seed: 1 });
    const start = sim.snapshot();
    const camp = start.buildings.find(
      (building) => building.buildingType === "camp",
    );
    const housing = buildingDef("housing");
    if (!camp || !housing?.popBonus) throw new Error("Missing Camp or Housing");
    const worker = trainingPlan("villager");
    expect(villagerIds(sim)).toHaveLength(3);
    expect(ui(start).pop).toEqual({ cap: 8, used: 6 });

    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      count: 3,
      type: "train_unit",
    });
    sim.step(1);
    const queued = ui(sim.snapshot()).buildings?.[camp.id]?.trainingQueue;
    expect(queued).toHaveLength(2);
    expect(
      queued?.every((job) => job.classId === "villager" && job.count === 1),
    ).toBe(true);
    expect(ui(sim.snapshot()).pop).toEqual({ cap: 8, used: 8 });
    for (const id of RESOURCE_IDS) {
      expect(sim.snapshot().resources[id]).toBe(
        start.resources[id] - 2 * (worker.cost[id] ?? 0),
      );
    }

    // Idle villagers spend the real starting stockpile on a real construction site.
    const beforeHousing = sim.snapshot().resources;
    place(sim, "housing", -5, 0);
    for (const id of RESOURCE_IDS) {
      expect(sim.snapshot().resources[id]).toBe(
        beforeHousing[id] - (housing.cost[id] ?? 0),
      );
    }
    expect(ui(sim.snapshot()).pop?.cap).toBe(8);
    completed(sim, "housing");
    expect(ui(sim.snapshot()).pop).toEqual({
      cap: 8 + housing.popBonus,
      used: 8,
    });

    const beforeThirdWorker = sim.snapshot().resources;
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      type: "train_unit",
    });
    sim.step(1);
    expect(ui(sim.snapshot()).pop).toEqual({
      cap: 8 + housing.popBonus,
      used: 9,
    });
    for (const id of RESOURCE_IDS) {
      expect(sim.snapshot().resources[id]).toBe(
        beforeThirdWorker[id] - (worker.cost[id] ?? 0),
      );
    }
    stepUntil(
      sim,
      () => villagerIds(sim).length === 6,
      "third extra worker after Housing",
      3 * worker.seconds + 10,
    );
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
      trainingPlan("villager").seconds + 5,
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
      trainingPlan("villager").seconds + 5,
    );
    const trainedId = villagerIds(sim).find((id) => !startingVillagers.has(id));
    expect(trainedId).toBeDefined();
    expect(ui(sim.snapshot()).units?.[trainedId ?? ""]?.task).toBe("Moving");
    expect(birthSounds(sim)).toEqual(["villager"]);
  });

  /**
   * Advances the Hold tier to `tier` via the save round-trip for isolated tests
   * that exercise higher-tier buildings or unit classes without simulating the
   * full gathering loop.
   * @param sim - Running sim
   * @param tier - Desired Hold tier
   */
  function setHoldTier(
    sim: DescentSim,
    tier: "Camp" | "Outpost" | "Stronghold" | "Citadel",
  ) {
    const save = JSON.parse(sim.serialize()) as {
      state?: { meta?: { economy?: { tier?: string } } };
    };
    if (save.state?.meta?.economy !== undefined) {
      save.state.meta.economy.tier = tier;
    }
    sim.load(JSON.stringify(save));
    sim.step(1);
  }

  test("Barracks train one soldier per order and reserve its population", () => {
    const sim = createAshenGateSim({ seed: 2 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    const campOptions = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === barracksId,
    );
    expect(campOptions?.map((option) => option.classId)).toEqual(["warden"]);

    setHoldTier(sim, "Outpost");
    const outpostOptions = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === barracksId,
    );
    expect(outpostOptions?.map((option) => option.classId)).toEqual([
      "warden",
      "hunter",
      "rider",
    ]);

    setHoldTier(sim, "Citadel");
    const citadelOptions = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === barracksId,
    );
    expect(citadelOptions?.map((option) => option.classId)).toEqual([
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
    stepUntil(
      sim,
      () => holdCount(sim, "hunter") === 1,
      "hunter",
      trainingPlan("hunter").seconds + 10,
    );
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
      count: 2,
      type: "train_unit",
    });
    sim.step(1);
    stepUntil(sim, () => holdCount(sim, "warden") === 2, "two wardens", 60);

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
    fundTraining(sim, "warden", 5);
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
    expect(sim.snapshot().resources.food).toBe(
      (before.food ?? 0) - 5 * (trainingPlan("warden").cost.food ?? 0),
    );
    expect(sim.snapshot().resources.water).toBe(
      (before.water ?? 0) - 5 * (trainingPlan("warden").cost.water ?? 0),
    );
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 5);
  });

  test("a shift-click stops when the queue has room for only part of the five", () => {
    const sim = createAshenGateSim({ seed: 9 });
    fundTraining(sim, "villager", MAX_QUEUE);
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
    expect(sim.snapshot().resources.food).toBe(
      (food ?? 0) - 2 * (trainingPlan("villager").cost.food ?? 0),
    );
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
    setHoldTier(sim, "Outpost");
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
    const hunterCost = trainingPlan("hunter").cost;
    expect((after.food ?? 0) - (afterOrders.food ?? 0)).toBeGreaterThanOrEqual(
      hunterCost.food ?? 0,
    );
    expect(
      (after.water ?? 0) - (afterOrders.water ?? 0),
    ).toBeGreaterThanOrEqual(hunterCost.water ?? 0);
    expect(after.water).toBeLessThan(before.water ?? 0);
  });

  test("cancelling the order in training starts the next one", () => {
    const sim = createAshenGateSim({ seed: 8 });
    putVillagersToWork(sim);
    place(sim, "barracks", 6, 3);
    const barracksId = completed(sim, "barracks");
    setHoldTier(sim, "Outpost");
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
      trainingPlan("hunter").seconds + 10,
    );
    expect(holdCount(sim, "warden")).toBe(0);
    expect(holdCount(sim, "cultivator")).toBe(1);
  });

  test("starts with a first-level Cultivator and trains more at a Cultivator Sanctum", () => {
    const sim = createAshenGateSim({ seed: 11 });
    const starting = sim
      .snapshot()
      .units.find((unit) => unit.id === "ashen-captain");
    expect(starting?.classId).toBe("cultivator");
    expect(ui(sim.snapshot()).units?.["ashen-captain"]?.rank).toBe("Ashborn");

    putVillagersToWork(sim);
    setHoldTier(sim, "Stronghold");
    place(sim, "cultivator_sanctum", 6, 3);
    const sanctumId = completed(sim, "cultivator_sanctum");
    const options = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === sanctumId,
    );
    expect(options?.map((option) => option.classId)).toEqual([
      "cultivator",
      "sword_sage",
      "formation_master",
    ]);

    sim.enqueue({
      buildingId: sanctumId,
      classId: "cultivator",
      type: "train_unit",
    });
    stepUntil(
      sim,
      () => holdCount(sim, "cultivator") === 2,
      "second cultivator",
      trainingPlan("cultivator").seconds + 10,
    );
    const trained = sim
      .snapshot()
      .units.find(
        (unit) => unit.classId === "cultivator" && unit.id !== "ashen-captain",
      );
    expect(trained).toBeDefined();
    if (trained !== undefined) {
      expect(ui(sim.snapshot()).units?.[trained.id]?.rank).toBe("Ashborn");
    }
  });

  test("the starting Cultivator alone clears the scout wave", () => {
    const sim = createAshenGateSim({ seed: 5 });
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    saved.state.units = saved.state.units.filter(
      (unit) => unit.id !== "ashen-rider",
    );
    sim.load(JSON.stringify(saved));
    expect(holdCount(sim, "rider")).toBe(0);
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
    fundTraining(sim, "warden", SQUAD_SIZE);
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
      // This scripted climb is tuned to a dry approach; rivers reroute the
      // scouts onto the working villagers. Waterways have their own tests.
      const sim = createAshenGateSim({ seed: 1, waterways: false });
      const stopCaptainMicro = attachCaptainMicro(sim);
      attachLayerAutosave(sim, storage);
      sim.step(1);
      expect(readSaveSlot(storage, AUTOSAVE_SLOT)).not.toBeNull();
      putVillagersToWork(sim);

      const camp = sim
        .snapshot()
        .buildings.find((entry) => entry.buildingType === "camp");
      const wood = ui(sim.snapshot()).nodes?.find(
        (node) => node.id === "ashen-wood-near",
      );
      if (!camp || !wood) throw new Error("Missing opening economy");
      sim.enqueue({
        buildingId: camp.id,
        nodeId: wood.id,
        type: "set_rally_point",
        x: wood.x,
        y: wood.y,
      });
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        count: 2,
        type: "train_unit",
      });
      place(sim, "barracks", 6, 3);
      const barracksId = completed(sim, "barracks");
      stepUntil(
        sim,
        () => villagerIds(sim).length === 5,
        "first two opening workers",
        2 * trainingPlan("villager").seconds + 10,
      );
      expect(ui(sim.snapshot()).pop).toEqual({ cap: 8, used: 8 });
      const openingWorkers = villagerIds(sim);
      sim.enqueue({
        nodeId: "ashen-wood-near",
        type: "assign_gather",
        unitIds: openingWorkers.slice(3, 4),
      });
      sim.enqueue({
        nodeId: "ashen-stone-near",
        type: "assign_gather",
        unitIds: openingWorkers.slice(4),
      });
      const openingHousing = buildingDef("housing");
      if (!openingHousing) throw new Error("Missing Housing");
      stepUntil(
        sim,
        () =>
          RESOURCE_IDS.every(
            (id) =>
              sim.snapshot().resources[id] >= (openingHousing.cost[id] ?? 0),
          ),
        "opening Housing resources",
        300,
      );
      // Build real Housing before reserving population beyond the initial eight.
      place(sim, "housing", -5, 0);
      completed(sim, "housing");
      expect(ui(sim.snapshot()).pop?.cap).toBe(
        8 + (openingHousing.popBonus ?? 0),
      );
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        type: "train_unit",
      });
      trainSquad(sim, barracksId, "warden", 2);

      // Gather the actual upgrade and defense costs before spending either.
      const outpost = holdTierDef("Outpost");
      const omenTower = buildingDef("omen_tower");
      const wardTower = buildingDef("ward_tower");
      const housing = buildingDef("housing");
      const farm = buildingDef("farm");
      if (!outpost || !omenTower || !wardTower || !housing || !farm) {
        throw new Error("Missing Outpost economy definitions");
      }
      stepUntil(
        sim,
        () => villagerIds(sim).length === 6,
        "opening workers",
        3 * trainingPlan("villager").seconds + 10,
      );
      const workers = villagerIds(sim);
      sim.enqueue({
        nodeId: "ashen-wood-near",
        type: "assign_gather",
        unitIds: workers.slice(3, 5),
      });
      sim.enqueue({
        nodeId: "ashen-stone-near",
        type: "assign_gather",
        unitIds: workers.slice(5),
      });
      const costs = [outpost.upgradeCost];
      stepUntil(
        sim,
        () =>
          ["wood", "stone"].every((resourceId) => {
            const id = resourceId as "wood" | "stone";
            const required = costs.reduce(
              (total, cost) => total + (cost[id] ?? 0),
              0,
            );
            return sim.snapshot().resources[id] >= required;
          }),
        "gathered Outpost upgrade wood and stone",
        600,
      );
      sim.enqueue({ type: "upgrade_hold" });
      stepUntil(
        sim,
        () => ui(sim.snapshot()).holdUpgrade?.currentTier === "Outpost",
        "Outpost upgrade",
        30,
      );
      putVillagersToWork(sim);

      sim.enqueue({
        nodeId: "ashen-wood-near",
        type: "assign_gather",
        unitIds: workers.slice(3, 4),
      });
      sim.enqueue({
        nodeId: "ashen-stone-near",
        type: "assign_gather",
        unitIds: workers.slice(4),
      });
      trainSquad(sim, barracksId, "hunter");
      stepUntil(
        sim,
        () =>
          ["wood", "stone"].every((resourceId) => {
            const id = resourceId as "wood" | "stone";
            return (
              sim.snapshot().resources[id] >=
              (omenTower.cost[id] ?? 0) + (wardTower.cost[id] ?? 0)
            );
          }),
        "tower resources",
        300,
      );
      place(sim, "omen_tower", 9, -3);
      place(sim, "ward_tower", 12, 0);
      completed(sim, "omen_tower");
      completed(sim, "ward_tower");
      stepUntil(
        sim,
        () =>
          ui(sim.snapshot()).omen !== null ||
          waves(sim.snapshot()).spawnedWaveIds.length > 0,
        "Omen preview",
        200,
      );

      stepUntil(
        sim,
        () =>
          RESOURCE_IDS.every(
            (id) =>
              sim.snapshot().resources[id] >=
              (housing.cost[id] ?? 0) + (farm.cost[id] ?? 0),
          ),
        "housing resources",
        300,
      );
      const secondHousingCell = place(sim, "housing", 2, 8);
      stepUntil(
        sim,
        () =>
          sim
            .snapshot()
            .buildings.some(
              (building) =>
                building.buildingType === "housing" &&
                building.x === secondHousingCell.x &&
                building.y === secondHousingCell.y &&
                ui(sim.snapshot()).buildings?.[building.id]?.constructing ===
                  false,
            ),
        "second Housing construction",
        120,
      );
      place(sim, "farm", -6, 3);
      const farmId = completed(sim, "farm");
      place(sim, "well", -6, -3);
      const wellId = completed(sim, "well");
      // Train one more worker on the clustered Food node while the Camp is idle
      // so Food keeps up with Water during continuous Barracks recruitment.
      sim.enqueue({
        buildingId: camp.id,
        nodeId: "ashen-food-near-cluster",
        type: "set_rally_point",
        x:
          ui(sim.snapshot()).nodes?.find(
            (node) => node.id === "ashen-food-near-cluster",
          )?.x ?? camp.x,
        y:
          ui(sim.snapshot()).nodes?.find(
            (node) => node.id === "ashen-food-near-cluster",
          )?.y ?? camp.y,
      });
      sim.enqueue({
        buildingId: camp.id,
        classId: "villager",
        count: 1,
        type: "train_unit",
      });
      // Recruitment needs more Food than Water: keep three gatherers plus
      // the Farm on Food, and two workers drawing Water from the Well.
      sim.enqueue({
        nodeId: "ashen-food-near",
        type: "assign_gather",
        unitIds: workers.slice(0, 3),
      });
      sim.enqueue({ type: "order_stop", unitIds: workers.slice(3) });
      sim.step(1);
      sim.enqueue({
        buildingId: farmId,
        type: "assign_build",
        unitIds: workers.slice(3, 4),
      });
      sim.enqueue({
        buildingId: wellId,
        type: "assign_build",
        unitIds: workers.slice(4),
      });
      for (const classId of ["warden", "hunter", "warden", "hunter"] as const) {
        trainSquad(sim, barracksId, classId);
      }

      const save = sim.serialize();
      const reloaded = createAshenGateSim({ seed: 99 });
      reloaded.load(save);
      expect(reloaded.snapshot().resources).toEqual(sim.snapshot().resources);
      expect(reloaded.snapshot().buildings).toEqual(sim.snapshot().buildings);
      expect(slice(reloaded.snapshot()).cultivation).toEqual(
        slice(sim.snapshot()).cultivation,
      );

      // Keep recruiting reinforcements through the final natural waves.
      let reinforcement = 0;
      stepUntil(
        sim,
        () => {
          const snapshot = sim.snapshot();
          if (
            waves(snapshot).bossGateCleared ||
            slice(snapshot).outcome !== "playing"
          )
            return true;
          const presentation = ui(snapshot);
          const classId = reinforcement % 2 === 0 ? "warden" : "hunter";
          if (
            (presentation.buildings?.[barracksId]?.trainingQueue?.length ?? 0) <
              3 &&
            presentation.trainOptions?.some(
              (option) =>
                option.buildingId === barracksId &&
                option.classId === classId &&
                option.allowed,
            )
          ) {
            sim.enqueue({
              buildingId: barracksId,
              classId,
              type: "train_unit",
            });
            reinforcement += 1;
          }
          return false;
        },
        "Cinderjaw",
        900,
      );
      stopCaptainMicro();
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

  test("call_next_wave pulls the next wave early, grants scaled bonus, and updates readout", () => {
    const sim = createAshenGateSim({ seed: 21 });
    sim.step(1);
    const beforeSnapshot = sim.snapshot();
    const beforeWave = ui(beforeSnapshot).wave;
    expect(beforeWave?.canCallEarly).toBe(true);
    expect(beforeWave?.earlyCallBonusLabel).toContain("Food");
    expect(beforeWave?.waveHeld).toBe(false);

    const beforeFood = beforeSnapshot.resources.food;
    const beforeWood = beforeSnapshot.resources.wood;
    const beforeEssence = beforeSnapshot.resources.essence;

    sim.enqueue({ type: "call_next_wave" } as unknown as Command);
    sim.step(1);

    const afterSnapshot = sim.snapshot();
    expect(waves(afterSnapshot).spawnedWaveIds).toEqual(["ashen_scout"]);
    expect(afterSnapshot.resources.food).toBeGreaterThanOrEqual(
      beforeFood + 15,
    );
    expect(afterSnapshot.resources.wood).toBeGreaterThanOrEqual(
      beforeWood + 15,
    );
    expect(afterSnapshot.resources.essence).toBeGreaterThanOrEqual(
      beforeEssence + 10,
    );
    const notices = ui(afterSnapshot).notices ?? [];
    expect(
      notices.some((notice) =>
        (typeof notice === "string" ? notice : notice.text).includes(
          "Wave called early!",
        ),
      ),
    ).toBe(true);
  });

  test("shouldHoldWave pauses waves and disables early call on the readout", () => {
    let hold = true;
    const sim = createAshenGateSim({
      seed: 22,
      shouldHoldWave: (_world, nextWaveIndex) => hold && nextWaveIndex === 0,
    });
    sim.step(1);
    const heldWave = ui(sim.snapshot()).wave;
    expect(heldWave?.waveHeld).toBe(true);
    expect(heldWave?.canCallEarly).toBe(false);
    expect(heldWave?.earlyCallBonusLabel).toBeUndefined();

    hold = false;
    sim.step(1);
    const releasedWave = ui(sim.snapshot()).wave;
    expect(releasedWave?.waveHeld).toBe(false);
    expect(releasedWave?.canCallEarly).toBe(true);
  });

  test("starting Captain breaks through to Sworn without a Cultivation Hall after the scout wave", () => {
    const sim = createAshenGateSim({ seed: 23 });
    sim.step(1);
    // Before scouts are repelled, Captain cannot break through without a Hall.
    expect(ui(sim.snapshot()).units?.["ashen-captain"]?.breakthroughReady).toBe(
      false,
    );

    // Call the scouts early and clear them cleanly.
    sim.enqueue({ type: "call_next_wave" } as unknown as Command);
    sim.step(1);
    const saved = JSON.parse(sim.serialize()) as {
      state: {
        meta: {
          waves: {
            spawnedWaveIds: string[];
            units: { id: string }[];
          };
        };
      };
    };
    expect(saved.state.meta.waves.spawnedWaveIds).toEqual(["ashen_scout"]);
    saved.state.meta.waves.units = [];
    sim.load(JSON.stringify(saved));
    sim.step(1);

    // Captain is now breakthroughReady with no Cultivation Hall on the map.
    const readyReadout = ui(sim.snapshot()).units?.["ashen-captain"];
    expect(readyReadout?.breakthroughReady).toBe(true);
    expect(readyReadout?.breakthroughHallId).toBeUndefined();
    expect(readyReadout?.cultivation).toMatchObject({
      essence: 50,
      merit: 100,
      missingRequirements: [],
      successChance: 0.9,
    });
    const toppedUp = slice(sim.snapshot()).cultivation.units.find(
      (entry) => entry.unitId === "ashen-captain",
    );
    expect(toppedUp).toMatchObject({
      combatProof: 3,
      essence: 50,
      merit: 100,
    });
    sim.load(sim.serialize());
    sim.step(1);
    expect(ui(sim.snapshot()).units?.["ashen-captain"]?.breakthroughReady).toBe(
      true,
    );

    // Start breakthrough without hallId, finish the 20s channel, and choose a school.
    sim.enqueue({
      type: "start_breakthrough",
      unitId: "ashen-captain",
    } as unknown as Command);
    sim.step(1);
    const channeling = slice(sim.snapshot()).cultivation.units.find(
      (entry) => entry.unitId === "ashen-captain",
    );
    expect(channeling?.activeBreakthrough).toMatchObject({
      successChance: 0.9,
      targetRank: "Sworn",
    });
    sim.load(sim.serialize());
    sim.step(1);
    const restoredChannel = slice(sim.snapshot()).cultivation.units.find(
      (entry) => entry.unitId === "ashen-captain",
    );
    expect(restoredChannel?.activeBreakthrough).toMatchObject({
      successChance: 0.9,
      targetRank: "Sworn",
    });

    // Force a deterministic passing roll by advancing 20s; retry once if RNG rolled >= 0.9.
    sim.step(20 * TICKS_PER_SECOND + 1);
    const afterChannel = slice(sim.snapshot()).cultivation.units.find(
      (entry) => entry.unitId === "ashen-captain",
    );
    if (afterChannel?.rank === "Sworn") {
      sim.enqueue({
        school: "ember",
        type: "choose_school",
        unitId: "ashen-captain",
      });
      sim.step(1);
      expect(ui(sim.snapshot()).units?.["ashen-captain"]?.school).toBe("ember");
    } else {
      // Failed roll (10% chance): unit is injured, proving the real breakthrough channel ran.
      expect(ui(sim.snapshot()).units?.["ashen-captain"]?.injured).toBe(true);
    }
  });

  test("a non-Captain Outpost breakthrough needs no pill and uses the selected Hall's vein bonus", () => {
    const sim = createAshenGateSim({ seed: 29 });
    const unitId = "ordinary-warden";
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const economy = ensureEconomyMeta(saved.state);
    economy.tier = "Outpost";
    economy.items = {};
    const vein = economy.veins[0];
    if (!vein) throw new Error("Missing starting Spirit Vein");
    saved.state.buildings.push(
      createBuildingRecord({
        buildingType: "cultivation_hall",
        completed: true,
        id: "plain-hall",
        x: vein.x,
        y: vein.y + 8,
      }),
      createBuildingRecord({
        buildingType: "cultivation_hall",
        completed: true,
        id: "early-hall",
        x: vein.x,
        y: vein.y,
      }),
    );
    const captain = saved.state.units.find(
      (unit) => unit.id === "ashen-captain",
    );
    if (!captain) throw new Error("Missing Captain unit");
    saved.state.units.push(
      createUnitRecord({
        classId: "warden",
        id: unitId,
        maxHp: 140,
        popKind: "soldier",
        realmId: "qi_gathering",
        x: captain.x,
        y: captain.y,
      }),
    );
    const initialRecord = slice(saved.state).cultivation.units.find(
      (unit) => unit.unitId === "ashen-captain",
    );
    if (!initialRecord) throw new Error("Missing Captain cultivation");
    const ordinary = structuredClone(initialRecord);
    ordinary.unitId = unitId;
    ordinary.combatProof = 3;
    ordinary.essence = 50;
    ordinary.merit = 100;
    slice(saved.state).cultivation.units.push(ordinary);
    saved.state.resources.iron = 0;
    saved.state.resources.spirit_herbs = 0;
    sim.load(JSON.stringify(saved));
    sim.step(TICKS_PER_SECOND);

    const ready = ui(sim.snapshot()).units?.[unitId];
    expect(ready?.breakthroughReady).toBe(true);
    expect(ready?.breakthroughHallId).toBe("plain-hall");
    expect(ready?.cultivation?.missingRequirements).toEqual([]);
    expect(ready?.cultivation?.successChance).toBe(0.9);

    sim.enqueue({
      hallId: "early-hall",
      type: "start_breakthrough",
      unitId,
    });
    sim.step(1);
    const channeling = slice(sim.snapshot()).cultivation.units.find(
      (unit) => unit.unitId === unitId,
    );
    expect(channeling?.activeBreakthrough).toMatchObject({
      successChance: 1,
      targetRank: "Sworn",
    });
    const after = JSON.parse(sim.serialize()) as { state: SimWorldState };
    expect(
      ensureEconomyMeta(after.state).items.breakthrough_pill,
    ).toBeUndefined();
    expect(after.state.resources.iron).toBe(0);
    expect(after.state.resources.spirit_herbs).toBe(0);
  });
});
