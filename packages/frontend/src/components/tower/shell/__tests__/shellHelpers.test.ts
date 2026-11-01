import { describe, expect, test } from "bun:test";
import { countUpValue, tweenValue } from "../countUp";
import { ascensionNumeral, formatTimeAgo } from "../formatTime";

const MINUTE = 60_000;

describe("formatTimeAgo", () => {
  test("reads like a person would say it", () => {
    expect(formatTimeAgo(0, 10_000)).toBe("just now");
    expect(formatTimeAgo(0, 5 * MINUTE)).toBe("5 min ago");
    expect(formatTimeAgo(0, 60 * MINUTE)).toBe("1 hour ago");
    expect(formatTimeAgo(0, 5 * 60 * MINUTE)).toBe("5 hours ago");
    expect(formatTimeAgo(0, 24 * 60 * MINUTE)).toBe("yesterday");
    expect(formatTimeAgo(0, 72 * 60 * MINUTE)).toBe("3 days ago");
  });

  test("a clock that runs backwards still says just now", () => {
    expect(formatTimeAgo(5000, 0)).toBe("just now");
  });
});

describe("ascensionNumeral", () => {
  test("uses numerals for the supported levels", () => {
    expect(ascensionNumeral(0)).toBe("0");
    expect(ascensionNumeral(4)).toBe("IV");
    expect(ascensionNumeral(12)).toBe("12");
  });
});

describe("countUpValue", () => {
  test("starts at zero, eases up, and lands on the target", () => {
    expect(countUpValue(80, -100, 1000)).toBe(0);
    expect(countUpValue(80, 0, 1000)).toBe(0);
    const middle = countUpValue(80, 500, 1000);
    expect(middle).toBeGreaterThan(40);
    expect(middle).toBeLessThan(80);
    expect(countUpValue(80, 1000, 1000)).toBe(80);
    expect(countUpValue(80, 5, 0)).toBe(80);
  });
});

describe("tweenValue", () => {
  test("starts at the old value and lands on the new one", () => {
    expect(tweenValue(40, 10, 0, 500)).toBe(40);
    expect(tweenValue(40, 10, 500, 500)).toBe(10);
    expect(tweenValue(40, 10, 900, 500)).toBe(10);
  });

  test("moves most of the way early, easing out", () => {
    const halfway = tweenValue(0, 100, 250, 500);
    expect(halfway).toBeGreaterThan(50);
    expect(halfway).toBeLessThan(100);
  });

  test("no duration jumps straight to the end", () => {
    expect(tweenValue(3, 7, 0, 0)).toBe(7);
  });
});
