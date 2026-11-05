import { describe, expect, test } from "bun:test";
import {
  footprintCovers,
  footprintRadius,
} from "../../../../logic/economy/footprint";
import {
  distance,
  distanceToSegment,
  sideOfLine,
} from "../../../../logic/mapgen";
import { RESOURCE_IDS } from "../../../../logic/types";
import { SPAWN_EAST_INSET } from "../../../../logic/waves/constants";
import {
  ASHEN_GATE_MAP_SIZE,
  ASHEN_GATE_NODE_SLOTS,
  ASHEN_GATE_STARTING_VILLAGERS,
  ASHEN_GATE_STOCKPILE,
  type AshenGateMap,
  generateAshenGateMap,
  validateAshenGateMap,
} from "..";

/** Cells from the Camp's center to the edge of its square. */
const CAMP_EDGE = footprintRadius("camp");

const SEEDS = Array.from({ length: 100 }, (_, index) => index * 7919 + 1);

/** Maps for `SEEDS`, generated once and shared by every test. */
const MAPS = new Map<number, AshenGateMap>();

/**
 * @param seed - Run seed
 * @returns The cached map for that seed
 */
function mapFor(seed: number): AshenGateMap {
  const cached = MAPS.get(seed);
  if (cached) return cached;
  const map = generateAshenGateMap(seed);
  MAPS.set(seed, map);
  return map;
}

/**
 * @param map - Generated map
 * @returns The Camp cell
 */
function campOf(map: AshenGateMap): { x: number; y: number } {
  const camp = map.buildings.find((entry) => entry.buildingType === "camp");
  if (!camp) throw new Error("Missing Camp");
  return camp;
}

/**
 * @param map - Generated map
 * @returns Where the horde enters
 */
function gateOf(map: AshenGateMap): { x: number; y: number } {
  return { x: map.width - SPAWN_EAST_INSET, y: map.height / 2 };
}

/**
 * @param map - Generated map
 * @param id - Deposit id
 * @returns That deposit
 */
function nodeOf(map: AshenGateMap, id: string) {
  const node = map.nodes.find((entry) => entry.id === id);
  if (!node) throw new Error(`Missing ${id}`);
  return node;
}

