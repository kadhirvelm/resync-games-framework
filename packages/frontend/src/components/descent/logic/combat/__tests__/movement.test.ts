import { describe, expect, test } from "bun:test";
import type { HurtDisk } from "../../pathing/avoidHurt";
import { pushOutOfObstacles } from "../../pathing/terrainNav";
import { CombatSimulation, createCombatUnit } from "../combatSimulation";
import { getUnitDefinition } from "../unitCatalog";

/** A concave courtyard whose only exit initially leads away from the order. */
const COURTYARD: HurtDisk[] = [
  { radius: 3, x: 20, y: 14 },
  { radius: 3, x: 20, y: 19 },
  { radius: 3, x: 20, y: 24 },
  { radius: 3, x: 20, y: 29 },
  { radius: 3, x: 15, y: 14 },
  { radius: 3, x: 10, y: 14 },
  { radius: 3, x: 15, y: 29 },
  { radius: 3, x: 10, y: 29 },
];

describe("combat movement planning", () => {
  for (const hazardType of ["obstacles", "hurtZones"] as const) {
    test(`escapes concave ${hazardType} instead of following the rim forever`, () => {
      const walker = createCombatUnit(getUnitDefinition("warden"), {
        factionId: "hold",
        id: "walker",
        position: { x: 14, y: 22 },
      });
      const simulation = new CombatSimulation({
        mapSize: { height: 45, width: 50 },
        [hazardType]: COURTYARD,
        units: [walker],
      });
      const destination = { x: 32, y: 22 };
      simulation.enqueueCommand(
        {
          type: "order_move",
          unitIds: [walker.id],
          ...destination,
        },
        "hold",
      );
      for (let tick = 0; tick < 900; tick += 1) {
        simulation.advanceTick();
        const position = simulation.getUnit(walker.id)?.position;
        expect(position).toBeDefined();
        if (!position) break;
        for (const disk of COURTYARD) {
          expect(
            Math.hypot(position.x - disk.x, position.y - disk.y),
          ).toBeGreaterThan(disk.radius);
        }
        if (
          Math.hypot(position.x - destination.x, position.y - destination.y) <
          0.5
        )
          break;
      }
      const position =
        simulation.getUnit(walker.id)?.position ?? walker.position;
      expect(
        Math.hypot(position.x - destination.x, position.y - destination.y),
      ).toBeLessThan(0.5);
    });
  }
});

test("a move into an obstacle finishes at a safe approach and releases the order", () => {
  const walker = createCombatUnit(getUnitDefinition("warden"), {
    factionId: "hold",
    id: "walker",
    position: { x: 10, y: 20 },
  });
  const simulation = new CombatSimulation({
    mapSize: { height: 45, width: 50 },
    obstacles: [{ radius: 4, x: 20, y: 20 }],
    units: [walker],
  });
  simulation.enqueueCommand(
    {
      type: "order_move",
      unitIds: [walker.id],
      x: 20,
      y: 20,
    },
    "hold",
  );
  for (let tick = 0; tick < 200; tick += 1) simulation.advanceTick();
  const stopped = simulation.getUnit(walker.id);
  expect(stopped?.order).toBeUndefined();
  expect(
    Math.hypot(
      (stopped?.position.x ?? 0) - 20,
      (stopped?.position.y ?? 0) - 20,
    ),
  ).toBeGreaterThan(4);
  simulation.enqueueCommand(
    {
      type: "order_move",
      unitIds: [walker.id],
      x: 10,
      y: 30,
    },
    "hold",
  );
  for (let tick = 0; tick < 200; tick += 1) simulation.advanceTick();
  expect(simulation.getUnit(walker.id)?.position).toEqual({ x: 10, y: 30 });
});

test("body separation cannot keep a blocked terrain move active at the rim", () => {
  const walker = createCombatUnit(getUnitDefinition("warden"), {
    factionId: "hold",
    id: "walker",
    position: { x: 10, y: 20 },
  });
  const obstacles = [{ radius: 4, x: 20, y: 20 }];
  const mapSize = { height: 45, width: 50 };
  const simulation = new CombatSimulation({
    mapSize,
    skipInputClone: true,
    terrainObstacles: obstacles,
    units: [walker],
  });
  simulation.enqueueCommand(
    {
      type: "order_move",
      unitIds: [walker.id],
      x: 20,
      y: 20,
    },
    "hold",
  );
  for (let tick = 0; tick < 200; tick += 1) {
    simulation.advanceTick();
    walker.position = pushOutOfObstacles(
      walker.position,
      0.35,
      obstacles,
      mapSize,
    );
  }
  expect(simulation.getUnit(walker.id)?.order).toBeUndefined();
  expect(
    Math.hypot(walker.position.x - 20, walker.position.y - 20),
  ).toBeGreaterThanOrEqual(4.35);
});
