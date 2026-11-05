import { describe, expect, test } from "bun:test";
import { createFogOfWar, revealFogOfWar } from "../../logic/fog";
import {
  type AshenSceneryPlacement,
  ashenSceneryPlacements,
} from "../ashenTerrainLayout";
import { revealedSceneryIds } from "../sceneryFog";

const WIDTH = 40;
const HEIGHT = 30;

/**
 * @param id - Placement id
 * @param x - World x
 * @param z - World z
 * @returns A small rim prop
 */
function prop(id: string, x: number, z: number): AshenSceneryPlacement {
  return {
    footprint: 2,
    height: 3,
    id,
    role: "basaltBoulders",
    rotation: 0,
    x,
    y: 0,
    z,
  };
}

describe("scenery fog", () => {
  test("everything shows when the layer has no fog", () => {
    const placements = ashenSceneryPlacements(WIDTH, HEIGHT);
    expect(revealedSceneryIds(null, placements, HEIGHT).size).toBe(
      placements.length,
    );
  });

  test("nothing shows before any ground is explored", () => {
    const fog = createFogOfWar({ height: HEIGHT, width: WIDTH });
    const placements = ashenSceneryPlacements(WIDTH, HEIGHT);
    expect(revealedSceneryIds(fog, placements, HEIGHT).size).toBe(0);
  });

  test("a rim prop shows once the map edge beside it is explored", () => {
    // Explore the west edge near map y = 5 (world z = 25).
    const fog = revealFogOfWar(
      createFogOfWar({ height: HEIGHT, width: WIDTH }),
      [{ radius: 3, x: 1, y: 5 }],
    );
    const placements = [
      prop("west-near", -4, HEIGHT - 5),
      prop("west-far", -4, HEIGHT - 25),
      prop("east", WIDTH + 4, HEIGHT - 5),
    ];
    expect([...revealedSceneryIds(fog, placements, HEIGHT)]).toEqual([
      "west-near",
    ]);
  });

  test("scenery stays revealed after sight moves away", () => {
    const seen = revealFogOfWar(
      createFogOfWar({ height: HEIGHT, width: WIDTH }),
      [{ radius: 3, x: 1, y: 5 }],
    );
    const moved = revealFogOfWar(seen, [{ radius: 3, x: 20, y: 15 }]);
    const placements = [prop("west-near", -4, HEIGHT - 5)];
    expect(revealedSceneryIds(moved, placements, HEIGHT).has("west-near")).toBe(
      true,
    );
  });
});
