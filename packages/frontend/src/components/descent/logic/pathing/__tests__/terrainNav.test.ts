import { describe, expect, spyOn, test } from "bun:test";
import {
  CombatSimulation,
  createCombatUnit,
} from "../../combat/combatSimulation";
import { getUnitDefinition } from "../../combat/unitCatalog";
import {
  pushOutOfObstacles,
  segmentHitsObstacles,
  terrainWaypoint,
} from "../terrainNav";

const MAP_SIZE = { height: 60, width: 80 };

/** A vertical rock ridge at x = 40 with a choke-point gap around y = 44. */
const RIDGE_WITH_CHOKE = [
  { radius: 4, x: 40, y: 12 },
  { radius: 4, x: 40, y: 19 },
  { radius: 4, x: 40, y: 26 },
  { radius: 4, x: 40, y: 33 },
  // Gap at y = 40..48 (choke point)
  { radius: 4, x: 40, y: 54 },
];

describe("terrain navigation around ridges and choke points", () => {
  test("returns the direct destination when no obstacle blocks the segment", () => {
    const dest = { x: 25, y: 25 };
    expect(segmentHitsObstacles({ x: 10, y: 25 }, dest, RIDGE_WITH_CHOKE)).toBe(
      false,
    );
    expect(
      terrainWaypoint({ x: 10, y: 25 }, dest, RIDGE_WITH_CHOKE, MAP_SIZE),
    ).toBe(dest);
  });

  test("routes a soldier around a multi-disk ridge through the choke-point gap", () => {
    const warden = createCombatUnit(getUnitDefinition("warden"), {
      factionId: "hold",
      id: "warden-1",
      position: { x: 24, y: 24 },
    });
    const destination = { x: 56, y: 24 };
    const sim = new CombatSimulation({
      mapSize: MAP_SIZE,
      terrainObstacles: RIDGE_WITH_CHOKE,
      units: [warden],
    });
    sim.enqueueCommand(
      {
        type: "order_move",
        unitIds: [warden.id],
        x: destination.x,
        y: destination.y,
      },
      "hold",
    );
    let maxY = warden.position.y;
    for (let tick = 0; tick < 600; tick += 1) {
      sim.advanceTick();
      const unit = sim.getUnit(warden.id);
      if (!unit) break;
      maxY = Math.max(maxY, unit.position.y);
      for (const obstacle of RIDGE_WITH_CHOKE) {
        const dist = Math.hypot(
          unit.position.x - obstacle.x,
          unit.position.y - obstacle.y,
        );
        expect(dist).toBeGreaterThanOrEqual(obstacle.radius - 0.15);
      }
      if (
        Math.hypot(
          unit.position.x - destination.x,
          unit.position.y - destination.y,
        ) < 1
      ) {
        break;
      }
    }
    const finalUnit = sim.getUnit(warden.id);
    expect(finalUnit).toBeDefined();
    expect(
      Math.hypot(
        (finalUnit?.position.x ?? 0) - destination.x,
        (finalUnit?.position.y ?? 0) - destination.y,
      ),
    ).toBeLessThan(1.5);
    // Unit passes south of the final upper disk, through the choke-point gap.
    expect(maxY).toBeGreaterThan(37.35);
  });

  test("pushOutOfObstacles keeps a body outside an obstacle rim and inside bounds", () => {
    const pushed = pushOutOfObstacles(
      { x: 40.5, y: 12 },
      0.35,
      RIDGE_WITH_CHOKE,
      MAP_SIZE,
    );
    expect(Math.hypot(pushed.x - 40, pushed.y - 12)).toBeGreaterThanOrEqual(
      4.35,
    );
    expect(pushed.x).toBeGreaterThanOrEqual(0);
    expect(pushed.x).toBeLessThan(MAP_SIZE.width);
  });
});

interface Point {
  x: number;
  y: number;
}

