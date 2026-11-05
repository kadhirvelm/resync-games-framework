import { describe, expect, test } from "bun:test";
import {
  ABYSS_DEPTH,
  ashenBackdropPieces,
  ashenSceneryPlacements,
  PLATEAU_RIM,
} from "../ashenTerrainLayout";

const WIDTH = 168;
const HEIGHT = 104;

/**
 * @param x - World x
 * @param z - World z
 * @param margin - Extra distance past the map edge
 * @returns Whether the point lies outside the map grown by the margin
 */
function outsideMap(x: number, z: number, margin: number): boolean {
  return (
    x < -margin || x > WIDTH + margin || z < -margin || z > HEIGHT + margin
  );
}

describe("ashen terrain layout", () => {
  test("stands every distant rock in the lava beyond the plateau", () => {
    const pieces = ashenBackdropPieces(WIDTH, HEIGHT);

    expect(pieces.length).toBeGreaterThan(8);
    for (const piece of pieces) {
      expect(outsideMap(piece.x, piece.z, PLATEAU_RIM)).toBe(true);
      expect(piece.height).toBeGreaterThan(0);
    }
  });

  test("keeps all scenery off the playable map", () => {
    for (const placement of ashenSceneryPlacements(WIDTH, HEIGHT)) {
      expect(outsideMap(placement.x, placement.z, 0)).toBe(true);
    }
  });

  test("keeps rim scenery on the plateau and spires in the abyss", () => {
    for (const placement of ashenSceneryPlacements(WIDTH, HEIGHT)) {
      if (placement.role === "abyssSpire") {
        expect(placement.y).toBe(-ABYSS_DEPTH);
        continue;
      }
      expect(placement.y).toBe(0);
      expect(outsideMap(placement.x, placement.z, PLATEAU_RIM)).toBe(false);
    }
  });

  test("puts one Horde Gate on the east rim, level with the spawn row", () => {
    const gates = ashenSceneryPlacements(WIDTH, HEIGHT).filter(
      (placement) => placement.role === "hordeGate",
    );

    expect(gates).toHaveLength(1);
    expect(gates[0]?.x).toBeGreaterThan(WIDTH);
    expect(gates[0]?.z).toBe(HEIGHT / 2);
  });

  test("repeats the same layout on every load", () => {
    expect(ashenSceneryPlacements(WIDTH, HEIGHT)).toEqual(
      ashenSceneryPlacements(WIDTH, HEIGHT),
    );
  });
});