describe("generateAshenGateMap", () => {
  test("the same seed always rebuilds the same map", () => {
    expect(generateAshenGateMap(1234)).toEqual(generateAshenGateMap(1234));
  });

  test("different seeds spread the Hold and deposits differently", () => {
    const maps = SEEDS.slice(0, 40).map(mapFor);
    const camps = new Set(maps.map((map) => JSON.stringify(campOf(map))));
    const nearFood = new Set(
      maps.map((map) => JSON.stringify(nodeOf(map, "ashen-food-near"))),
    );
    const ventLines = new Set(maps.map((map) => JSON.stringify(map.vents)));
    expect(camps.size).toBeGreaterThan(20);
    expect(nearFood.size).toBeGreaterThan(30);
    expect(ventLines.size).toBe(40);
  });

  test("every seed passes validation: reachable, fair, and inside the map", () => {
    for (const seed of SEEDS) {
      expect({ problems: validateAshenGateMap(mapFor(seed)), seed }).toEqual({
        problems: [],
        seed,
      });
    }
  });

  test("keeps the recipe: size, stockpile, stable ids, two of every resource", () => {
    const map = generateAshenGateMap(5);
    expect({ height: map.height, width: map.width }).toEqual(
      ASHEN_GATE_MAP_SIZE,
    );
    expect(map.stockpile).toEqual(ASHEN_GATE_STOCKPILE);
    expect(map.nodes.map((node) => node.id)).toEqual(
      ASHEN_GATE_NODE_SLOTS.map((slot) => slot.id),
    );
    for (const resourceId of RESOURCE_IDS) {
      expect(
        map.nodes.filter((node) => node.resourceId === resourceId),
      ).toHaveLength(2);
    }
    expect(map.veins.map((vein) => vein.id)).toEqual([
      "ashen-vein-hold",
      "ashen-vein-choke",
      "ashen-vein-frontier",
    ]);
  });

  test("the Camp sits on the west side with an open building apron", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const camp = campOf(map);
      expect(camp.x).toBeLessThan(map.width * 0.15);
      expect(Math.abs(camp.y - map.height / 2)).toBeLessThanOrEqual(
        map.height * 0.2 + 1,
      );
      for (const node of map.nodes) {
        expect(distance(node, camp)).toBeGreaterThanOrEqual(6 + CAMP_EDGE);
      }
    }
  });

  test("opening deposits ring the Camp and spread out by direction", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const camp = campOf(map);
      const near = ASHEN_GATE_NODE_SLOTS.filter((slot) => slot.band === "near");
      const angles = near.map((slot) => {
        const node = nodeOf(map, slot.id);
        expect(distance(node, camp)).toBeLessThanOrEqual(
          (11.5 + CAMP_EDGE) * 1.6,
        );
        return Math.atan2(node.y - camp.y, node.x - camp.x);
      });
      const spread = Math.max(...angles) - Math.min(...angles);
      expect(spread).toBeGreaterThan(Math.PI / 2);
    }
  });

  test("Ember vents form one line across the approach with a crossing gap", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const camp = campOf(map);
      expect(map.vents.length).toBeGreaterThanOrEqual(3);
      expect(map.vents.length).toBeLessThanOrEqual(4);
      for (const vent of map.vents) {
        expect(distance(vent, camp)).toBeGreaterThan(18);
        expect(distance(vent, camp)).toBeLessThan(40);
      }
      const crossing = map.chokePoints.find(
        (entry) => entry.id === "vent-choke",
      );
      if (!crossing) throw new Error("Missing Ember crossing");
      for (const vent of map.vents) {
        expect(distance(crossing, vent)).toBeGreaterThan(vent.radius);
      }
    }
  });

  test("paired deposits take opposite flanks of the horde lane", () => {
    const pairs = new Map<string, string[]>();
    for (const slot of ASHEN_GATE_NODE_SLOTS) {
      if (!slot.pair) continue;
      pairs.set(slot.pair, [...(pairs.get(slot.pair) ?? []), slot.id]);
    }
    let opposite = 0;
    let total = 0;
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const [first, second] of pairs.values()) {
        if (!first || !second) continue;
        const sideA = sideOfLine(nodeOf(map, first), campOf(map), gateOf(map));
        const sideB = sideOfLine(nodeOf(map, second), campOf(map), gateOf(map));
        total += 1;
        if (sideA !== sideB) opposite += 1;
      }
    }
    // Constraints relax only when a flank runs out of room, which is rare.
    expect(opposite / total).toBeGreaterThan(0.95);
  });

  test("outer deposits stay off the horde lane and off the map's rim", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const slot of ASHEN_GATE_NODE_SLOTS) {
        if (slot.band !== "outer") continue;
        const node = nodeOf(map, slot.id);
        const lane = distanceToSegment(node, campOf(map), gateOf(map));
        expect(lane).toBeGreaterThanOrEqual(6);
        expect(node.x).toBeGreaterThanOrEqual(3);
        expect(node.y).toBeGreaterThanOrEqual(3);
        expect(node.x).toBeLessThanOrEqual(map.width - 4);
        expect(node.y).toBeLessThanOrEqual(map.height - 4);
      }
    }
  });

  test("starts a captain and the villagers beside the Camp", () => {
    const map = generateAshenGateMap(77);
    const camp = campOf(map);
    const villagers = map.units.filter((unit) => unit.classId === undefined);
    expect(villagers).toHaveLength(ASHEN_GATE_STARTING_VILLAGERS);
    const captain = map.units.find((unit) => unit.id === "ashen-captain");
    expect(captain?.classId).toBe("warden");
    for (const unit of map.units) {
      expect(distance(unit, camp)).toBeLessThanOrEqual(5 + CAMP_EDGE);
      const site = { buildingType: "camp", ...camp };
      expect(footprintCovers(site, unit.x, unit.y)).toBe(false);
    }
  });
});
