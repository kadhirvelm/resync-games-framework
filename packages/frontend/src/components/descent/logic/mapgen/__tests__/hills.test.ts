import { describe, expect, test } from "bun:test";
import { generateAshenCrucibleMap } from "../../../data/layers/ashen_crucible";
import {
  ASHEN_GATE_MAP_SIZE,
  ASHEN_GATE_MAP_TYPES,
  ASHEN_GATE_STOCKPILE,
  generateAshenGateMap,
  validateAshenGateMap,
} from "../../../data/layers/ashen_gate";
import { createAshenGateSim } from "../../ashenGateSlice";
import { elevationAt } from "../../layers/elevation";
import { distance } from "../geometry";
import { placeHills } from "../hills";
import { createMapRng } from "../random";

describe("placeHills and map hill integration", () => {
  test("placeHills is deterministic and respects placement rules", () => {
    const spec = {
      canPlace: (x: number, y: number, radius: number) =>
        distance({ x, y }, { x: 20, y: 50 }) >= radius + 12,
      count: 6,
      height: 120,
      idPrefix: "test",
      width: 200,
    };
    const first = placeHills({ ...spec, rng: createMapRng(42, "hills") });
    const second = placeHills({ ...spec, rng: createMapRng(42, "hills") });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(6);
    for (const hill of first) {
      expect(hill.height).toBeGreaterThan(0);
      expect(hill.plateauRadius).toBeGreaterThan(0);
      expect(hill.plateauRadius).toBeLessThan(hill.radius);
      expect(hill.x - hill.radius).toBeGreaterThanOrEqual(0);
      expect(hill.x + hill.radius).toBeLessThanOrEqual(200);
      expect(hill.y - hill.radius).toBeGreaterThanOrEqual(0);
      expect(hill.y + hill.radius).toBeLessThanOrEqual(120);
    }
  });

  test("generateAshenGateMap places walkable hills while keeping Camp and rivers flat", () => {
    const map = generateAshenGateMap(7);
    expect(map.hills.length).toBeGreaterThan(0);

    const camp = map.buildings.find((b) => b.buildingType === "camp");
    expect(camp).toBeDefined();
    if (camp) {
      expect(elevationAt(map.hills, camp.x, camp.y)).toBe(0);
    }

    for (const water of map.obstacles.filter((o) => o.kind === "deep_water")) {
      expect(elevationAt(map.hills, water.x, water.y)).toBe(0);
    }
    for (const bridge of map.bridges) {
      expect(elevationAt(map.hills, bridge.x, bridge.y)).toBe(0);
    }
  });

  test("generateAshenCrucibleMap includes walkable hills while keeping Camps and rivers flat", () => {
    const map = generateAshenCrucibleMap(19, [
      { color: "#d4a74e", id: "p1", name: "Host", slotIndex: 0 },
      { color: "#59d5ef", id: "p2", name: "Ally", slotIndex: 1 },
    ]);
    expect(map.hills.length).toBeGreaterThan(0);
    for (const camp of map.buildings.filter((b) => b.buildingType === "camp")) {
      expect(elevationAt(map.hills, camp.x, camp.y)).toBe(0);
    }
    for (const water of map.obstacles.filter((o) => o.kind === "deep_water")) {
      expect(elevationAt(map.hills, water.x, water.y)).toBe(0);
    }
  });

  test("all four terrain map archetypes generate valid, distinct layouts", () => {
    for (const option of ASHEN_GATE_MAP_TYPES) {
      const map = generateAshenGateMap(17, { mapType: option.id });
      expect(validateAshenGateMap(map)).toEqual([]);
      expect(map.hills.length).toBeGreaterThan(0);
    }

    const highlands = generateAshenGateMap(17, { mapType: "highlands" });
    const steppe = generateAshenGateMap(17, { mapType: "open_steppe" });
    const crown = generateAshenGateMap(17, { mapType: "king_of_the_hill" });

    expect(highlands.hills.length).toBeGreaterThan(steppe.hills.length);
    expect(highlands.bridges.length).toBe(3);
    expect(steppe.bridges.length).toBe(0);
    expect(crown.bridges.length).toBe(0);

    // Crown Plateau places a commanding two-tier central fortress summit.
    const centerElevation = elevationAt(
      crown.hills,
      Math.round(ASHEN_GATE_MAP_SIZE.width * 0.48),
      Math.round(ASHEN_GATE_MAP_SIZE.height * 0.5),
    );
    expect(centerElevation).toBeGreaterThanOrEqual(3.8);
  });

  test("createAshenGateSim applies mapType, startingResources, and difficulty", () => {
    const standard = createAshenGateSim({
      difficulty: "standard",
      mapType: "open_steppe",
      seed: 11,
      startingResources: "standard",
    }).snapshot();
    const deathmatch = createAshenGateSim({
      difficulty: "brutal",
      mapType: "king_of_the_hill",
      seed: 11,
      startingResources: "deathmatch",
    }).snapshot();

    const baseWood = ASHEN_GATE_STOCKPILE.wood ?? 0;
    expect(standard.resources.wood).toBe(baseWood);
    expect(deathmatch.resources.wood).toBeGreaterThan(baseWood * 3);
    expect(deathmatch.resources.iron).toBeGreaterThan(0);
  });
});
