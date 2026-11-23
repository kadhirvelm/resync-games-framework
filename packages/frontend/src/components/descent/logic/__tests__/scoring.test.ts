import { describe, expect, it } from "bun:test";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import { buildShellModel } from "../../views/shellModel";
import { createMultiplayerDescentSim } from "../ashenGateSlice";
import { createBuildingRecord, createUnitRecord } from "../economy/records";
import {
  calculatePlayerScores,
  creditPlayerCultivation,
  creditPlayerMilitary,
  unitResourceValue,
} from "../scoring";
import { TICKS_PER_SECOND } from "../sim/constants";
import { createWorldState, type SimWorldState } from "../sim/world";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  createSliceState,
} from "../slice/sliceState";
import type { WaveClockState } from "../waves/types";

const PLAYERS: readonly AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Aria", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Bram", slotIndex: 1 },
];

/**
 * Creates a minimal multiplayer world with no assets or credited progress.
 * @returns Mutable score-test world
 */
function createScoreWorld(): SimWorldState {
  const world = createWorldState({ seed: 42 });
  const state = createSliceState();
  state.players = Object.fromEntries(
    PLAYERS.map((player) => [player.id, { ...player }]),
  );
  world.meta[ASHEN_GATE_SLICE_MODULE_ID] = state;
  return world;
}