/** Replays small steering steps, checking every traversed segment and route length. */
function walkRoute(
  start: Point,
  goal: Point,
  obstacles: readonly { x: number; y: number; radius: number }[],
  mapSize = MAP_SIZE,
  rebuildHazardsEachTick = false,
): { point: Point; length: number; route: Point[] } {
  let point = start;
  let length = 0;
  const route: Point[] = [];
  for (let tick = 0; tick < 1500; tick += 1) {
    const waypoint = terrainWaypoint(point, goal, obstacles, mapSize);
    if (rebuildHazardsEachTick) {
      const rebuilt = obstacles.map((disk) => ({ ...disk }));
      // A reused center object proves the value cache shares the actual graph,
      // not merely an equivalent route, across freshly combined hazard arrays.
      expect(terrainWaypoint(point, goal, rebuilt, mapSize)).toBe(waypoint);
    }
    const distance = Math.hypot(waypoint.x - point.x, waypoint.y - point.y);
    if (distance < 1e-7) break;
    const scale = Math.min(0.2 / distance, 1);
    const next = {
      x: point.x + (waypoint.x - point.x) * scale,
      y: point.y + (waypoint.y - point.y) * scale,
    };
    expect(segmentHitsObstacles(point, next, obstacles)).toBe(false);
    length += Math.hypot(next.x - point.x, next.y - point.y);
    point = next;
    route.push(point);
    if (Math.hypot(point.x - goal.x, point.y - goal.y) < 0.01) break;
  }
  return { length, point, route };
}

/** Verifies actual combat-simulation movement reaches a destination around terrain. */
function expectSimArrival(
  start: Point,
  goal: Point,
  obstacles: readonly { x: number; y: number; radius: number }[],
): void {
  const unit = createCombatUnit(getUnitDefinition("warden"), {
    factionId: "hold",
    id: "navigation-regression",
    position: start,
  });
  const sim = new CombatSimulation({
    mapSize: MAP_SIZE,
    terrainObstacles: obstacles,
    units: [unit],
  });
  sim.enqueueCommand(
    { type: "order_move", unitIds: [unit.id], ...goal },
    "hold",
  );
  for (let tick = 0; tick < 1200; tick += 1) {
    sim.advanceTick();
    const current = sim.getUnit(unit.id);
    if (!current) throw new Error("Navigation unit disappeared");
    const point = current.position;
    for (const disk of obstacles) {
      expect(
        Math.hypot(point.x - disk.x, point.y - disk.y),
      ).toBeGreaterThanOrEqual(disk.radius - 0.01);
    }
    if (Math.hypot(point.x - goal.x, point.y - goal.y) < 1) return;
  }
  throw new Error("Navigation unit did not arrive within 1200 ticks");
}

