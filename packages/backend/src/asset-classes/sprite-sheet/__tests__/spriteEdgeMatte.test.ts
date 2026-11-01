import { describe, expect, test } from "bun:test";
import {
  estimateEdgeAlpha,
  minimumAlpha,
  neighborIndexes,
  type Rgb,
  unmixColor,
} from "../spriteEdgeMatte";

const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [200, 40, 40];
const HALF_RED_ON_WHITE: Rgb = [227.5, 147.5, 147.5];

describe("minimumAlpha", () => {
  test("is zero for the background and one for a channel that reaches zero", () => {
    expect(minimumAlpha(WHITE, WHITE)).toBe(0);
    expect(minimumAlpha([255, 0, 255], WHITE)).toBe(1);
  });

  test("uses the channel that moved furthest from the background", () => {
    expectClose(minimumAlpha(HALF_RED_ON_WHITE, WHITE), 107.5 / 255);
  });

  test("measures upward moves against the room above a darker background", () => {
    expectClose(minimumAlpha([150, 100, 100], [100, 100, 100]), 50 / 155);
  });
});

describe("estimateEdgeAlpha", () => {
  test("recovers the blend share when the foreground color is known", () => {
    expectClose(estimateEdgeAlpha(HALF_RED_ON_WHITE, WHITE, RED), 0.5);
  });

  test("treats a pale foreground pixel as solid when its neighbors share the color", () => {
    const pale: Rgb = [235, 225, 180];

    expect(estimateEdgeAlpha(pale, WHITE, pale)).toBe(1);
  });

  test("falls back to the color-to-alpha bound without a foreground", () => {
    expectClose(
      estimateEdgeAlpha(HALF_RED_ON_WHITE, WHITE, undefined),
      107.5 / 255,
    );
  });

  test("never goes below the bound when the foreground hue does not match", () => {
    const blueOnWhite: Rgb = [155, 155, 255];

    expect(estimateEdgeAlpha(blueOnWhite, WHITE, RED)).toBeGreaterThanOrEqual(
      minimumAlpha(blueOnWhite, WHITE),
    );
  });

  test("ignores a foreground too close to the background to unmix along", () => {
    expectClose(
      estimateEdgeAlpha(HALF_RED_ON_WHITE, WHITE, [250, 250, 250]),
      107.5 / 255,
    );
  });
});

describe("unmixColor", () => {
  test("removes the white share from a blended edge", () => {
    expect(unmixColor(HALF_RED_ON_WHITE, WHITE, 0.5)).toEqual(RED);
  });

  test("clamps to the byte range", () => {
    expect(unmixColor([100, 100, 100], WHITE, 0.1)).toEqual([0, 0, 0]);
  });
});

describe("neighborIndexes", () => {
  test("returns side neighbors by default and adds diagonals on request", () => {
    expect(neighborIndexes(1, 1, 3, 3).sort()).toEqual([1, 3, 5, 7]);
    expect(neighborIndexes(1, 1, 3, 3, true)).toHaveLength(8);
  });

  test("stays inside the image at a corner", () => {
    expect(neighborIndexes(0, 0, 3, 3, true).sort()).toEqual([1, 3, 4]);
  });
});

/**
 * Expects two numbers to match to six decimal places.
 * @param actual - Measured value
 * @param expected - Wanted value
 */
function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(1e-6);
}
