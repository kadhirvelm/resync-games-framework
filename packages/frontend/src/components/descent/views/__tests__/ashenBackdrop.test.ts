import { describe, expect, test } from "bun:test";
import { ashenBackdropPieces } from "../ashenBackdrop";

describe("ashen backdrop", () => {
  test("keeps every distant rock outside the playable map", () => {
    const width = 64;
    const height = 40;
    const pieces = ashenBackdropPieces(width, height);

    expect(pieces.length).toBeGreaterThan(8);
    for (const piece of pieces) {
      const outsideX = piece.x < -4 || piece.x > width + 4;
      const outsideZ = piece.z < -4 || piece.z > height + 4;
      expect(outsideX || outsideZ).toBe(true);
      expect(piece.height).toBeGreaterThan(0);
    }
  });

  test("repeats the same horizon", () => {
    expect(ashenBackdropPieces(64, 40)).toEqual(ashenBackdropPieces(64, 40));
  });
});