describe("weighted visible terrain routes", () => {
  test("escapes concave overlapping barriers without oscillation in steering and sim movement", () => {
    // A U opening east: the target lies west of its closed back wall.
    const obstacles = [
      { radius: 4, x: 24, y: 24 },
      { radius: 4, x: 24, y: 30 },
      { radius: 4, x: 24, y: 36 },
      { radius: 4, x: 30, y: 24 },
      { radius: 4, x: 36, y: 24 },
      { radius: 4, x: 30, y: 36 },
      { radius: 4, x: 36, y: 36 },
    ];
    const start = { x: 31, y: 30 };
    const goal = { x: 12, y: 30 };
    const result = walkRoute(start, goal, obstacles);
    expect(
      Math.hypot(result.point.x - goal.x, result.point.y - goal.y),
    ).toBeLessThan(0.01);
    expect(result.length).toBeLessThan(60);
    expectSimArrival(start, goal, obstacles);
  });

  test("checks thin barriers crossing cardinal and diagonal edges between open centers", () => {
    const obstacles = [
      { radius: 0.15, x: 20, y: 21 },
      { radius: 0.2, x: 22, y: 22 },
      { radius: 0.15, x: 24, y: 23 },
    ];
    const goal = { x: 31, y: 21 };
    const result = walkRoute({ x: 11, y: 21 }, goal, obstacles);
    expect(
      Math.hypot(result.point.x - goal.x, result.point.y - goal.y),
    ).toBeLessThan(0.01);
    expect(result.length).toBeLessThan(24);
    expectSimArrival({ x: 11, y: 21 }, goal, obstacles);
  });

  test("stops safely at a blocked goal instead of steering into its disk", () => {
    const obstacles = [{ radius: 4, x: 30, y: 30 }];
    const goal = { x: 30, y: 30 };
    const result = walkRoute({ x: 10, y: 30 }, goal, obstacles);
    expect(
      Math.hypot(result.point.x - 30, result.point.y - 30),
    ).toBeGreaterThan(4.35);
    expect(Math.hypot(result.point.x - 30, result.point.y - 30)).toBeLessThan(
      4.5,
    );
    expect(result.route.length).toBeLessThan(150);
  });

  test("connects a geometrically clear start in a blocked coarse cell", () => {
    const obstacles = [{ radius: 1.4, x: 21, y: 21 }];
    const goal = { x: 30, y: 21 };
    const result = walkRoute({ x: 19.1, y: 21 }, goal, obstacles);
    expect(
      Math.hypot(result.point.x - goal.x, result.point.y - goal.y),
    ).toBeLessThan(0.01);
  });

  test("an embedded start takes an outward escape connector, never one through another disk", () => {
    const obstacles = [
      { radius: 3, x: 20, y: 20 },
      { radius: 2, x: 24, y: 20 },
    ];
    const start = { x: 18, y: 20 };
    const goal = { x: 35, y: 20 };
    const waypoint = terrainWaypoint(start, goal, obstacles, MAP_SIZE);
    expect(waypoint.x).toBeLessThanOrEqual(start.x);
    expect(segmentHitsObstacles(start, waypoint, obstacles.slice(1))).toBe(
      false,
    );
    let escaped = start;
    let escapeSteps = 0;
    while (
      Math.hypot(escaped.x - 20, escaped.y - 20) <= 3.35 &&
      escapeSteps < 100
    ) {
      const nextWaypoint = terrainWaypoint(escaped, goal, obstacles, MAP_SIZE);
      const length = Math.hypot(
        nextWaypoint.x - escaped.x,
        nextWaypoint.y - escaped.y,
      );
      expect(length).toBeGreaterThan(0);
      const scale = Math.min(0.1 / length, 1);
      const next = {
        x: escaped.x + (nextWaypoint.x - escaped.x) * scale,
        y: escaped.y + (nextWaypoint.y - escaped.y) * scale,
      };
      expect(Math.hypot(next.x - 20, next.y - 20)).toBeGreaterThanOrEqual(
        Math.hypot(escaped.x - 20, escaped.y - 20),
      );
      expect(segmentHitsObstacles(escaped, next, obstacles.slice(1))).toBe(
        false,
      );
      escaped = next;
      escapeSteps += 1;
    }
    expect(escapeSteps).toBeLessThan(100);
    const result = walkRoute(escaped, goal, obstacles);
    expect(
      Math.hypot(result.point.x - goal.x, result.point.y - goal.y),
    ).toBeLessThan(0.01);
  });

  test("unreachable and completely blocked grids hold position, not a wall-crossing fallback", () => {
    const wall = Array.from({ length: 11 }, (_, index) => ({
      radius: 4,
      x: 20,
      y: index * 6,
    }));
    const start = { x: 10, y: 30 };
    expect(terrainWaypoint(start, { x: 30, y: 30 }, wall, MAP_SIZE)).toEqual(
      start,
    );
    expect(
      terrainWaypoint(
        start,
        { x: 30, y: 30 },
        [{ radius: 100, x: 20, y: 20 }],
        MAP_SIZE,
      ),
    ).toEqual(start);
  });

  test("clamps off-map goals and connects off-grid starts using checked segments", () => {
    const obstacles = [{ radius: 3, x: 10, y: 10 }];
    const result = walkRoute({ x: -2, y: 10 }, { x: 22, y: 10 }, obstacles);
    expect(Math.hypot(result.point.x - 22, result.point.y - 10)).toBeLessThan(
      0.01,
    );
    expect(
      terrainWaypoint({ x: 70, y: 20 }, { x: 100, y: 20 }, obstacles, MAP_SIZE),
    ).toEqual({ x: 79, y: 20 });
  });

  test("weighted routes are efficient, deterministic across shared fields and long-lookahead smoothed", () => {
    const obstacles = [{ radius: 8, x: 40, y: 30 }];
    const start = { x: 10, y: 30 };
    const goal = { x: 70, y: 30 };
    const waypoint = terrainWaypoint(start, goal, obstacles, MAP_SIZE);
    expect(
      Math.hypot(waypoint.x - start.x, waypoint.y - start.y),
    ).toBeGreaterThan(20);
    const first = walkRoute(start, goal, obstacles);
    const second = walkRoute(
      start,
      goal,
      obstacles.map((disk) => ({ ...disk })),
      MAP_SIZE,
      true,
    );
    expect(first.route).toEqual(second.route);
    expect(first.length).toBeLessThan(64);
    expect(
      Math.hypot(first.point.x - goal.x, first.point.y - goal.y),
    ).toBeLessThan(0.01);
  });

  test("moving goals reuse weighted fields and bound per-unit connector work", () => {
    const obstacles = [{ radius: 8.123, x: 39.7, y: 30.9 }];
    const start = { x: 10.1, y: 30.1 };
    const goal = { x: 70.2, y: 30.1 };
    terrainWaypoint(start, goal, obstacles, MAP_SIZE);
    const hypot = spyOn(Math, "hypot");
    try {
      for (let tick = 0; tick < 100; tick += 1) {
        const movingGoal = {
          x: goal.x + tick * 0.0001,
          y: goal.y + tick * 0.0001,
        };
        const freshHazards = obstacles.map((disk) => ({ ...disk }));
        const waypoint = terrainWaypoint(
          start,
          movingGoal,
          freshHazards,
          MAP_SIZE,
        );
        expect(segmentHitsObstacles(start, waypoint, obstacles)).toBe(false);
      }
      // Full-grid connector scans or a single rebuilt Dijkstra field exceed
      // this deterministic work budget; the local search needs <=25 per tick.
      expect(hypot.mock.calls.length).toBeLessThan(4000);
    } finally {
      hypot.mockRestore();
    }
  });
});

