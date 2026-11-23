import { describe, expect, it } from "bun:test";
import type { AshenCruciblePlayer } from "../../data/layers/ashen_crucible";
import { buildCardButtons } from "../../views/card";
import { buildConfirm } from "../../views/confirm";
import { buildShellModel } from "../../views/shellModel";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createMultiplayerDescentSim,
} from "../ashenGateSlice";
import type { EconomyBuilding } from "../economy/model";
import { asUnit, createBuildingRecord } from "../economy/records";
import type { AshenGateSliceState } from "../slice/sliceState";
import { getWave } from "../waves/catalog";
import { secondsToWaveTicks } from "../waves/constants";
import type { WaveClockState } from "../waves/types";

const FOUR_PLAYERS: AshenCruciblePlayer[] = [
  { color: "#f2c14e", id: "p1", name: "Aria", slotIndex: 0 },
  { color: "#4db8ff", id: "p2", name: "Bram", slotIndex: 1 },
  { color: "#4be38a", id: "p3", name: "Cora", slotIndex: 2 },
  { color: "#c678ff", id: "p4", name: "Dax", slotIndex: 3 },
];

describe("Descent multiplayer co-op simulation", () => {
  it("spawns separate owned sets of units for up to 4 players with distinct ring colors", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS,
      seed: 9001,
    });
    const model = buildShellModel(sim.snapshot());

    expect(model.players).toHaveLength(4);
    expect(
      model.buildings.filter((b) => b.buildingType === "camp"),
    ).toHaveLength(4);

    for (const player of FOUR_PLAYERS) {
      const units = model.units.filter((unit) => unit.ownerId === player.id);
      expect(units).toHaveLength(4);
      for (const unit of units) {
        expect(unit.factionId).toBe("hold");
        expect(unit.ownerColor).toBe(player.color);
        expect(unit.ownerName).toBe(player.name);
      }
    }
  });

  it("prevents friendly fire between allied players and enforces command ownership", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS.slice(0, 2),
      seed: 1042,
    });
    const before = sim.snapshot();
    const p1Captain = before.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "cultivator",
    );
    const p2Captain = before.units.find(
      (unit) => unit.ownerId === "p2" && unit.classId === "cultivator",
    );
    expect(p1Captain).toBeDefined();
    expect(p2Captain).toBeDefined();
    if (!p1Captain || !p2Captain) return;

    const p2StartPos = { x: p2Captain.x, y: p2Captain.y };
    const p2StartHp = asUnit(p2Captain).hp;

    // Player 1 tries to move Player 2's captain (must be ignored).
    sim.enqueue({
      actorId: "p1",
      type: "order_move",
      unitIds: [p2Captain.id],
      x: p2Captain.x + 15,
      y: p2Captain.y,
    });
    // Player 1 tries to attack Player 2's captain (co-op: must not deal damage).
    sim.enqueue({
      actorId: "p1",
      targetId: p2Captain.id,
      type: "order_attack",
      unitIds: [p1Captain.id],
    });
    // Player 1 moves their own captain toward Player 2's captain.
    sim.enqueue({
      actorId: "p1",
      type: "order_move",
      unitIds: [p1Captain.id],
      x: p2Captain.x + 1,
      y: p2Captain.y,
    });

    sim.step(60);

    const after = sim.snapshot();
    const p2After = after.units.find((unit) => unit.id === p2Captain.id);
    expect(p2After).toBeDefined();
    if (!p2After) return;
    expect(asUnit(p2After).hp).toBe(p2StartHp);
    expect(p2After.x).toBe(p2StartPos.x);
    expect(p2After.y).toBe(p2StartPos.y);
  });

  it("assigns newly trained units to the owning player of the training building", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS.slice(0, 2),
      seed: 777,
    });
    const snap = sim.snapshot();
    const p2Camp = snap.buildings.find(
      (building) =>
        building.buildingType === "camp" && building.ownerId === "p2",
    );
    expect(p2Camp).toBeDefined();
    if (!p2Camp) return;

    // Player 1 cannot train from Player 2's Camp.
    sim.enqueue({
      actorId: "p1",
      buildingId: p2Camp.id,
      classId: "villager",
      type: "train_unit",
    });
    sim.step(5);
    expect(
      sim.snapshot().units.filter((unit) => unit.ownerId === "p2"),
    ).toHaveLength(4);

    // Player 2 trains a villager from Player 2's Camp.
    sim.enqueue({
      actorId: "p2",
      buildingId: p2Camp.id,
      classId: "villager",
      type: "train_unit",
    });
    sim.step(260);
    const p2Units = sim
      .snapshot()
      .units.filter((unit) => unit.ownerId === "p2");
    expect(p2Units).toHaveLength(5);
    const model = buildShellModel(sim.snapshot());
    for (const unit of model.units.filter((u) => u.ownerId === "p2")) {
      expect(unit.ownerColor).toBe("#4db8ff");
    }
  });

  it("does not allow a player to command unowned Horde bodies", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS.slice(0, 2),
      seed: 2024,
    });
    let snapshot = sim.snapshot();
    let horde = snapshot.units.find((unit) => unit.ownerId === undefined);
    for (let attempt = 0; attempt < 150 && !horde; attempt += 1) {
      sim.step(20);
      snapshot = sim.snapshot();
      horde = snapshot.units.find((unit) => unit.ownerId === undefined);
    }
    expect(horde).toBeDefined();
    if (!horde) return;

    sim.enqueue({
      actorId: "p1",
      type: "order_move",
      unitIds: [horde.id],
      x: horde.x - 20,
      y: horde.y,
    });
    sim.step(1);

    const afterSlice = sim.snapshot().meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const afterOrder = afterSlice.combat.bodies[horde.id]?.order;
    const hasForbiddenMove =
      afterOrder?.type === "move" &&
      afterOrder.destination.x === horde.x - 20 &&
      afterOrder.destination.y === horde.y;
    expect(hasForbiddenMove).toBe(false);
  });

  it("limits recall and release commands to the issuing player's villagers", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS.slice(0, 2),
      seed: 91,
    });
    sim.enqueue({ actorId: "p1", type: "recall_villagers" });
    sim.step(1);

    const recalled = sim.snapshot().units;
    for (const unit of recalled) {
      if (unit.classId !== "villager") continue;
      if (unit.ownerId === "p1") {
        expect(asUnit(unit).task?.kind).toBe("garrison");
      } else {
        expect(asUnit(unit).task).toBeNull();
      }
    }

    sim.enqueue({ actorId: "p1", type: "release_villagers" });
    sim.step(1);
    for (const unit of sim.snapshot().units) {
      if (unit.classId === "villager") expect(asUnit(unit).task).toBeNull();
    }
  });

  it("uses the acting player's Halls and ration recipients in the UI contract", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS.slice(0, 2),
      seed: 314,
    });
    const saved = JSON.parse(sim.serialize()) as {
      state: { buildings: EconomyBuilding[] };
    };
    const p2Hall = createBuildingRecord({
      buildingType: "cultivation_hall",
      completed: true,
      id: "p2-cultivation-hall",
      ownerId: "p2",
      x: 30,
      y: 30,
    });
    const p1Hall = createBuildingRecord({
      buildingType: "cultivation_hall",
      completed: true,
      id: "p1-cultivation-hall",
      ownerId: "p1",
      x: 40,
      y: 40,
    });
    const p1MessHall = createBuildingRecord({
      buildingType: "mess_hall",
      completed: true,
      id: "p1-mess-hall",
      ownerId: "p1",
      x: 42,
      y: 42,
    });
    const p2MessHall = createBuildingRecord({
      buildingType: "mess_hall",
      completed: true,
      id: "p2-mess-hall",
      ownerId: "p2",
      x: 50,
      y: 50,
    });
    saved.state.buildings.push(p2Hall, p1Hall, p1MessHall, p2MessHall);
    sim.load(JSON.stringify(saved));
    sim.step(1);

    const model = buildShellModel(sim.snapshot());
    const p1Captain = model.units.find(
      (unit) => unit.ownerId === "p1" && unit.classId === "cultivator",
    );
    if (!p1Captain?.cultivation) throw new Error("Missing captain cultivation");
    p1Captain.cultivation = {
      ...p1Captain.cultivation,
      missingRequirements: [],
    };
    const confirmation = buildConfirm(
      model,
      { type: "breakthrough", unitId: p1Captain.id },
      1,
    );
    expect(confirmation.command).toMatchObject({
      hallId: p1Hall.id,
      type: "start_breakthrough",
      unitId: p1Captain.id,
    });

    const p2Rations = model.rationOptions.find(
      (option) => option.messHallId === p2MessHall.id,
    );
    expect(p2Rations?.unitIds).toHaveLength(1);
    expect(p2Rations?.unitIds[0]).toContain("crucible-captain-2");
    const rationConfirmation = buildConfirm(
      model,
      { messHallId: p2MessHall.id, type: "rations" },
      1,
    );
    expect(rationConfirmation.command).toMatchObject({
      messHallId: p2MessHall.id,
      type: "issue_rations",
      unitIds: p2Rations?.unitIds,
    });

    const ownButtons = buildCardButtons(
      model,
      { buildingId: p1MessHall.id, unitIds: [] },
      null,
      "ranks",
      "p1",
    );
    expect(ownButtons.some((button) => button.intent.type === "rations")).toBe(
      true,
    );
    const alliedButtons = buildCardButtons(
      model,
      { buildingId: p2MessHall.id, unitIds: [] },
      null,
      "ranks",
      "p1",
    );
    expect(
      alliedButtons.some((button) => button.intent.type === "rations"),
    ).toBe(false);
  });

  it("spreads incoming enemies evenly across the allied Camps", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS,
      seed: 7007,
    });
    const saved = JSON.parse(sim.serialize()) as {
      state: { meta: { waves: WaveClockState } };
    };
    saved.state.meta.waves.layerStartedTick = -secondsToWaveTicks(
      getWave("ashen_swarm").spawnAtSeconds,
    );
    sim.load(JSON.stringify(saved));
    // Waves spawn after combat in the tick pipeline; the next tick gives
    // those bodies their march orders.
    sim.step(2);

    const snapshot = sim.snapshot();
    const state = snapshot.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const campOwners = new Map(
      snapshot.buildings
        .filter((building) => building.buildingType === "camp")
        .map((camp) => [`${camp.x},${camp.y}`, camp.ownerId]),
    );
    const attackedPlayers = new Map(
      FOUR_PLAYERS.map((player) => [player.id, 0]),
    );
    const waveIds = new Set(
      (snapshot.meta.waves as WaveClockState).units.map((unit) => unit.id),
    );
    for (const body of Object.values(state.combat.bodies)) {
      if (!waveIds.has(body.id) || body.order?.type !== "attack_move") {
        continue;
      }
      const { x, y } = body.order.destination;
      const ownerId = campOwners.get(`${x},${y}`);
      expect(ownerId).toBeDefined();
      if (ownerId === undefined) continue;
      attackedPlayers.set(ownerId, (attackedPlayers.get(ownerId) ?? 0) + 1);
    }

    const counts = [...attackedPlayers.values()];
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(7);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("keeps Camp assignments stable and rebalances orphaned enemies", () => {
    const players = FOUR_PLAYERS.slice(0, 3);
    const sim = createMultiplayerDescentSim({ players, seed: 7008 });
    const saved = JSON.parse(sim.serialize()) as {
      state: {
        buildings: EconomyBuilding[];
        meta: { waves: WaveClockState };
      };
    };
    saved.state.meta.waves.layerStartedTick = -secondsToWaveTicks(
      getWave("ashen_swarm").spawnAtSeconds,
    );
    sim.load(JSON.stringify(saved));
    sim.step(2);

    const initial = sim.snapshot().meta.waves as WaveClockState;
    const initialTargets = Object.fromEntries(
      initial.units.map((unit) => [unit.id, unit.rallyTargetId]),
    );
    expect(Object.values(initialTargets).every(Boolean)).toBe(true);
    sim.step(3);
    const settled = sim.snapshot().meta.waves as WaveClockState;
    expect(settled.units.map((unit) => [unit.id, unit.rallyTargetId])).toEqual(
      Object.entries(initialTargets),
    );

    const destroyedCampId = initial.units[0]?.rallyTargetId;
    expect(destroyedCampId).toBeDefined();
    const withDestroyedCamp = JSON.parse(sim.serialize()) as typeof saved;
    withDestroyedCamp.state.buildings =
      withDestroyedCamp.state.buildings.filter(
        (building) => building.id !== destroyedCampId,
      );
    sim.load(JSON.stringify(withDestroyedCamp));
    sim.step(1);

    const rebalancedSnapshot = sim.snapshot();
    const rebalanced = rebalancedSnapshot.meta.waves as WaveClockState;
    const combat = rebalancedSnapshot.meta[
      ASHEN_GATE_SLICE_MODULE_ID
    ] as AshenGateSliceState;
    const remainingCamps = new Map(
      rebalancedSnapshot.buildings
        .filter((building) => building.buildingType === "camp")
        .map((camp) => [camp.id, camp]),
    );
    const remainingCampIds = new Set(remainingCamps.keys());
    const counts = new Map([...remainingCampIds].map((campId) => [campId, 0]));
    for (const unit of rebalanced.units) {
      expect(unit.rallyTargetId).not.toBe(destroyedCampId);
      expect(unit.rallyTargetId).toBeDefined();
      if (unit.rallyTargetId === undefined) continue;
      expect(remainingCampIds.has(unit.rallyTargetId)).toBe(true);
      const camp = remainingCamps.get(unit.rallyTargetId);
      expect(camp).toBeDefined();
      const order = combat.combat.bodies[unit.id]?.order;
      expect(order?.type).toBe("attack_move");
      if (order?.type === "attack_move") {
        expect(order.destination).toEqual({ x: camp?.x, y: camp?.y });
      }
      counts.set(unit.rallyTargetId, (counts.get(unit.rallyTargetId) ?? 0) + 1);
      if (initialTargets[unit.id] !== destroyedCampId) {
        expect(unit.rallyTargetId).toBe(initialTargets[unit.id]);
      }
    }
    const values = [...counts.values()];
    expect(values.reduce((sum, count) => sum + count, 0)).toBe(7);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });

  it("continues fair rotation after an earlier wave is wiped out", () => {
    const sim = createMultiplayerDescentSim({
      players: FOUR_PLAYERS,
      seed: 7009,
    });
    const opening = JSON.parse(sim.serialize()) as {
      state: { meta: { waves: WaveClockState } };
    };
    opening.state.meta.waves.layerStartedTick = -secondsToWaveTicks(
      getWave("ashen_scout").spawnAtSeconds,
    );
    sim.load(JSON.stringify(opening));
    sim.step(2);

    const withScoutsRemoved = JSON.parse(sim.serialize()) as {
      state: {
        meta: { waves: WaveClockState };
        tick: number;
        units: { id: string }[];
      };
    };
    const waves = withScoutsRemoved.state.meta.waves;
    const scoutIds = new Set(waves.units.map((unit) => unit.id));
    waves.units = [];
    waves.trackedUnitIds = [];
    waves.layerStartedTick =
      withScoutsRemoved.state.tick -
      secondsToWaveTicks(getWave("ashen_swarm").spawnAtSeconds);
    withScoutsRemoved.state.units = withScoutsRemoved.state.units.filter(
      (unit) => !scoutIds.has(unit.id),
    );
    sim.load(JSON.stringify(withScoutsRemoved));
    sim.step(2);

    const snapshot = sim.snapshot();
    const campOwners = new Map(
      snapshot.buildings
        .filter((building) => building.buildingType === "camp")
        .map((camp) => [camp.id, camp.ownerId]),
    );
    const targets = (snapshot.meta.waves as WaveClockState).units.map((unit) =>
      campOwners.get(unit.rallyTargetId ?? ""),
    );
    expect(targets).toEqual(["p3", "p4", "p1", "p2", "p3"]);
  });

  it("stays 100% deterministic across two independent client sims", () => {
    const players = FOUR_PLAYERS.slice(0, 3);
    const simA = createMultiplayerDescentSim({ players, seed: 5555 });
    const simB = createMultiplayerDescentSim({ players, seed: 5555 });
    const p1Unit = simA.snapshot().units.find((u) => u.ownerId === "p1");
    const p2Unit = simA.snapshot().units.find((u) => u.ownerId === "p2");
    expect(p1Unit && p2Unit).toBeTruthy();
    if (!p1Unit || !p2Unit) return;

    for (const sim of [simA, simB]) {
      sim.enqueue({
        actorId: "p1",
        type: "order_move",
        unitIds: [p1Unit.id],
        x: p1Unit.x + 12,
        y: p1Unit.y + 4,
      });
      sim.enqueue({
        actorId: "p2",
        type: "order_move",
        unitIds: [p2Unit.id],
        x: p2Unit.x + 10,
        y: p2Unit.y - 4,
      });
      sim.step(80);
    }
    expect(simB.snapshot()).toEqual(simA.snapshot());

    for (const sim of [simA, simB]) {
      const withWaves = JSON.parse(sim.serialize()) as {
        state: { meta: { waves: WaveClockState }; tick: number };
      };
      withWaves.state.meta.waves.layerStartedTick =
        withWaves.state.tick -
        secondsToWaveTicks(getWave("ashen_swarm").spawnAtSeconds);
      sim.load(JSON.stringify(withWaves));
      sim.step(2);

      const withDestroyedCamp = JSON.parse(sim.serialize()) as {
        state: { buildings: EconomyBuilding[] };
      };
      withDestroyedCamp.state.buildings =
        withDestroyedCamp.state.buildings.filter(
          (building) => building.id !== "crucible-camp-1",
        );
      sim.load(JSON.stringify(withDestroyedCamp));
      sim.step(80);
    }
    expect(simB.snapshot()).toEqual(simA.snapshot());
  });
});
