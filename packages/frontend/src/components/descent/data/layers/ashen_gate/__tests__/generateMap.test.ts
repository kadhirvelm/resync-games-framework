import { describe, expect, test } from "bun:test";
import {
  footprintCovers,
  footprintRadius,
} from "../../../../logic/economy/footprint";
import {
  distance,
  distanceToSegment,
  floodDistances,
  sideOfLine,
  stepsTo,
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

/** Fuzz seeds; 40 is enough to catch layout regressions without slowing CI. */
const SEEDS = Array.from({ length: 40 }, (_, index) => index * 7919 + 1);

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
    const maps = SEEDS.map(mapFor);
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

  test("keeps the recipe: size, stockpile, stable ids, extra nearby wood", () => {
    const map = generateAshenGateMap(5);
    expect({ height: map.height, width: map.width }).toEqual(
      ASHEN_GATE_MAP_SIZE,
    );
    expect(map.stockpile).toEqual(ASHEN_GATE_STOCKPILE);
    expect(map.nodes.map((node) => node.id)).toEqual(
      ASHEN_GATE_NODE_SLOTS.flatMap((slot) => [slot.id, `${slot.id}-cluster`]),
    );
    for (const resourceId of RESOURCE_IDS) {
      expect(
        map.nodes.filter((node) => node.resourceId === resourceId),
      ).toHaveLength(resourceId === "wood" ? 8 : 4);
    }
    expect(map.veins.map((vein) => vein.id)).toEqual([
      "ashen-vein-hold",
      "ashen-vein-choke",
      "ashen-vein-frontier",
    ]);
    expect(map.obstacles.length).toBeGreaterThanOrEqual(16);
    expect(map.chokePoints.map((choke) => choke.id)).toEqual([
      "west-choke",
      "vent-choke",
      "spine-choke",
      "flank-choke",
      "canyon-choke",
      ...map.bridges.map((_, index) => `bridge-choke-${index + 1}`),
    ]);
  });

  test("every deposit has a nearby matching cluster mate", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      for (const slot of ASHEN_GATE_NODE_SLOTS) {
        const anchor = nodeOf(map, slot.id);
        const mate = nodeOf(map, `${slot.id}-cluster`);
        expect(mate.resourceId).toBe(anchor.resourceId);
        expect(mate.remaining).toBe(anchor.remaining);
        expect(distance(anchor, mate)).toBeGreaterThan(0);
        expect(distance(anchor, mate)).toBeLessThanOrEqual(7);
      }
    }
  });

  test("six nearby wood patches provide 1440 timber for early Housing", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const nearWood = ASHEN_GATE_NODE_SLOTS.filter(
        (slot) => slot.band === "near" && slot.resourceId === "wood",
      ).flatMap((slot) => [
        nodeOf(map, slot.id),
        nodeOf(map, `${slot.id}-cluster`),
      ]);
      expect(nearWood).toHaveLength(6);
      expect(nearWood.reduce((total, node) => total + node.remaining, 0)).toBe(
        1440,
      );
      expect(validateAshenGateMap(map)).toEqual([]);
    }
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
      const outerIds = ASHEN_GATE_NODE_SLOTS.filter(
        (slot) => slot.band === "outer",
      ).flatMap((slot) => [slot.id, `${slot.id}-cluster`]);
      for (const id of outerIds) {
        const node = nodeOf(map, id);
        const lane = distanceToSegment(node, campOf(map), gateOf(map));
        expect(lane).toBeGreaterThanOrEqual(6);
        expect(node.x).toBeGreaterThanOrEqual(3);
        expect(node.y).toBeGreaterThanOrEqual(3);
        expect(node.x).toBeLessThanOrEqual(map.width - 4);
        expect(node.y).toBeLessThanOrEqual(map.height - 4);
      }
    }
  });

  test("starts a Cultivator, Rider and the villagers beside the Camp", () => {
    const map = generateAshenGateMap(77);
    const camp = campOf(map);
    const villagers = map.units.filter((unit) => unit.classId === undefined);
    expect(villagers).toHaveLength(ASHEN_GATE_STARTING_VILLAGERS);
    const captain = map.units.find((unit) => unit.id === "ashen-captain");
    expect(captain?.classId).toBe("cultivator");
    expect(captain?.realmId).toBe("qi_gathering");
    const rider = map.units.find((unit) => unit.id === "ashen-rider");
    expect(rider?.classId).toBe("rider");
    expect(rider?.realmId).toBe("qi_gathering");
    expect(rider?.maxHp).toBe(105);
    expect(map.units).toHaveLength(5);
    expect({ x: rider?.x, y: rider?.y }).not.toEqual({
      x: captain?.x,
      y: captain?.y,
    });
    for (const unit of map.units) {
      expect(distance(unit, camp)).toBeLessThanOrEqual(5 + CAMP_EDGE);
      const site = { buildingType: "camp", ...camp };
      expect(footprintCovers(site, unit.x, unit.y)).toBe(false);
    }
  });
});

describe("Ashen Gate waterways", () => {
  test("every map floods rivers crossed by reachable bridges", () => {
    // The reachability flood is the slow part, so sample a subset of seeds.
    for (const seed of SEEDS.slice(0, 15)) {
      const map = mapFor(seed);
      const water = map.obstacles.filter(
        (entry) => entry.kind === "deep_water",
      );
      expect(water.length).toBeGreaterThan(30);
      expect(map.bridges.length).toBeGreaterThanOrEqual(4);
      const camp = map.buildings[0] as { x: number; y: number };
      const field = floodDistances(
        { height: map.height, width: map.width },
        camp,
        (x, y) =>
          !map.obstacles.some(
            (entry) => distance(entry, { x, y }) <= entry.radius + 0.05,
          ),
      );
      for (const bridge of map.bridges) {
        const cell = { x: Math.round(bridge.x), y: Math.round(bridge.y) };
        expect(stepsTo(field, cell)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("a dry map has no water and no bridges", () => {
    const map = generateAshenGateMap(1, { waterways: false });
    expect(map.bridges).toHaveLength(0);
    expect(map.obstacles.some((entry) => entry.kind === "deep_water")).toBe(
      false,
    );
  });

  test("water never touches the Camp apron, vents, or deposits", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed);
      const water = map.obstacles.filter(
        (entry) => entry.kind === "deep_water",
      );
      const camp = map.buildings[0] as { x: number; y: number };
      for (const disk of water) {
        expect(distance(disk, camp)).toBeGreaterThan(disk.radius + 6);
        for (const node of map.nodes) {
          expect(distance(disk, node)).toBeGreaterThan(disk.radius);
        }
      }
    }
  });
});
