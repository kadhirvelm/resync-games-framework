import { describe, expect, test } from "bun:test";
import { createFogOfWar } from "../../logic/fog";
import {
  type PlacementValidityModel,
  placementBlockReason,
  placementGroundValid,
} from "../placementValidity";

/**
 * Builds a minimal placement-validity model with open ground.
 * @param overrides - Slices to override
 * @returns Model ready for `placementGroundValid`
 */
function model(
  overrides: Partial<PlacementValidityModel> = {},
): PlacementValidityModel {
  return {
    buildings: [],
    map: { height: 40, width: 40 },
    nodes: [],
    terrain: [],
    ...overrides,
  };
}

describe("placementGroundValid", () => {
  test("allows open ground and rejects impassable terrain obstacles", () => {
    expect(placementGroundValid(model(), "hut", { x: 10, y: 10 })).toBe(true);
    expect(
      placementGroundValid(
        model({
          terrain: [
            {
              height: 1,
              id: "water-1",
              kind: "deep_water",
              label: "River",
              radius: 3,
              x: 10,
              y: 10,
            },
          ],
        }),
        "hut",
        { x: 10, y: 10 },
      ),
    ).toBe(false);
  });

  test("does not treat walkable bridges as blocking building placement", () => {
    expect(
      placementGroundValid(
        model({
          terrain: [
            {
              angle: 0,
              height: 0.35,
              id: "bridge-1",
              kind: "bridge",
              label: "Plank bridge",
              radius: 4,
              width: 3,
              x: 10,
              y: 10,
            },
          ],
        }),
        "hut",
        { x: 10, y: 10 },
      ),
    ).toBe(true);
  });

  test("rejects unexplored fog, unaffordable, or tier-locked placements with reasons", () => {
    const fog = createFogOfWar({ height: 40, width: 40 });
    expect(placementGroundValid(model({ fog }), "hut", { x: 10, y: 10 })).toBe(
      false,
    );
    expect(
      placementBlockReason(model({ fog }), "hut", { x: 10, y: 10 }),
    ).toContain("Explore");

    expect(
      placementBlockReason(
        model({
          buildOptions: [
            {
              affordable: false,
              buildingType: "hut",
              cost: { wood: 30 },
              costLabel: "wood 30",
              hints: [],
              job: "Housing",
              lockedReason: "Need wood 30",
              name: "Hut",
              tier: "Camp",
              unlocked: true,
            },
          ],
        }),
        "hut",
        { x: 10, y: 10 },
      ),
    ).toBe("Need wood 30");

    expect(
      placementBlockReason(
        model({
          buildOptions: [
            {
              affordable: true,
              buildingType: "barracks",
              cost: { wood: 50 },
              costLabel: "wood 50",
              hints: [],
              job: "Training",
              name: "Barracks",
              tier: "Outpost",
              unlocked: false,
            },
          ],
        }),
        "barracks",
        { x: 10, y: 10 },
      ),
    ).toBe("Requires Outpost.");
  });
});