describe("body clearance and union pushout", () => {
  test("default segment clearance matches the 0.35 combat body radius", () => {
    const obstacles = [{ radius: 1, x: 10, y: 1.34 }];
    const from = { x: 0, y: 0 };
    const goal = { x: 20, y: 0 };
    expect(segmentHitsObstacles(from, goal, obstacles, 0.3)).toBe(false);
    expect(segmentHitsObstacles(from, goal, obstacles)).toBe(true);
  });

  test("overlapping disks push out of the whole union without re-entering an earlier disk", () => {
    const obstacles = [
      { radius: 2, x: 10, y: 10 },
      { radius: 2, x: 13, y: 10 },
    ];
    const start = { x: 11.5, y: 10 };
    const pushed = pushOutOfObstacles(start, 0.35, obstacles, MAP_SIZE);
    for (const disk of obstacles) {
      expect(
        Math.hypot(pushed.x - disk.x, pushed.y - disk.y),
      ).toBeGreaterThanOrEqual(disk.radius + 0.35);
    }
    expect(Math.hypot(pushed.x - start.x, pushed.y - start.y)).toBeLessThan(2);
    expect(
      pushOutOfObstacles(start, 0.35, [...obstacles].reverse(), MAP_SIZE),
    ).toEqual(pushed);
    expect(pushOutOfObstacles(pushed, 0.35, obstacles, MAP_SIZE)).toEqual(
      pushed,
    );
  });

  test("the overlapping ridge example escapes both disks without repeated projection cycles", () => {
    const obstacles = [
      { radius: 4, x: 40, y: 12 },
      { radius: 4, x: 40, y: 19 },
    ];
    const pushed = pushOutOfObstacles(
      { x: 40, y: 15.5 },
      0.35,
      obstacles,
      MAP_SIZE,
    );
    for (const disk of obstacles) {
      expect(
        Math.hypot(pushed.x - disk.x, pushed.y - disk.y),
      ).toBeGreaterThanOrEqual(4.35);
    }
    expect(Math.hypot(pushed.x - 40, pushed.y - 15.5)).toBeLessThan(3);
    let repeated = pushed;
    for (let tick = 0; tick < 20; tick += 1) {
      repeated = pushOutOfObstacles(repeated, 0.35, obstacles, MAP_SIZE);
      expect(repeated).toEqual(pushed);
    }
  });

  test("a third overlap cannot invalidate the selected union-boundary escape", () => {
    const obstacles = [
      { radius: 2, x: 10, y: 10 },
      { radius: 2, x: 13, y: 10 },
      { radius: 2, x: 11.5, y: 8.2 },
    ];
    const pushed = pushOutOfObstacles(
      { x: 11.5, y: 10 },
      0.35,
      obstacles,
      MAP_SIZE,
    );
    expect(pushed.y).toBeGreaterThan(10);
    for (const disk of obstacles) {
      expect(
        Math.hypot(pushed.x - disk.x, pushed.y - disk.y),
      ).toBeGreaterThanOrEqual(disk.radius + 0.35);
    }
    expect(pushOutOfObstacles(pushed, 0.35, obstacles, MAP_SIZE)).toEqual(
      pushed,
    );
  });

  test("union escape stays clear at map edges and with coincident centers", () => {
    const layouts = [
      [
        { radius: 3, x: 0, y: 10 },
        { radius: 3, x: 3, y: 10 },
      ],
      [
        { radius: 3, x: 0, y: 10 },
        { radius: 2, x: 0, y: 10 },
      ],
    ];
    for (const obstacles of layouts) {
      const pushed = pushOutOfObstacles(
        { x: 0, y: 10 },
        0.35,
        obstacles,
        MAP_SIZE,
      );
      expect(pushed.x).toBeGreaterThanOrEqual(0);
      expect(pushed.x).toBeLessThanOrEqual(MAP_SIZE.width - 1);
      expect(pushed.y).toBeGreaterThanOrEqual(0);
      expect(pushed.y).toBeLessThanOrEqual(MAP_SIZE.height - 1);
      for (const disk of obstacles) {
        expect(
          Math.hypot(pushed.x - disk.x, pushed.y - disk.y),
        ).toBeGreaterThanOrEqual(disk.radius + 0.35);
      }
      expect(
        pushOutOfObstacles(
          { x: 0, y: 10 },
          0.35,
          [...obstacles].reverse(),
          MAP_SIZE,
        ),
      ).toEqual(pushed);
    }
  });

  test("fully covered maps hold a bounded finite position instead of projection cycles", () => {
    expect(
      pushOutOfObstacles(
        { x: -1, y: 5 },
        0.35,
        [{ radius: 100, x: 10, y: 10 }],
        MAP_SIZE,
      ),
    ).toEqual({ x: 0, y: 5 });
  });
});

