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
import {
  AUTOSAVE_SLOT,
  attachLayerAutosave,
  readSaveSlot,
  TICKS_PER_SECOND,
} from "../sim";
import type { DescentSim } from "../sim/descentSim";
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
 * Places a building with three builders and runs one tick so the command
 * applies. Builders return to their gather order when the site is done.
 * @param sim - Sim
 * @param buildingType - Building type
 * @param x - Column
 * @param y - Row
 */
function place(sim: DescentSim, buildingType: string, x: number, y: number) {
  sim.enqueue({
    builderIds: villagerIds(sim).slice(0, 3),
    buildingType,
    type: "place_building",
    x,
    y,
  });
  sim.step(1);
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
  test("cold boot publishes a playable Hold and villagers fill the stockpile", () => {
    const sim = createAshenGateSim({ seed: 1 });
    const start = sim.snapshot();
    expect(isAshenGateSliceSnapshot(start)).toBe(true);
    expect(start.map).toEqual({ height: 80, width: 128 });
    expect(ui(start).nodes).toHaveLength(16);
    expect(ui(start).nodes?.some((node) => node.x > 64)).toBe(true);
    for (const resourceId of RESOURCE_IDS) {
      expect(
        ui(start).nodes?.filter((node) => node.resource === resourceId),
      ).toHaveLength(2);
    }
    expect(ui(start).vents).toHaveLength(3);
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
    sim.enqueue({
      buildingId: camp.id,
      nodeId: "ashen-wood-near",
      type: "set_rally_point",
      x: 14.4,
      y: 8.7,
    });
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[camp.id]?.rallyPoint).toEqual({
      nodeId: "ashen-wood-near",
      x: 14,
      y: 9,
    });
    const wood = sim.snapshot().resources.wood ?? 0;
    sim.enqueue({
      buildingId: camp.id,
      classId: "villager",
      type: "train_unit",
    });
    stepUntil(
      sim,
      () => villagerIds(sim).length === startingVillagers.size + 1,
      "villager training",
      15,
    );
    const trainedId = villagerIds(sim).find((id) => !startingVillagers.has(id));
    const trained = () =>
      sim.snapshot().units.find((unit) => unit.id === trainedId) as
        | { preferredNodeId?: string | null }
        | undefined;
    expect(trained()?.preferredNodeId).toBe("ashen-wood-near");
    stepUntil(
      sim,
      () => (sim.snapshot().resources.wood ?? 0) > wood,
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
      x: 35,
      y: 20,
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
      15,
    );
    const trainedId = villagerIds(sim).find((id) => !startingVillagers.has(id));
    expect(trainedId).toBeDefined();
    expect(ui(sim.snapshot()).units?.[trainedId ?? ""]?.task).toBe("Moving");
  });

  test("Barracks train one soldier per order and reserve its population", () => {
    const sim = createAshenGateSim({ seed: 2 });
    putVillagersToWork(sim);
    place(sim, "barracks", 12, 23);
    const barracksId = completed(sim, "barracks");
    const options = ui(sim.snapshot()).trainOptions?.filter(
      (option) => option.buildingId === barracksId,
    );
    expect(options?.map((option) => option.classId)).toEqual([
      "warden",
      "hunter",
      "raider",
      "breaker",
      "adept",
    ]);
    const popBefore = ui(sim.snapshot()).pop?.used ?? 0;
    sim.enqueue({
      buildingId: barracksId,
      type: "set_rally_point",
      x: 40,
      y: 23,
    });
    sim.step(1);
    expect(ui(sim.snapshot()).buildings?.[barracksId]?.rallyPoint).toEqual({
      x: 40,
      y: 23,
    });
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
    expect(ui(sim.snapshot()).pop?.used).toBe(popBefore + 1);
    const hunterIds = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "hunter")
      .map((unit) => unit.id);
    expect(hunterIds).toHaveLength(1);
    for (const id of hunterIds) {
      expect(slice(sim.snapshot()).combat.bodies[id]?.order).toEqual({
        destination: { x: 40, y: 23 },
        type: "move",
      });
    }
  });

  test("a shift-click queues five orders and spends five times the cost", () => {
    const sim = createAshenGateSim({ seed: 8 });
    putVillagersToWork(sim);
    place(sim, "barracks", 12, 23);
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
    place(sim, "barracks", 12, 23);
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
    place(sim, "barracks", 12, 23);
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
    place(sim, "barracks", 12, 23);
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
    for (let y = 14; y <= 26; y += 1) place(sim, "wall", 24, y);
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
    if (wallsStanding === 13) {
      expect(horde.every((unit) => unit.x > 23.2)).toBe(true);
    }
  });

  test(
    "plays Camp through Cinderjaw, reloads, and ends on victory",
    () => {
      const storage = new MemoryStorage();
      const sim = createAshenGateSim({ seed: 7 });
      attachLayerAutosave(sim, storage);
      sim.step(1);
      expect(readSaveSlot(storage, AUTOSAVE_SLOT)).not.toBeNull();
      putVillagersToWork(sim);

      place(sim, "barracks", 12, 23);
      place(sim, "omen_tower", 15, 17);
      place(sim, "ward_tower", 18, 20);
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
        place(sim, "housing", 8 + holdCount(sim, "warden"), 28);
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
      place(sim, "barracks", 12, 23);
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
