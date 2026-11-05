import { describe, expect, test } from "bun:test";
import {
  angleBetween,
  createMapRng,
  deriveSeed,
  distance,
  distanceToSegment,
  floodDistances,
  pickBest,
  poissonDiskSample,
  sideOfLine,
  stepsTo,
  stepsToBeside,
} from "..";

describe("deriveSeed", () => {
  test("is stable for a seed and salt, and changes with either", () => {
    expect(deriveSeed(42, "layout")).toBe(deriveSeed(42, "layout"));
    expect(deriveSeed(42, "layout")).not.toBe(deriveSeed(43, "layout"));
    expect(deriveSeed(42, "layout")).not.toBe(deriveSeed(42, "veins"));
  });

  test("map RNG streams are independent of each other", () => {
    const first = createMapRng(7, "a");
    const second = createMapRng(7, "b");
    expect(first.next()).not.toBe(second.next());
  });
});

describe("poissonDiskSample", () => {
  const area = { height: 40, width: 60, x: 2, y: 3 };

  test("keeps every pair of points at least the minimum distance apart", () => {
    const points = poissonDiskSample(createMapRng(1, "test"), area, 4);
    for (let left = 0; left < points.length; left += 1) {
      for (let right = left + 1; right < points.length; right += 1) {
        const a = points[left];
        const b = points[right];
        if (!a || !b) throw new Error("missing point");
        expect(distance(a, b)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test("fills the area: no point of the area is far from a sample", () => {
    const points = poissonDiskSample(createMapRng(2, "test"), area, 4);
    for (let y = area.y; y < area.y + area.height; y += 2) {
      for (let x = area.x; x < area.x + area.width; x += 2) {
        const nearest = Math.min(...points.map((p) => distance(p, { x, y })));
        expect(nearest).toBeLessThan(8);
      }
    }
  });

  test("stays inside the area and repeats exactly for the same seed", () => {
    const first = poissonDiskSample(createMapRng(3, "test"), area, 5);
    const second = poissonDiskSample(createMapRng(3, "test"), area, 5);
    expect(first).toEqual(second);
    for (const point of first) {
      expect(point.x).toBeGreaterThanOrEqual(area.x);
      expect(point.y).toBeGreaterThanOrEqual(area.y);
      expect(point.x).toBeLessThan(area.x + area.width);
      expect(point.y).toBeLessThan(area.y + area.height);
    }
  });

  test("returns nothing for an empty area or zero spacing", () => {
    const rng = createMapRng(4, "test");
    expect(poissonDiskSample(rng, { ...area, width: 0 }, 4)).toEqual([]);
    expect(poissonDiskSample(rng, area, 0)).toEqual([]);
  });
});

describe("floodDistances", () => {
  const size = { height: 5, width: 7 };
  /** A wall down column 3 with one gap on the bottom row. */
  const passable = (x: number, y: number) => x !== 3 || y === 4;

  test("counts four-way steps around walls", () => {
    const field = floodDistances(size, { x: 0, y: 0 }, passable);
    expect(stepsTo(field, { x: 2, y: 0 })).toBe(2);
    // Down to the gap, through it, and back up: 4 + 4 + 4.
    expect(stepsTo(field, { x: 4, y: 0 })).toBe(12);
    expect(stepsTo(field, { x: 3, y: 0 })).toBe(-1);
    expect(stepsTo(field, { x: 9, y: 0 })).toBe(-1);
  });

  test("a blocked origin still floods outward, and sealed areas stay -1", () => {
    const sealed = (x: number) => x !== 3;
    const field = floodDistances(size, { x: 3, y: 2 }, sealed);
    expect(stepsTo(field, { x: 3, y: 2 })).toBe(0);
    expect(stepsTo(field, { x: 2, y: 2 })).toBe(1);
    const walled = floodDistances(size, { x: 0, y: 0 }, sealed);
    expect(stepsTo(walled, { x: 6, y: 4 })).toBe(-1);
  });

  test("stepsToBeside reaches an occupied cell from any neighbor", () => {
    const blocked = (x: number, y: number) => !(x === 5 && y === 2);
    const field = floodDistances(size, { x: 0, y: 2 }, blocked);
    expect(stepsTo(field, { x: 5, y: 2 })).toBe(-1);
    expect(stepsToBeside(field, { x: 5, y: 2 })).toBe(4);
  });
});

describe("geometry and selection helpers", () => {
  test("pickBest keeps the highest score, skips rejections, and keeps ties stable", () => {
    expect(pickBest([1, 5, 3], (value) => value)).toBe(5);
    expect(pickBest([1, 5, 3], (value) => (value === 5 ? null : value))).toBe(
      3,
    );
    expect(pickBest(["a", "b"], () => 1)).toBe("a");
    expect(pickBest([1, 2], () => null)).toBeNull();
  });

  test("sideOfLine splits screen space left and right of a heading", () => {
    const start = { x: 0, y: 0 };
    const east = { x: 10, y: 0 };
    expect(sideOfLine({ x: 5, y: 3 }, start, east)).toBe(1);
    expect(sideOfLine({ x: 5, y: -3 }, start, east)).toBe(-1);
    expect(sideOfLine({ x: 5, y: 0 }, start, east)).toBe(0);
  });

  test("distanceToSegment clamps to the segment's ends", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 4 }, start, end)).toBe(4);
    expect(distanceToSegment({ x: -3, y: 4 }, start, end)).toBe(5);
  });

  test("angleBetween wraps around the circle", () => {
    expect(angleBetween(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(0.2);
    expect(angleBetween(0, Math.PI)).toBeCloseTo(Math.PI);
  });
});
