import { describe, expect, test } from "bun:test";
import { hashSeed, leafOutline, washBlots } from "../leafShape";

describe("leafOutline", () => {
  test("runs from stem to tip along the angle and stays within its width", () => {
    const points = leafOutline(0, 0, 40, 16, 0, 8);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.min(...xs)).toBeCloseTo(-20);
    expect(Math.max(...xs)).toBeCloseTo(20);
    expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(8.0001);
    expect(points).toHaveLength(9 + 7);
  });
});

describe("washBlots", () => {
  test("the same seed paints the same wash", () => {
    expect(washBlots(10, 10, 50, hashSeed("fox"))).toEqual(
      washBlots(10, 10, 50, hashSeed("fox")),
    );
    expect(washBlots(10, 10, 50, 1)).not.toEqual(washBlots(10, 10, 50, 2));
  });
});