describe("rounded blocked-goal terminals", () => {
  test("three-decimal combat steps converge without reclassifying the terminal as an embedded start", () => {
    for (const angle of [0.15, 0.5, 1.1, 1.8, 2.6, 3.8, 5.1]) {
      const obstacles = [{ radius: 4, x: 30.123, y: 30.456 }];
      const goal = { x: 30.123, y: 30.456 };
      let point = {
        x: goal.x + Math.cos(angle) * 12,
        y: goal.y + Math.sin(angle) * 12,
      };
      let completed = false;
      for (let tick = 0; tick < 400; tick += 1) {
        const target = terrainWaypoint(point, goal, obstacles, MAP_SIZE);
        const remaining = Math.hypot(target.x - point.x, target.y - point.y);
        if (remaining < 0.001) {
          completed = true;
          break;
        }
        const scale = Math.min(1, 0.13 / remaining);
        point = {
          x: Math.round((point.x + (target.x - point.x) * scale) * 1000) / 1000,
          y: Math.round((point.y + (target.y - point.y) * scale) * 1000) / 1000,
        };
        expect(Math.hypot(point.x - goal.x, point.y - goal.y)).toBeGreaterThan(
          4.35,
        );
      }
      expect(completed).toBe(true);
      const repeated = terrainWaypoint(point, goal, obstacles, MAP_SIZE);
      expect(
        Math.hypot(repeated.x - point.x, repeated.y - point.y),
      ).toBeLessThan(0.001);
    }
  });
});