describe("Descent multiplayer scoring", () => {
  it("values only each player's surviving units and completed buildings", () => {
    const world = createScoreWorld();
    world.units.push(
      createUnitRecord({ id: "p1-villager", ownerId: "p1", x: 1, y: 1 }),
      createUnitRecord({
        classId: "warden",
        id: "p1-warden",
        ownerId: "p1",
        x: 2,
        y: 2,
      }),
      createUnitRecord({ id: "p2-villager", ownerId: "p2", x: 3, y: 3 }),
    );
    world.buildings.push(
      createBuildingRecord({
        buildingType: "housing",
        completed: true,
        id: "p1-housing",
        ownerId: "p1",
        x: 4,
        y: 4,
      }),
      createBuildingRecord({
        buildingType: "storehouse",
        completed: false,
        id: "p1-storehouse",
        ownerId: "p1",
        x: 5,
        y: 5,
      }),
      createBuildingRecord({
        buildingType: "camp",
        completed: true,
        id: "p2-camp",
        ownerId: "p2",
        x: 6,
        y: 6,
      }),
    );

    const scores = calculatePlayerScores(world);

    // (18 villager + 45 Warden + 50 Housing) × 20%, rounded.
    expect(scores[0]?.score).toEqual({
      cultivation: 0,
      economy: 23,
      military: 0,
      total: 23,
    });
    // (18 villager + 20 Camp) × 20%, rounded.
    expect(scores[1]?.score).toEqual({
      cultivation: 0,
      economy: 8,
      military: 0,
      total: 8,
    });
  });

  it("accumulates military and cultivation value independently by player", () => {
    const world = createScoreWorld();
    const raiderValue = unitResourceValue("raider");

    creditPlayerMilitary(world, "p1", raiderValue);
    creditPlayerMilitary(world, "p1", raiderValue);
    creditPlayerCultivation(world, "p1", "Ashborn");
    creditPlayerCultivation(world, "p1", "Sworn");
    creditPlayerMilitary(world, "not-in-the-roster", raiderValue);

    expect(calculatePlayerScores(world)[0]?.score).toEqual({
      // Ashborn: 50 essence + 7 materials; Sworn: 150 + 25.
      cultivation: 46,
      economy: 0,
      // Two 45-resource Raiders at 20%.
      military: 18,
      total: 64,
    });
    expect(calculatePlayerScores(world)[1]?.score.total).toBe(0);

    world.units = [];
    expect(calculatePlayerScores(world)[0]?.score).toMatchObject({
      cultivation: 46,
      economy: 0,
      military: 18,
    });
  });

  it("repairs missing score progress from saves made before scoring", () => {
    const world = createScoreWorld();
    const state = world.meta[ASHEN_GATE_SLICE_MODULE_ID] as ReturnType<
      typeof createSliceState
    >;
    delete state.scoreProgress;

    expect(calculatePlayerScores(world)[0]?.score.total).toBe(0);
    creditPlayerMilitary(world, "p2", unitResourceValue("hunter"));

    expect(calculatePlayerScores(world)[1]?.score.military).toBe(9);
  });

  it("attributes a real combat kill to the killing player's military score", () => {
    const sim = createMultiplayerDescentSim({ players: PLAYERS, seed: 778 });
    sim.step(120 * TICKS_PER_SECOND);
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waves = saved.state.meta.waves as WaveClockState;
    const victim = waves.units[0];
    const killer = saved.state.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "cultivator",
    );
    if (!victim || !killer) throw new Error("Missing combat test bodies");

    const before = buildShellModel(sim.snapshot()).players;
    victim.hitPoints = 1;
    victim.x = killer.x + 1;
    victim.y = killer.y;
    sim.load(JSON.stringify(saved));
    sim.enqueue({
      actorId: "p1",
      targetId: victim.id,
      type: "order_attack",
      unitIds: [killer.id],
    });
    sim.step(40);

    const after = buildShellModel(sim.snapshot()).players;
    expect(after[0]?.score.military).toBeGreaterThan(
      before[0]?.score.military ?? 0,
    );
    expect(after[1]?.score.military).toBe(before[1]?.score.military);
  });

  it("keeps military attribution when an Ember burn kills after its source dies", () => {
    const sim = createMultiplayerDescentSim({ players: PLAYERS, seed: 779 });
    sim.step(120 * TICKS_PER_SECOND + 1);
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waves = saved.state.meta.waves as WaveClockState;
    const slice = saved.state.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const victim = waves.units[0];
    const attacker = saved.state.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "cultivator",
    );
    const body = victim ? slice.combat.bodies[victim.id] : undefined;
    if (!victim || !attacker || !body) {
      throw new Error("Missing delayed-burn test bodies");
    }
    expect(slice.combat.owners?.[attacker.id]).toBe("p1");
    const before = buildShellModel(sim.snapshot()).players;

    victim.hitPoints = 1;
    victim.x = 10;
    victim.y = 10;
    body.hitPoints = 1;
    body.position = { x: 10, y: 10 };
    body.statuses.burn = {
      damagePerTick: 10,
      elapsedMs: 950,
      remainingMs: 1_000,
      sourceId: attacker.id,
    };
    saved.state.units = saved.state.units.filter(
      (unit) => unit.id !== attacker.id,
    );
    sim.load(JSON.stringify(saved));
    sim.step(1);

    const after = buildShellModel(sim.snapshot()).players;
    expect(after[0]?.score.military).toBeGreaterThan(
      before[0]?.score.military ?? 0,
    );
    expect(after[1]?.score.military).toBe(before[1]?.score.military);
  });

  it("keeps military attribution when a tower dies after its projectile kills", () => {
    const sim = createMultiplayerDescentSim({ players: PLAYERS, seed: 780 });
    sim.step(120 * TICKS_PER_SECOND + 1);
    const saved = JSON.parse(sim.serialize()) as { state: SimWorldState };
    const waves = saved.state.meta.waves as WaveClockState;
    const slice = saved.state.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const victim = waves.units[0];
    const victimBody = victim ? slice.combat.bodies[victim.id] : undefined;
    if (!victim || !victimBody) throw new Error("Missing tower test target");
    const before = buildShellModel(sim.snapshot()).players;
    const towerId = "p1-tower";
    const towerBodyId = `tower:${towerId}`;
    const tower = createBuildingRecord({
      buildingType: "ward_tower",
      completed: true,
      hp: 1,
      id: towerId,
      ownerId: "p1",
      x: victim.x + 3,
      y: victim.y,
    });
    saved.state.buildings.push(tower);

    const attacker = waves.units[1] ?? structuredClone(victim);
    if (waves.units[1] === undefined) {
      attacker.id = "tower-attacker";
      waves.units.push(attacker);
    }
    attacker.hitPoints = 1_000;
    attacker.maxHitPoints = 1_000;
    attacker.baseMaxHitPoints = 1_000;
    attacker.damage = 1_000;
    attacker.baseDamage = 1_000;
    attacker.x = tower.x + 1;
    attacker.y = tower.y;
    const attackerBody =
      slice.combat.bodies[attacker.id] ?? structuredClone(victimBody);
    attackerBody.id = attacker.id;
    attackerBody.hitPoints = 1_000;
    attackerBody.maxHitPoints = 1_000;
    attackerBody.damage = 1_000;
    attackerBody.attackRange = 10;
    attackerBody.position = { x: attacker.x, y: attacker.y };
    attackerBody.order = { targetId: towerBodyId, type: "attack_target" };
    attackerBody.attackCooldownMs = 0;
    slice.combat.bodies[attacker.id] = attackerBody;
    slice.combat.projectiles = [
      {
        impactTick: slice.combat.tick + 1,
        rawDamage: 1_000,
        sourceId: towerBodyId,
        targetId: victim.id,
      },
    ];

    sim.load(JSON.stringify(saved));
    sim.step(1);

    expect(
      sim.snapshot().buildings.some((building) => building.id === towerId),
    ).toBe(false);
    const after = buildShellModel(sim.snapshot()).players;
    expect(after[0]?.score.military).toBeGreaterThan(
      before[0]?.score.military ?? 0,
    );
    expect(after[1]?.score.military).toBe(before[1]?.score.military);
  });

  it("publishes changing scores through the live co-op shell model", () => {
    const sim = createMultiplayerDescentSim({ players: PLAYERS, seed: 777 });
    const initial = buildShellModel(sim.snapshot()).players;
    const p2Camp = sim
      .snapshot()
      .buildings.find(
        (building) =>
          building.buildingType === "camp" && building.ownerId === "p2",
      );
    if (!p2Camp) throw new Error("Missing player two Camp");

    sim.enqueue({
      actorId: "p2",
      buildingId: p2Camp.id,
      classId: "villager",
      type: "train_unit",
    });
    sim.step(260);

    const updated = buildShellModel(sim.snapshot()).players;
    expect(updated[0]?.score).toEqual(initial[0]?.score);
    expect(updated[1]?.score.economy).toBeGreaterThan(
      initial[1]?.score.economy ?? 0,
    );
    expect(updated[1]?.score.total).toBeGreaterThan(
      initial[1]?.score.total ?? 0,
    );
  });
});
