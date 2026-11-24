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

/**
 * Repeatedly escapes a union, asserting bounded motion and decreasing ray depth.
 * @param from - Initial occupied position
 * @param disks - Overlapping obstacles
 * @returns Positions through the first fully clear step
 */
function escapeUnion(
  from: { x: number; y: number },
  disks: readonly { x: number; y: number; radius: number }[],
): { x: number; y: number }[] {
  const seen: { x: number; y: number }[] = [];
  let position = from;
  let depth = unionDepth(position, disks);
  for (let index = 0; index < 100; index += 1) {
    const next = stepAroundHurt(
      position,
      { x: position.x + 0.2, y: position.y },
      from,
      disks,
    );
    expect(
      Math.hypot(next.x - position.x, next.y - position.y),
    ).toBeLessThanOrEqual(0.200000001);
    const nextDepth = unionDepth(next, disks);
    expect(nextDepth).toBeLessThan(depth);
    seen.push(next);
    if (nextDepth === 0) return seen;
    position = next;
    depth = nextDepth;
  }
  throw new Error("unit did not escape the obstacle union");
}

/**
 * Measures the shortest sampled distance out of the currently occupied union.
 * @param point - Position to measure
 * @param disks - Obstacles, expanded by movement clearance
 * @returns Remaining escape depth, or zero outside the union
 */
function unionDepth(
  point: { x: number; y: number },
  disks: readonly { x: number; y: number; radius: number }[],
): number {
  const occupied = disks.filter(
    (disk) =>
      Math.hypot(point.x - disk.x, point.y - disk.y) <= disk.radius + 0.05,
  );
  let depth = Infinity;
  for (let index = 0; index < 64; index += 1) {
    const angle = (index * 2 * Math.PI) / 64;
    let distance = 0;
    for (const disk of occupied) {
      const dx = point.x - disk.x;
      const dy = point.y - disk.y;
      const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
      distance = Math.max(
        distance,
        -projection +
          Math.sqrt(
            Math.max(
              0,
              projection * projection +
                (disk.radius + 0.05) ** 2 -
                dx * dx -
                dy * dy,
            ),
          ),
      );
    }
    depth = Math.min(depth, distance);
  }
  return depth;
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

  test("overlapping disks escape identically in either obstacle order", () => {
    const disks = [
      { radius: 2, x: -0.75, y: 0 },
      { radius: 2, x: 0.75, y: 0 },
    ];
    const forward = escapeUnion({ x: 0, y: 0 }, disks);
    const reversed = escapeUnion({ x: 0, y: 0 }, [...disks].reverse());
    expect(forward).toEqual(reversed);
  });

  test("coincident centers choose a deterministic bounded escape", () => {
    const disks = [
      { radius: 2, x: 0, y: 0 },
      { radius: 1, x: 0, y: 0 },
    ];
    const seen = escapeUnion({ x: 0, y: 0 }, disks);
    expect(seen[0]).toEqual({ x: 0.2, y: 0 });
  });

  test("a concave overlap escapes even when one disk initially gets deeper", () => {
    const disks = [
      { radius: 2, x: -0.8, y: 0 },
      { radius: 2, x: 0.8, y: 0 },
      { radius: 2, x: 0, y: 0.8 },
    ];
    expect(escapeUnion({ x: 0, y: 0 }, disks)).toEqual(
      escapeUnion({ x: 0, y: 0 }, [...disks].reverse()),
    );
  });

  test("escape never crosses an initially unoccupied disk, even with a long step", () => {
    const occupied = { radius: 2, x: 0, y: 0 };
    const obstacle = { radius: 0.06, x: 0.35, y: 0 };
    const from = { x: 0, y: 0 };
    const next = stepAroundHurt(from, { x: 3, y: 0 }, { x: 5, y: 0 }, [
      occupied,
      obstacle,
    ]);
    expect(Math.hypot(next.x, next.y)).toBeLessThanOrEqual(3);
    for (let index = 0; index <= 100; index += 1) {
      expect(
        Math.hypot((next.x * index) / 100 - obstacle.x, (next.y * index) / 100),
      ).toBeGreaterThan(obstacle.radius + 0.05);
    }
    expect(Math.hypot(next.x, next.y)).toBeGreaterThan(0);
  });

  test("escape prefers a clear exit over a short step toward a blocker", () => {
    const disk = { radius: 3, x: 0, y: 0 };
    const blocker = { radius: 0.1, x: 1, y: 0 };
    const next = stepAroundHurt(
      { x: 0, y: 0 },
      { x: 0.2, y: 0 },
      { x: 10, y: 0 },
      [disk, blocker],
    );
    const length = Math.hypot(next.x, next.y);
    expect(length).toBeCloseTo(0.2);
    // The chosen ray must pass the blocker, not merely stop before it.
    expect(Math.abs(next.y) / length).toBeGreaterThan(blocker.radius + 0.05);
    expect(next).toEqual(
      stepAroundHurt({ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 10, y: 0 }, [
        blocker,
        disk,
      ]),
    );
  });

  test("long steps escape a disk surrounded by separated small obstacles", () => {
    const disk = { radius: 3, x: 0, y: 0 };
    const obstacles = Array.from({ length: 64 }, (_, index) => ({
      radius: 0.01,
      x: 2 * Math.cos((index * 2 * Math.PI) / 64),
      y: 2 * Math.sin((index * 2 * Math.PI) / 64),
    }));
    let position = { x: 0, y: 0 };
    for (let index = 0; index < 100; index += 1) {
      const next = stepAroundHurt(
        position,
        { x: position.x + 64, y: position.y },
        { x: 64, y: 0 },
        [disk, ...obstacles],
      );
      const dx = next.x - position.x;
      const dy = next.y - position.y;
      const squaredLength = dx * dx + dy * dy;
      expect(squaredLength).toBeGreaterThan(0);
      expect(squaredLength).toBeLessThanOrEqual(64 * 64);
      for (const obstacle of obstacles) {
        const t = Math.max(
          0,
          Math.min(
            1,
            ((obstacle.x - position.x) * dx + (obstacle.y - position.y) * dy) /
              squaredLength,
          ),
        );
        expect(
          Math.hypot(
            position.x + dx * t - obstacle.x,
            position.y + dy * t - obstacle.y,
          ),
        ).toBeGreaterThan(0.06);
      }
      position = next;
      if (Math.hypot(position.x, position.y) > 3.05) break;
    }
    expect(Math.hypot(position.x, position.y)).toBeGreaterThan(3.05);
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
