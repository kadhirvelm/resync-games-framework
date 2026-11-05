import { describe, expect, test } from "bun:test";
import { buildShellModel } from "../../../views/shellModel";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
  createAshenGateSim,
} from "../../ashenGateSlice";
import type { DescentSim } from "../../sim/descentSim";
import type { SimSnapshot } from "../../types";

/**
 * @param snapshot - Sim snapshot
 * @returns The Camp's position
 */
function campOf(snapshot: SimSnapshot): { x: number; y: number } {
  const camp = snapshot.buildings.find(
    (building) => building.buildingType === "camp",
  );
  if (!camp) throw new Error("no Camp");
  return camp;
}

/**
 * @param sim - Sim
 * @param unitId - Unit to find
 * @returns Its current position
 */
function positionOf(sim: DescentSim, unitId: string): { x: number; y: number } {
  const unit = sim.snapshot().units.find((entry) => entry.id === unitId);
  if (!unit) throw new Error(`no unit ${unitId}`);
  return unit;
}

/**
 * @param sim - Sim
 * @returns Slice state
 */
function slice(sim: DescentSim): AshenGateSliceState {
  return sim.snapshot().meta[ASHEN_GATE_SLICE_MODULE_ID] as AshenGateSliceState;
}

/**
 * Steps until a unit is within a cell of a point, recording whether it
 * passed near another point first.
 * @param sim - Sim
 * @param unitId - Walking unit
 * @param goal - Final point
 * @param via - Point it should visit on the way
 * @returns Whether it reached the goal, and whether it visited `via` first
 */
function walk(
  sim: DescentSim,
  unitId: string,
  goal: { x: number; y: number },
  via: { x: number; y: number },
): { reached: boolean; visitedVia: boolean } {
  let visitedVia = false;
  for (let tick = 0; tick < 4_000; tick += 1) {
    sim.step(1);
    const at = positionOf(sim, unitId);
    if (Math.hypot(at.x - via.x, at.y - via.y) <= 1.5) visitedVia = true;
    if (Math.hypot(at.x - goal.x, at.y - goal.y) <= 1.5) {
      return { reached: true, visitedVia };
    }
  }
  return { reached: false, visitedVia };
}

describe("shift-queued waypoints", () => {
  test("a soldier walks to each shift-clicked point in order", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const camp = campOf(sim.snapshot());
    const first = { x: camp.x + 10, y: camp.y };
    const second = { x: camp.x + 10, y: camp.y + 8 };
    sim.enqueue({ type: "order_move", unitIds: ["ashen-captain"], ...first });
    sim.step(1);
    sim.enqueue({
      queue: true,
      type: "order_move",
      unitIds: ["ashen-captain"],
      ...second,
    });
    sim.step(1);
    expect(slice(sim).waypoints?.["ashen-captain"]).toHaveLength(1);
    expect(walk(sim, "ashen-captain", second, first)).toEqual({
      reached: true,
      visitedVia: true,
    });
    expect(slice(sim).waypoints?.["ashen-captain"]).toBeUndefined();
  });

  test("a villager follows queued legs too", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const start = sim.snapshot();
    const camp = campOf(start);
    const villager = start.units.find((unit) => unit.classId === "villager");
    if (!villager) throw new Error("no villager");
    const first = { x: camp.x - 6, y: camp.y + 6 };
    const second = { x: camp.x - 6, y: camp.y - 4 };
    sim.enqueue({ type: "order_move", unitIds: [villager.id], ...first });
    sim.enqueue({
      queue: true,
      type: "order_move",
      unitIds: [villager.id],
      ...second,
    });
    expect(walk(sim, villager.id, second, first)).toEqual({
      reached: true,
      visitedVia: true,
    });
  });

  test("a shift-click on an idle unit moves it at once", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const camp = campOf(sim.snapshot());
    const point = { x: camp.x + 8, y: camp.y - 4 };
    sim.enqueue({
      queue: true,
      type: "order_move",
      unitIds: ["ashen-captain"],
      ...point,
    });
    sim.step(1);
    expect(slice(sim).waypoints?.["ashen-captain"]).toBeUndefined();
    expect(walk(sim, "ashen-captain", point, point).reached).toBe(true);
  });

  test("an order without Shift replaces the queue", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const camp = campOf(sim.snapshot());
    sim.enqueue({
      type: "order_move",
      unitIds: ["ashen-captain"],
      x: camp.x + 12,
      y: camp.y,
    });
    sim.step(1);
    sim.enqueue({
      queue: true,
      type: "order_move",
      unitIds: ["ashen-captain"],
      x: camp.x + 12,
      y: camp.y + 10,
    });
    sim.step(1);
    sim.enqueue({ type: "order_stop", unitIds: ["ashen-captain"] });
    sim.step(1);
    expect(slice(sim).waypoints?.["ashen-captain"]).toBeUndefined();
  });

  test("the shell publishes the current stop and each queued flag", () => {
    const sim = createAshenGateSim({ seed: 7 });
    const camp = campOf(sim.snapshot());
    const first = { x: camp.x + 14, y: camp.y };
    const second = { x: camp.x + 14, y: camp.y + 8 };
    sim.enqueue({ type: "order_move", unitIds: ["ashen-captain"], ...first });
    sim.step(1);
    sim.enqueue({
      queue: true,
      type: "order_attack_move",
      unitIds: ["ashen-captain"],
      ...second,
    });
    sim.step(1);
    const captain = buildShellModel(sim.snapshot()).units.find(
      (unit) => unit.id === "ashen-captain",
    );
    expect(captain?.route).toEqual([
      { attack: false, ...first },
      { attack: true, ...second },
    ]);
  });
});
