import { describe, expect, test } from "bun:test";
import { ASHEN_GATE_STOCKPILE } from "../../../data/layers/ashen_gate/map";
import {
  type ExplorationReadout,
  readPresentation,
} from "../../../views/presentation";
import { buildShellModel } from "../../../views/shellModel";
import {
  type AshenGateSliceState,
  createAshenGateSim,
  isExplorationSnapshot,
} from "../../ashenGateSlice";
import { createBuildingRecord, ensureEconomyMeta } from "../../economy";
import type { EconomyBuilding, EconomyUnit } from "../../economy/model";
import { TICKS_PER_SECOND } from "../../sim";
import type { DescentSim } from "../../sim/descentSim";
import type { SimWorldState } from "../../sim/world";
import type { SimSnapshot } from "../../types";
import { damageWaveUnit, resolveCasualty } from "../../waves/clock";
import type { WaveClockState } from "../../waves/types";
import { formatExplorationReward } from "../model";

/** Reads the normalized exploration readout, failing when the mode is wrong. */
function exploration(sim: DescentSim): ExplorationReadout {
  const value = readPresentation(sim.snapshot().meta).exploration;
  if (value === null) throw new Error("Expected an exploration presentation");
  return value;
}

/**
 * Clears one camp through the ordinary wave casualty path, then advances a
 * tick so its cache spawns. This isolates guard and cache rules from hauling.
 */
function clearCamp(sim: DescentSim, campId: string): void {
  const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
  const waves = serialized.state.meta.waves as WaveClockState;
  const ids = waves.units
    .filter((unit) => unit.waveId === `exploration:${campId}`)
    .map((unit) => unit.id);
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) resolveCasualty(waves, id);
  sim.load(JSON.stringify(serialized));
  sim.step(1);
}

/** Returns the wave clock from a snapshot for fixed-strength assertions. */
function waves(snapshot: SimSnapshot): WaveClockState {
  return snapshot.meta.waves as WaveClockState;
}

/** Reads whether one camp's reward has reached storage. */
function rewardCollected(sim: DescentSim, campId: string): boolean {
  const slice = sim.snapshot().meta["ashenGateSlice"] as AshenGateSliceState;
  const camp = slice.exploration?.camps.find((entry) => entry.id === campId);
  return camp?.rewardCollected === true;
}

/** Checks whether a carrier is currently holding one exploration cache. */
function hasCacheLoad(
  sim: DescentSim,
  unitId: string,
  campId: string,
): boolean {
  const unit = sim.snapshot().units.find((entry) => entry.id === unitId) as
    | EconomyUnit
    | undefined;
  return unit?.carry?.explorationCacheId === campId;
}

/** Returns live carrier ids for one exploration cache. */
function cacheCarrierIds(sim: DescentSim, campId: string): string[] {
  return sim
    .snapshot()
    .units.filter((unit) => hasCacheLoad(sim, unit.id, campId))
    .map((unit) => unit.id);
}

/** Checks whether one resource cache still exists in the live world. */
function cacheNodeExists(sim: DescentSim, nodeId: string): boolean {
  const economy = sim.snapshot().meta.economy as
    | { nodes?: { id: string }[] }
    | undefined;
  return economy?.nodes?.some((node) => node.id === nodeId) ?? false;
}

/**
 * Sends one eligible carrier through every resource cache in a cleared camp.
 * @param sim - Exploration sim with spawned caches
 * @param campId - Camp whose complete prize should be hauled
 * @param unitId - Villager or Qi cultivator doing the work
 * @param teleport - Whether to start each trip beside its cache
 */
