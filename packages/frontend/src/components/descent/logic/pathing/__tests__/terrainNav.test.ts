import { describe, expect, test } from "bun:test";
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
    // Unit had to detour south through the choke-point gap around y = 44.
    expect(maxY).toBeGreaterThan(38);
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
