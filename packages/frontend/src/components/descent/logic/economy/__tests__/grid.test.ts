import { describe, expect, test } from "bun:test";
import { nextStep } from "../grid";

describe("nextStep fractional combat positions", () => {
  test("reconstructs an integer parent chain for a fractional start", () => {
    expect(
      nextStep(
        { x: 37.58, y: 66.887 },
        { x: 39, y: 68 },
        () => true,
        252,
        156,
        1,
      ),
    ).toEqual({
      x: 39,
      y: 67,
    });
  });

  test("keeps every returned cell integral and inside the map", () => {
    const next = nextStep(
      { x: 36.8, y: 64.82 },
      { x: 39, y: 68 },
      () => true,
      252,
      156,
      1,
    );
    expect(next).not.toBeNull();
    expect(Number.isInteger(next?.x)).toBe(true);
    expect(Number.isInteger(next?.y)).toBe(true);
    expect(next?.x).toBeGreaterThanOrEqual(0);
    expect(next?.y).toBeGreaterThanOrEqual(0);
    expect(next?.x).toBeLessThan(252);
    expect(next?.y).toBeLessThan(156);
  });
});