function haulCache(
  sim: DescentSim,
  campId: string,
  unitId = "ashen-villager-1",
  teleport = true,
): void {
  const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
  const nodeIds = ensureEconomyMeta(saved.state)
    .nodes.filter((node) => node.explorationCacheId === campId)
    .map((node) => node.id);
  expect(nodeIds.length).toBeGreaterThan(0);
  for (const nodeId of nodeIds) {
    if (teleport) {
      const serialized = JSON.parse(sim.serialize()) as {
        state: SimWorldState;
      };
      const node = ensureEconomyMeta(serialized.state).nodes.find(
        (entry) => entry.id === nodeId,
      );
      const carrier = serialized.state.units.find((unit) => unit.id === unitId);
      if (node === undefined || carrier === undefined) {
        throw new Error(`Missing cache ${nodeId} or carrier ${unitId}`);
      }
      carrier.x = node.x - 1;
      carrier.y = node.y;
      sim.load(JSON.stringify(serialized));
    }
    sim.enqueue({ nodeId, type: "assign_gather", unitIds: [unitId] });
    if (teleport) {
      for (
        let ticks = 0;
        ticks < 600 &&
        cacheNodeExists(sim, nodeId) &&
        !hasCacheLoad(sim, unitId, campId);
        ticks += 10
      ) {
        sim.step(10);
      }
      if (cacheNodeExists(sim, nodeId) && hasCacheLoad(sim, unitId, campId)) {
        const serialized = JSON.parse(sim.serialize()) as {
          state: SimWorldState;
        };
        const dropoff = serialized.state.buildings.find(
          (building) =>
            building.buildingType === "camp" ||
            building.buildingType === "storehouse",
        );
        const carrier = serialized.state.units.find(
          (unit) => unit.id === unitId,
        );
        if (dropoff !== undefined && carrier !== undefined) {
          carrier.x = dropoff.x - 1;
          carrier.y = dropoff.y;
          sim.load(JSON.stringify(serialized));
        }
      }
    }
    for (
      let ticks = 0;
      ticks < 6_000 && cacheNodeExists(sim, nodeId);
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(cacheNodeExists(sim, nodeId)).toBe(false);
  }
  if (!rewardCollected(sim, campId)) sim.step(1);
  expect(rewardCollected(sim, campId)).toBe(true);
  const completed = JSON.parse(sim.serialize()) as { state: SimWorldState };
  expect(
    ensureEconomyMeta(completed.state).nodes.some(
      (node) => node.explorationCacheId === campId,
    ),
  ).toBe(false);
}

describe("exploration camps", () => {
  for (const seed of [1, 7, 19]) {
    test(`seed ${seed} generates six distinct, stationary, fixed-strength camps`, () => {
      const sim = createAshenGateSim({
        mode: "exploration",
        seed,
        waterways: false,
      });
      expect(isExplorationSnapshot(sim.snapshot())).toBe(true);
      const snapshot = sim.snapshot();
      const state = snapshot.meta.ashenGateSlice as {
        exploration: {
          camps: { guards: unknown[]; id: string; x: number; y: number }[];
        };
      };
      expect(state.exploration.camps).toHaveLength(6);
      expect(
        new Set(state.exploration.camps.map((entry) => entry.id)).size,
      ).toBe(6);
      for (const entry of state.exploration.camps) {
        expect(entry.x).toBeGreaterThan(0);
        expect(entry.y).toBeGreaterThan(0);
        expect(entry.x).toBeLessThan(snapshot.map.width - 1);
        expect(entry.y).toBeLessThan(snapshot.map.height - 1);
        expect(entry.guards.length).toBeGreaterThan(0);
      }
      const before = waves(snapshot).units.map((unit) => ({
        damage: unit.damage,
        hitPoints: unit.hitPoints,
        id: unit.id,
        maxHitPoints: unit.maxHitPoints,
        x: unit.x,
        y: unit.y,
      }));
      sim.step(2 * TICKS_PER_SECOND * 70);
      const after = waves(sim.snapshot());
      expect(after.scheduledWaves).toBe(false);
      expect(after.hellPressure).toBe(0);
      expect(after.units.map((unit) => unit.id)).toEqual(
        before.map((unit) => unit.id),
      );
      for (const unit of after.units) {
        const previous = before.find((entry) => entry.id === unit.id);
        if (previous === undefined)
          throw new Error(`Unexpected guard ${unit.id}`);
        expect(unit.damage).toBe(previous.damage);
        expect(unit.hitPoints).toBe(previous.hitPoints);
        expect(unit.maxHitPoints).toBe(previous.maxHitPoints);
        // Body separation may nudge packed guards, but they never march away.
        expect(
          Math.hypot(unit.x - previous.x, unit.y - previous.y),
        ).toBeLessThan(0.75);
      }
    });
  }

  test("rivered maps keep the same quiet exploration rules", () => {
    const sim = createAshenGateSim({ mode: "exploration", seed: 42 });
    expect(exploration(sim).totalCamps).toBe(6);
    sim.step(2 * TICKS_PER_SECOND * 70);
    expect(waves(sim.snapshot()).scheduledWaves).toBe(false);
    expect(waves(sim.snapshot()).hellPressure).toBe(0);
    const presentation = readPresentation(sim.snapshot().meta);
    expect(presentation.boss).toBeNull();
    expect(
      presentation.notices.some((notice) => notice.text.includes("Cinderjaw:")),
    ).toBe(false);
  });

  test("an exploration save continues through the original siege composition", () => {
    const saved = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    }).serialize();
    const continued = createAshenGateSim({ seed: 999, waterways: false });
    continued.load(saved);
    expect(isExplorationSnapshot(continued.snapshot())).toBe(true);
    continued.step(2 * TICKS_PER_SECOND * 70);
    expect(waves(continued.snapshot()).scheduledWaves).toBe(false);
    expect(waves(continued.snapshot()).hellPressure).toBe(0);
    clearCamp(continued, "bound-workers");
    expect(exploration(continued).clearedCamps).toBe(1);
  });

  test("a pulled guard disengages beyond its home leash", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waveState = serialized.state.meta.waves as WaveClockState;
    const guard = waveState.units.find(
      (unit) => unit.guardCampId === "ashen-scavengers",
    );
    const home = guard?.guardHome;
    if (guard === undefined || home === undefined) {
      throw new Error("Missing camp guard home");
    }
    guard.x = home.x + guard.vision * 3;
    guard.y = home.y;
    const worldGuard = serialized.state.units.find(
      (unit) => unit.id === guard.id,
    );
    if (worldGuard === undefined) throw new Error("Missing world guard");
    worldGuard.x = guard.x;
    worldGuard.y = guard.y;
    sim.load(JSON.stringify(serialized));
    const before = Math.hypot(guard.x - home.x, guard.y - home.y);
    sim.step(1);
    const returned = waves(sim.snapshot()).units.find(
      (unit) => unit.id === guard.id,
    );
    if (returned === undefined) throw new Error("Guard disappeared");
    expect(Math.hypot(returned.x - home.x, returned.y - home.y)).toBeLessThan(
      before,
    );
  });

  test("a returning guard does not reacquire until it reaches home", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    sim.step(1);
    const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waveState = serialized.state.meta.waves as WaveClockState;
    const guard = waveState.units.find(
      (unit) => unit.guardCampId === "ashen-scavengers",
    );
    const home = guard?.guardHome;
    if (guard === undefined || home === undefined) {
      throw new Error("Missing camp guard home");
    }
    const leash = Math.max(6, guard.vision * 1.5);
    guard.x = home.x + leash - 0.1;
    guard.y = home.y;
    const worldGuard = serialized.state.units.find(
      (unit) => unit.id === guard.id,
    );
    if (worldGuard === undefined) throw new Error("Missing world guard");
    worldGuard.x = guard.x;
    worldGuard.y = guard.y;
    const slice = serialized.state.meta.ashenGateSlice as {
      combat: { bodies: Record<string, { order?: unknown }> };
    };
    const body = slice.combat.bodies[guard.id];
    if (body === undefined) throw new Error("Missing combat body");
    body.order = { destination: { ...home }, type: "move" };
    const captain = serialized.state.units.find(
      (unit) => unit.id === "ashen-captain",
    );
    if (captain === undefined) throw new Error("Missing Captain");
    captain.x = guard.x + 1;
    captain.y = guard.y;
    sim.load(JSON.stringify(serialized));
    const before = guard.x;
    sim.step(1);
    const returned = waves(sim.snapshot()).units.find(
      (unit) => unit.id === guard.id,
    );
    if (returned === undefined) throw new Error("Guard disappeared");
    expect(returned.x).toBeLessThan(before);
    const nextSlice = sim.snapshot().meta.ashenGateSlice as {
      combat: { bodies: Record<string, { order?: { type: string } }> };
    };
    expect(nextSlice.combat.bodies[guard.id]?.order?.type).toBe("move");
  });

  test("gathering Essence does not secretly scale camp guards", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
    serialized.state.resources.essence = 10_000;
    sim.load(JSON.stringify(serialized));
    sim.step(TICKS_PER_SECOND * 70);
    for (const unit of waves(sim.snapshot()).units) {
      expect(unit.damage).toBe(unit.baseDamage);
      expect(unit.maxHitPoints).toBe(unit.baseMaxHitPoints);
    }
  });

  test("the Captain and Rider can clear the opening camp and break through", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const first = exploration(sim).camps[0];
    if (first === undefined) throw new Error("Missing rumored camp");
    expect(first.threat).toBe(1);
    expect(first.rewardLabel).toContain("+90 Food");
    sim.enqueue({
      type: "order_attack_move",
      unitIds: ["ashen-captain", "ashen-rider"],
      x: first.x,
      y: first.y,
    });
    for (
      let ticks = 0;
      ticks < 40 * TICKS_PER_SECOND && exploration(sim).clearedCamps === 0;
      ticks += 1
    ) {
      sim.step(1);
    }
    expect(exploration(sim).clearedCamps).toBe(1);
    haulCache(sim, first.id);
    expect(sim.snapshot().resources.food).toBe(
      (ASHEN_GATE_STOCKPILE.food ?? 0) + 90,
    );
    expect(sim.snapshot().resources.wood).toBe(
      (ASHEN_GATE_STOCKPILE.wood ?? 0) + 80,
    );
    const captain = buildShellModel(sim.snapshot()).units.find(
      (unit) => unit.id === "ashen-captain",
    );
    expect(captain?.breakthroughReady).toBe(true);
    expect(captain?.cultivation?.merit).toBe(100);
    expect(captain?.cultivation?.essence).toBe(50);
    expect(captain?.cultivation?.combatProof).toBe(3);
    sim.enqueue({ type: "start_breakthrough", unitId: "ashen-captain" });
    sim.step(1);
    const slice = sim.snapshot().meta.ashenGateSlice as {
      cultivation: {
        units: { activeBreakthrough?: unknown; unitId: string }[];
      };
    };
    expect(
      slice.cultivation.units.find((unit) => unit.unitId === "ashen-captain")
        ?.activeBreakthrough,
    ).toBeDefined();
  });

  test("rescued villagers and pills pay once across save/load", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const villagersBefore = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "villager").length;
    clearCamp(sim, "bound-workers");
    haulCache(sim, "bound-workers");
    clearCamp(sim, "pillkeeper-refuge");
    haulCache(sim, "pillkeeper-refuge");
    const villagersAfter = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "villager").length;
    expect(villagersAfter).toBe(villagersBefore + 2);
    let items = ensureEconomyMeta(
      (JSON.parse(sim.serialize()) as { state: SimWorldState }).state,
    ).items;
    expect(items.body_pill).toBe(1);
    expect(items.wind_pill).toBe(1);
    expect(items.ember_dao_pill).toBe(1);

    sim.load(sim.serialize());
    sim.step(100);
    expect(
      sim.snapshot().units.filter((unit) => unit.classId === "villager"),
    ).toHaveLength(villagersAfter);
    items = ensureEconomyMeta(
      (JSON.parse(sim.serialize()) as { state: SimWorldState }).state,
    ).items;
    expect(items.body_pill).toBe(1);
    expect(exploration(sim).clearedCamps).toBe(2);
    const feed = readPresentation(sim.snapshot().meta).pillFeeds.find(
      (entry) => entry.preview.pillId === "body_pill",
    );
    expect(feed?.effectLabel).toBe("+10% maximum health");
  });

  test("military prisoners join cultivation and are not duplicated", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "ashbound-prison");
    haulCache(sim, "ashbound-prison");
    const rescued = sim
      .snapshot()
      .units.filter((unit) => unit.id.startsWith("rescued-"));
    expect(rescued.map((unit) => unit.classId).sort()).toEqual([
      "hunter",
      "sword_sage",
      "warden",
    ]);
    const slice = sim.snapshot().meta.ashenGateSlice as {
      cultivation: { units: { unitId: string }[] };
    };
    for (const unit of rescued) {
      expect(
        slice.cultivation.units.some((record) => record.unitId === unit.id),
      ).toBe(true);
    }
    sim.step(100);
    expect(
      sim.snapshot().units.filter((unit) => unit.id.startsWith("rescued-")),
    ).toHaveLength(3);
  });

  test("a cleared camp spawns one distinct full cache per resource", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "ashen-scavengers");
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const nodes = ensureEconomyMeta(saved.state).nodes.filter(
      (node) => node.explorationCacheId === "ashen-scavengers",
    );
    expect(
      nodes.map((node) => ({
        amount: node.remaining,
        resourceId: node.resourceId,
      })),
    ).toEqual([
      { amount: 90, resourceId: "food" },
      { amount: 60, resourceId: "water" },
      { amount: 80, resourceId: "wood" },
    ]);
    expect(new Set(nodes.map((node) => `${node.x},${node.y}`)).size).toBe(3);
    expect(nodes[0]?.id).toBe("exploration-cache:ashen-scavengers");
    expect(nodes[1]?.id).toBe("exploration-cache:ashen-scavengers:water");
    expect(nodes[2]?.id).toBe("exploration-cache:ashen-scavengers:wood");
  });

  test("a cache pays only after a villager delivers it, then disappears", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const villagersBefore = sim
      .snapshot()
      .units.filter((unit) => unit.classId === "villager").length;
    const foodBefore = sim.snapshot().resources.food;
    const woodBefore = sim.snapshot().resources.wood;
    clearCamp(sim, "bound-workers");
    expect(exploration(sim).pendingCaches).toBe(1);
    expect(sim.snapshot().resources.food).toBe(foodBefore);
    expect(sim.snapshot().resources.wood).toBe(woodBefore);
    expect(
      readPresentation(sim.snapshot().meta).nodes.find(
        (node) => node.explorationCacheId === "bound-workers",
      )?.description,
    ).toContain("Haul to Camp or a Storehouse");

    sim.enqueue({
      nodeId: "exploration-cache:bound-workers",
      type: "assign_gather",
      unitIds: ["ashen-villager-1"],
    });
    for (
      let ticks = 0;
      ticks < 3_000 && !hasCacheLoad(sim, "ashen-villager-1", "bound-workers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-villager-1", "bound-workers")).toBe(true);
    sim.load(sim.serialize());
    expect(sim.snapshot().resources.food).toBe(foodBefore);
    expect(
      ensureEconomyMeta(
        (JSON.parse(sim.serialize()) as { state: SimWorldState }).state,
      ).nodes.some((node) => node.explorationCacheId === "bound-workers"),
    ).toBe(true);

    haulCache(sim, "bound-workers", "ashen-villager-1", false);
    expect(sim.snapshot().resources.food).toBe(foodBefore + 60);
    expect(sim.snapshot().resources.wood).toBe(woodBefore + 60);
    expect(
      sim.snapshot().units.filter((unit) => unit.classId === "villager"),
    ).toHaveLength(villagersBefore + 2);
    expect(exploration(sim).pendingCaches).toBe(0);
    expect(
      exploration(sim).camps.some((camp) => camp.id === "bound-workers"),
    ).toBe(false);
    const hold = sim
      .snapshot()
      .buildings.find((building) => building.buildingType === "camp");
    if (hold === undefined) throw new Error("Missing storage Camp");
    for (const unit of sim
      .snapshot()
      .units.filter((entry) => entry.id.startsWith("rescued-villager"))) {
      expect(Math.hypot(unit.x - hold.x, unit.y - hold.y)).toBeLessThan(10);
    }

    const foodAfter = sim.snapshot().resources.food;
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    ensureEconomyMeta(saved.state).explorationClaims.push({
      campId: "bound-workers",
      dropOffId: "ashen-camp",
    });
    sim.load(JSON.stringify(saved));
    sim.step(1);
    expect(sim.snapshot().resources.food).toBe(foodAfter);
  });

  test("a cultivator can cancel and complete the same cache haul", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "ashen-scavengers");
    const foodBefore = sim.snapshot().resources.food;
    sim.enqueue({
      nodeId: "exploration-cache:ashen-scavengers",
      type: "assign_gather",
      unitIds: ["ashen-captain"],
    });
    for (
      let ticks = 0;
      ticks < 1_000 && !hasCacheLoad(sim, "ashen-captain", "ashen-scavengers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-captain", "ashen-scavengers")).toBe(true);
    let slice = sim.snapshot().meta.ashenGateSlice as {
      combat: { bodies: Record<string, { speed: number }> };
    };
    expect(slice.combat.bodies["ashen-captain"]?.speed).toBe(0);
    expect(
      buildShellModel(sim.snapshot()).units.find(
        (unit) => unit.id === "ashen-captain",
      )?.carrying?.resource,
    ).toBe("food");

    sim.enqueue({
      type: "order_move",
      unitIds: ["ashen-captain"],
      x: 20,
      y: 20,
    });
    sim.step(1);
    expect(
      ensureEconomyMeta(
        (JSON.parse(sim.serialize()) as { state: SimWorldState }).state,
      ).nodes.some((node) => node.explorationCacheId === "ashen-scavengers"),
    ).toBe(true);
    expect(sim.snapshot().resources.food).toBe(foodBefore);

    // With no standing job, resumeOrderedWork must still resume the carried load.
    for (
      let ticks = 0;
      ticks < 6_000 && hasCacheLoad(sim, "ashen-captain", "ashen-scavengers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-captain", "ashen-scavengers")).toBe(false);
    expect(rewardCollected(sim, "ashen-scavengers")).toBe(false);
    haulCache(sim, "ashen-scavengers", "ashen-captain");
    expect(sim.snapshot().resources.food).toBe(foodBefore + 90);
    slice = sim.snapshot().meta.ashenGateSlice as {
      combat: { bodies: Record<string, { speed: number }> };
    };
    expect(slice.combat.bodies["ashen-captain"]?.speed).toBeGreaterThan(0);
  });

  test("in-flight stock is reserved and released when a carrier dies", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "bound-workers");
    sim.enqueue({
      nodeId: "exploration-cache:bound-workers",
      type: "assign_gather",
      unitIds: ["ashen-villager-1", "ashen-villager-2"],
    });
    for (
      let ticks = 0;
      ticks < 1_500 && cacheCarrierIds(sim, "bound-workers").length === 0;
      ticks += 10
    ) {
      sim.step(10);
    }
    const carriers = cacheCarrierIds(sim, "bound-workers");
    expect(carriers).toHaveLength(1);
    const carrierId = carriers[0];
    if (!carrierId) return;
    const otherId =
      carrierId === "ashen-villager-1"
        ? "ashen-villager-2"
        : "ashen-villager-1";

    sim.enqueue({ type: "disband_units", unitIds: [carrierId] });
    sim.step(1);
    haulCache(sim, "bound-workers", otherId);
    expect(sim.snapshot().resources.food).toBe(
      (ASHEN_GATE_STOCKPILE.food ?? 0) + 60,
    );
    expect(sim.snapshot().resources.wood).toBe(
      (ASHEN_GATE_STOCKPILE.wood ?? 0) + 60,
    );
    expect(
      sim.snapshot().units.filter((unit) => unit.classId === "villager"),
    ).toHaveLength(4);
  });

  test("different resource caches keep independent reservations across save/load", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "ashen-scavengers");
    const before = sim.snapshot().resources;
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const economy = ensureEconomyMeta(saved.state);
    const food = economy.nodes.find(
      (node) => node.id === "exploration-cache:ashen-scavengers",
    );
    const water = economy.nodes.find(
      (node) => node.id === "exploration-cache:ashen-scavengers:water",
    );
    const first = saved.state.units.find(
      (unit) => unit.id === "ashen-villager-1",
    );
    const second = saved.state.units.find(
      (unit) => unit.id === "ashen-villager-2",
    );
    if (
      food === undefined ||
      water === undefined ||
      first === undefined ||
      second === undefined
    ) {
      throw new Error("Missing independent-cache fixture");
    }
    first.x = food.x - 1;
    first.y = food.y;
    second.x = water.x - 1;
    second.y = water.y;
    sim.load(JSON.stringify(saved));
    sim.enqueue({
      nodeId: food.id,
      type: "assign_gather",
      unitIds: [first.id],
    });
    sim.enqueue({
      nodeId: water.id,
      type: "assign_gather",
      unitIds: [second.id],
    });
    for (
      let ticks = 0;
      ticks < 500 &&
      !(
        hasCacheLoad(sim, first.id, "ashen-scavengers") &&
        hasCacheLoad(sim, second.id, "ashen-scavengers")
      );
      ticks += 10
    ) {
      sim.step(10);
    }
    const loaded = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const loadedFirst = loaded.state.units.find(
      (unit) => unit.id === first.id,
    ) as EconomyUnit | undefined;
    const loadedSecond = loaded.state.units.find(
      (unit) => unit.id === second.id,
    ) as EconomyUnit | undefined;
    expect(loadedFirst?.carry).toMatchObject({
      amount: 90,
      explorationCacheNodeId: food.id,
      resourceId: "food",
    });
    expect(loadedSecond?.carry).toMatchObject({
      amount: 60,
      explorationCacheNodeId: water.id,
      resourceId: "water",
    });
    const hold = loaded.state.buildings.find(
      (building) => building.buildingType === "camp",
    );
    if (
      hold === undefined ||
      loadedFirst === undefined ||
      loadedSecond === undefined
    ) {
      throw new Error("Missing independent-delivery fixture");
    }
    loadedFirst.x = hold.x + 4;
    loadedFirst.y = hold.y;
    loadedSecond.x = hold.x + 4;
    loadedSecond.y = hold.y + 1;
    sim.load(JSON.stringify(loaded));
    sim.enqueue({
      buildingId: hold.id,
      type: "assign_build",
      unitIds: [first.id, second.id],
    });
    sim.step(10);
    expect(sim.snapshot().resources.food).toBe(before.food + 90);
    expect(sim.snapshot().resources.water).toBe(before.water + 60);
    expect(sim.snapshot().resources.wood).toBe(before.wood);
    expect(rewardCollected(sim, "ashen-scavengers")).toBe(false);
    const delivered = JSON.parse(sim.serialize()) as { state: SimWorldState };
    expect(
      ensureEconomyMeta(delivered.state).nodes.map((node) => node.id),
    ).toContain("exploration-cache:ashen-scavengers:wood");
    sim.load(sim.serialize());
    sim.step(100);
    expect(sim.snapshot().resources.food).toBe(before.food + 90);
    expect(sim.snapshot().resources.water).toBe(before.water + 60);
    haulCache(sim, "ashen-scavengers");
  });

  test("a cache waits intact without storage and resumes when storage returns", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "bound-workers");
    const foodBefore = sim.snapshot().resources.food;
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const hold = saved.state.buildings.find(
      (building) => building.buildingType === "camp",
    ) as EconomyBuilding | undefined;
    const node = ensureEconomyMeta(saved.state).nodes.find(
      (entry) => entry.id === "exploration-cache:bound-workers",
    );
    const carrier = saved.state.units.find(
      (unit) => unit.id === "ashen-villager-1",
    );
    if (hold === undefined || node === undefined || carrier === undefined) {
      throw new Error("Missing unreachable-storage fixture");
    }
    for (let offset = -4; offset <= 4; offset += 1) {
      for (const point of [
        { x: hold.x + offset, y: hold.y - 4 },
        { x: hold.x + offset, y: hold.y + 4 },
        { x: hold.x - 4, y: hold.y + offset },
        { x: hold.x + 4, y: hold.y + offset },
      ]) {
        saved.state.buildings.push(
          createBuildingRecord({
            buildingType: "wall",
            completed: true,
            id: `cache-blocker-${point.x}-${point.y}`,
            x: point.x,
            y: point.y,
          }),
        );
      }
    }
    carrier.x = node.x - 1;
    carrier.y = node.y;
    sim.load(JSON.stringify(saved));
    sim.enqueue({
      nodeId: node.id,
      type: "assign_gather",
      unitIds: [carrier.id],
    });
    for (
      let ticks = 0;
      ticks < 500 && !hasCacheLoad(sim, carrier.id, "bound-workers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, carrier.id, "bound-workers")).toBe(true);
    expect(sim.snapshot().resources.food).toBe(foodBefore);
    let current = JSON.parse(sim.serialize()) as { state: SimWorldState };
    expect(
      ensureEconomyMeta(current.state).nodes.find(
        (entry) => entry.id === node.id,
      )?.remaining,
    ).toBe(60);
    expect(ensureEconomyMeta(current.state).explorationClaims).toHaveLength(0);

    const restored = JSON.parse(sim.serialize()) as { state: SimWorldState };
    restored.state.buildings = restored.state.buildings.filter(
      (building) => !building.id.startsWith("cache-blocker-"),
    );
    sim.load(JSON.stringify(restored));
    for (
      let ticks = 0;
      ticks < 3_000 && cacheNodeExists(sim, node.id);
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(cacheNodeExists(sim, node.id)).toBe(false);
    expect(sim.snapshot().resources.food).toBe(foodBefore + 60);
    expect(rewardCollected(sim, "bound-workers")).toBe(false);
    current = JSON.parse(sim.serialize()) as { state: SimWorldState };
    expect(ensureEconomyMeta(current.state).explorationClaims).toHaveLength(0);
    haulCache(sim, "bound-workers");
  });

  test("shelter delivery uses the cache claim without minting Essence", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "bound-workers");
    sim.enqueue({
      nodeId: "exploration-cache:bound-workers",
      type: "assign_gather",
      unitIds: ["ashen-villager-1"],
    });
    for (
      let ticks = 0;
      ticks < 3_000 && !hasCacheLoad(sim, "ashen-villager-1", "bound-workers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-villager-1", "bound-workers")).toBe(true);
    const essenceBefore = sim.snapshot().resources.essence;
    sim.enqueue({ type: "recall_villagers" });
    for (
      let ticks = 0;
      ticks < 3_000 && hasCacheLoad(sim, "ashen-villager-1", "bound-workers");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-villager-1", "bound-workers")).toBe(false);
    expect(rewardCollected(sim, "bound-workers")).toBe(false);
    expect(sim.snapshot().resources.essence).toBe(essenceBefore);
    sim.enqueue({ type: "release_villagers" });
    sim.step(1);
    haulCache(sim, "bound-workers");
    expect(rewardCollected(sim, "bound-workers")).toBe(true);
    expect(sim.snapshot().resources.essence).toBe(essenceBefore);
  });

  test("crowded storage cannot spawn rescued units in invalid cells", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "ashbound-prison");
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const hold = saved.state.buildings.find(
      (building) => building.buildingType === "camp",
    ) as EconomyBuilding | undefined;
    if (hold === undefined) throw new Error("Missing storage Camp");
    saved.state.buildings.push(
      createBuildingRecord({
        buildingType: "storehouse",
        completed: true,
        id: "crowded-storehouse",
        x: hold.x + 25,
        y: hold.y,
      }),
    );
    hold.completed = false;
    for (let y = hold.y - 6; y <= hold.y + 6; y += 1) {
      for (let x = hold.x - 6; x <= hold.x + 6; x += 1) {
        saved.state.buildings.push(
          createBuildingRecord({
            buildingType: "wall",
            completed: true,
            id: `crowded-wall-${x}-${y}`,
            x,
            y,
          }),
        );
      }
    }
    sim.load(JSON.stringify(saved));
    const node = ensureEconomyMeta(saved.state).nodes.find(
      (entry) => entry.id === "exploration-cache:ashbound-prison",
    );
    const carrier = saved.state.units.find(
      (unit) => unit.id === "ashen-villager-1",
    );
    const storehouse = saved.state.buildings.find(
      (building) => building.id === "crowded-storehouse",
    );
    if (
      node === undefined ||
      carrier === undefined ||
      storehouse === undefined
    ) {
      throw new Error("Missing crowded-delivery fixture");
    }
    carrier.x = node.x - 1;
    carrier.y = node.y;
    sim.load(JSON.stringify(saved));
    sim.enqueue({
      nodeId: "exploration-cache:ashbound-prison",
      type: "assign_gather",
      unitIds: ["ashen-villager-1"],
    });
    for (
      let ticks = 0;
      ticks < 500 && !hasCacheLoad(sim, "ashen-villager-1", "ashbound-prison");
      ticks += 10
    ) {
      sim.step(10);
    }
    expect(hasCacheLoad(sim, "ashen-villager-1", "ashbound-prison")).toBe(true);
    const delivery = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const loadedCarrier = delivery.state.units.find(
      (unit) => unit.id === "ashen-villager-1",
    );
    if (loadedCarrier === undefined) throw new Error("Missing loaded carrier");
    loadedCarrier.x = storehouse.x - 1;
    loadedCarrier.y = storehouse.y;
    sim.load(JSON.stringify(delivery));
    sim.enqueue({
      buildingId: storehouse.id,
      type: "assign_build",
      unitIds: ["ashen-villager-1"],
    });
    sim.step(10);
    expect(rewardCollected(sim, "ashbound-prison")).toBe(true);
    const rescued = sim
      .snapshot()
      .units.filter((unit) => unit.id.startsWith("rescued-"));
    expect(rescued.length).toBeGreaterThan(0);
    const walls = sim
      .snapshot()
      .buildings.filter((building) => building.buildingType === "wall");
    for (const unit of rescued) {
      expect(unit.x).toBeGreaterThanOrEqual(0);
      expect(unit.y).toBeGreaterThanOrEqual(0);
      expect(unit.x).toBeLessThan(sim.snapshot().map.width);
      expect(unit.y).toBeLessThan(sim.snapshot().map.height);
      expect(
        walls.some(
          (wall) => Math.hypot(wall.x - unit.x, wall.y - unit.y) < 0.8,
        ),
      ).toBe(false);
    }
  });

  test("boss reinforcements defend the hoard and gate its prize until cleared", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waveState = serialized.state.meta.waves as WaveClockState;
    const boss = waveState.units.find((unit) => unit.role === "boss");
    if (boss === undefined) throw new Error("Missing Cinderjaw");
    damageWaveUnit(waveState, boss.id, boss.maxHitPoints * 0.51, "spell");
    const slice = serialized.state.meta.ashenGateSlice as {
      exploration: { camps: { discovered: boolean; id: string }[] };
    };
    for (const entry of slice.exploration.camps) {
      if (entry.id === "cinderjaw-hoard") entry.discovered = true;
    }
    sim.load(JSON.stringify(serialized));
    sim.step(3 * TICKS_PER_SECOND + 1);

    const imps = waves(sim.snapshot()).units.filter(
      (unit) => unit.role === "vent_imp",
    );
    expect(imps).toHaveLength(4);
    for (const imp of imps) {
      expect(imp.guardCampId).toBe("cinderjaw-hoard");
      expect(imp.guardHome).toBeDefined();
    }
    let hoard = exploration(sim).camps.find(
      (entry) => entry.id === "cinderjaw-hoard",
    );
    expect(hoard?.guardsRemaining).toBe(6);
    expect(hoard?.guardsTotal).toBe(6);
    expect(hoard?.reinforcements).toBe(4);

    sim.load(sim.serialize());
    sim.step(1);
    for (const imp of waves(sim.snapshot()).units.filter(
      (unit) => unit.role === "vent_imp",
    )) {
      expect(imp.guardCampId).toBe("cinderjaw-hoard");
      expect(imp.guardHome).toBeDefined();
    }

    const bossKill = JSON.parse(sim.serialize()) as { state: SimWorldState };
    resolveCasualty(bossKill.state.meta.waves as WaveClockState, boss.id);
    sim.load(JSON.stringify(bossKill));
    sim.step(1);
    expect(waves(sim.snapshot()).bossGateCleared).toBe(true);
    expect(readPresentation(sim.snapshot().meta).bossGateCleared).toBe(false);
    expect(exploration(sim).bossDefeated).toBe(true);
    sim.enqueue({ type: "descend" });
    sim.step(1);
    expect(readPresentation(sim.snapshot().meta).outcome).toBeNull();

    clearCamp(sim, "cinderjaw-hoard");
    expect(readPresentation(sim.snapshot().meta).bossGateCleared).toBe(false);
    haulCache(sim, "cinderjaw-hoard");
    expect(readPresentation(sim.snapshot().meta).bossGateCleared).toBe(true);
    hoard = exploration(sim).camps.find(
      (entry) => entry.id === "cinderjaw-hoard",
    );
    expect(hoard).toBeUndefined();
    sim.enqueue({ type: "descend" });
    sim.step(1);
    expect(readPresentation(sim.snapshot().meta).outcome?.kind).toBe("victory");
  });

  test("Cinderjaw's camp opens the finish action and grants the final rescue", () => {
    const sim = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    });
    clearCamp(sim, "cinderjaw-hoard");
    haulCache(sim, "cinderjaw-hoard");
    expect(waves(sim.snapshot()).bossGateCleared).toBe(true);
    expect(
      sim
        .snapshot()
        .units.some(
          (unit) =>
            unit.id.startsWith("rescued-") &&
            unit.classId === "formation_master",
        ),
    ).toBe(true);
    sim.enqueue({ type: "descend" });
    sim.step(1);
    const presentation = readPresentation(sim.snapshot().meta);
    expect(presentation.outcome?.kind).toBe("victory");
    expect(presentation.outcome?.title).toBe("Expedition complete");
    expect(presentation.outcome?.body).toContain("1/6 guarded camps");
  });

  test("reward copy includes resources, pills, and rescued allies", () => {
    expect(
      formatExplorationReward({
        pills: { body_pill: 1 },
        resources: { food: 25 },
        units: [{ classId: "villager", count: 2 }],
      }),
    ).toBe("+25 Food · Body Pill · Rescue 2 Villagers");
  });
});

describe("timed siege forecast", () => {
  test("publishes the next countdown without an Omen Tower and shows scaling", () => {
    const sim = createAshenGateSim({ seed: 7, waterways: false });
    let presentation = readPresentation(sim.snapshot().meta);
    expect(presentation.omen).toBeNull();
    expect(presentation.wave?.etaSeconds).toBe(120);
    expect(presentation.wave?.label).toBe("Scouts");
    expect(presentation.wave?.powerLabel).toBe("Base enemy strength");

    const serialized = JSON.parse(sim.serialize()) as { state: SimWorldState };
    serialized.state.resources.essence = 125;
    sim.load(JSON.stringify(serialized));
    sim.step(1);
    presentation = readPresentation(sim.snapshot().meta);
    expect(presentation.wave?.powerLabel).toContain("+50% enemy stats");
    expect(presentation.wave?.powerLabel).toContain("Essence +50%");
  });
});
