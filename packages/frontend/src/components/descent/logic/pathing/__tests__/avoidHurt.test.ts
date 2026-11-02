import { describe, expect, test } from "bun:test";
import {
  CombatSimulation,
  createCombatUnit,
  getUnitDefinition,
} from "../../combat";
import { activeVentVolumes, isInsideVolume } from "../../layers/hazards";
import { cellStaysClear, escapeHurtCell, stepAroundHurt } from "../avoidHurt";

const VENT = { radius: 2.25, x: 10, y: 10 };

/**
 * Walks a point toward a destination one short step at a time.
 * @param from - Start
 * @param destination - Goal
 * @param steps - How many steps to take
 * @returns Every position after a step
 */
function walk(
  from: { x: number; y: number },
  destination: { x: number; y: number },
  steps: number,
): { x: number; y: number }[] {
  const seen: { x: number; y: number }[] = [];
  let pos = { ...from };
  for (let index = 0; index < steps; index += 1) {
    const dx = destination.x - pos.x;
    const dy = destination.y - pos.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining === 0) break;
    const length = Math.min(0.2, remaining);
    const proposed = {
      x: pos.x + (dx / remaining) * length,
      y: pos.y + (dy / remaining) * length,
    };
    pos = stepAroundHurt(pos, proposed, destination, [VENT]);
    seen.push(pos);
  }
  return seen;
}

describe("pathing around hurt ground", () => {
  test("Ashen Gate vents are the disks that burn, and a fog layer has none", () => {
    expect(activeVentVolumes("ashen_gate")).toHaveLength(3);
    expect(activeVentVolumes("bone_wastes")).toEqual([]);
    expect(activeVentVolumes(null)).toEqual([]);
  });

  test("a straight step that misses a vent is kept", () => {
    const next = stepAroundHurt(
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 4, y: 0 },
      [VENT],
    );
    expect(next).toEqual({ x: 0.2, y: 0 });
  });

  test("a walk from one side of a vent to the other never enters it", () => {
    const seen = walk({ x: 10, y: 6 }, { x: 10, y: 14 }, 80);
    for (const point of seen) {
      expect(isInsideVolume(VENT, point.x, point.y)).toBe(false);
    }
    const last = seen.at(-1);
    expect(last?.x).toBeCloseTo(10, 0);
    expect(last?.y).toBeCloseTo(14, 0);
  });

  test("an order into the vent stops short of the burn", () => {
    const seen = walk({ x: 10, y: 6 }, { x: 10, y: 10 }, 80);
    for (const point of seen) {
      expect(isInsideVolume(VENT, point.x, point.y)).toBe(false);
    }
  });

  test("a unit already in a vent walks out", () => {
    const next = stepAroundHurt(
      { x: 10, y: 10 },
      { x: 10, y: 10.2 },
      { x: 10, y: 14 },
      [VENT],
    );
    expect(Math.hypot(next.x - 10, next.y - 10)).toBeGreaterThan(0);
    expect(next.y).toBe(10);
  });

  test("a villager cell inside a vent is closed, and the way out is farther from the center", () => {
    expect(cellStaysClear([VENT], 10, 10)).toBe(false);
    expect(cellStaysClear([VENT], 10, 6)).toBe(true);
    expect(escapeHurtCell({ x: 10, y: 10 }, [VENT], () => true)).toEqual({
      x: 10,
      y: 9,
    });
  });

  test("a soldier ordered through a vent arrives on the far side without entering it", () => {
    const soldier = createCombatUnit(getUnitDefinition("warden"), {
      factionId: "hold",
      id: "warden",
      position: { x: 22, y: 10 },
    });
    soldier.speed = 4;
    const vent = { radius: 2.25, x: 22, y: 14 };
    const simulation = new CombatSimulation({
      hurtZones: [vent],
      units: [soldier],
    });
    simulation.enqueueCommand(
      { type: "order_move", unitIds: ["warden"], x: 22, y: 18 },
      "player",
    );
    let arrived = false;
    for (let tick = 0; tick < 200; tick += 1) {
      simulation.advanceTick();
      const position = simulation.getUnit("warden")?.position;
      if (!position) throw new Error("missing warden");
      expect(isInsideVolume(vent, position.x, position.y)).toBe(false);
      arrived = position.x === 22 && position.y === 18;
      if (arrived) break;
    }
    expect(arrived).toBe(true);
  });
});
