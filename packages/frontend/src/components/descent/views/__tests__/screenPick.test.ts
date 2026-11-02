import { describe, expect, test } from "bun:test";
import {
  distanceToSegment,
  MIN_UNIT_CLICK_RADIUS,
  unitAtScreenPoint,
} from "../screenPick";

describe("distanceToSegment", () => {
  test("measures to the nearest point on the segment, clamped at its ends", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 10 };
    expect(distanceToSegment({ x: 3, y: 5 }, start, end)).toBeCloseTo(3);
    expect(distanceToSegment({ x: 0, y: 14 }, start, end)).toBeCloseTo(4);
    expect(distanceToSegment({ x: 4, y: 3 }, start, start)).toBeCloseTo(5);
  });
});

describe("unitAtScreenPoint", () => {
  const warden = {
    feet: { x: 100, y: 200 },
    head: { x: 100, y: 140 },
    id: "w",
  };
  const villager = {
    feet: { x: 160, y: 200 },
    head: { x: 160, y: 150 },
    id: "v",
  };

  test("hits a unit anywhere along its body", () => {
    expect(unitAtScreenPoint({ x: 104, y: 170 }, [warden, villager])).toBe("w");
    expect(unitAtScreenPoint({ x: 158, y: 198 }, [warden, villager])).toBe("v");
  });

  test("picks the nearer of two overlapping units", () => {
    const close = {
      feet: { x: 110, y: 200 },
      head: { x: 110, y: 140 },
      id: "c",
    };
    expect(unitAtScreenPoint({ x: 108, y: 170 }, [warden, close])).toBe("c");
  });

  test("misses empty ground", () => {
    expect(
      unitAtScreenPoint({ x: 130, y: 260 }, [warden, villager]),
    ).toBeNull();
  });

  test("keeps a minimum reach for tiny, zoomed-out units", () => {
    const tiny = { feet: { x: 50, y: 50 }, head: { x: 50, y: 48 }, id: "t" };
    expect(
      unitAtScreenPoint({ x: 50 + MIN_UNIT_CLICK_RADIUS - 1, y: 50 }, [tiny]),
    ).toBe("t");
  });
});
