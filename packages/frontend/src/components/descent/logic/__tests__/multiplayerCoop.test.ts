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
      (unit) => unit.ownerId === "p1" && unit.classId === "warden",
    );
    const p2Captain = before.units.find(
      (unit) => unit.ownerId === "p2" && unit.classId === "warden",
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
    for (let attempt = 0; attempt < 100 && !horde; attempt += 1) {
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
      (unit) => unit.ownerId === "p1" && unit.classId === "warden",
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
  });
});
