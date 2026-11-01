import { describe, expect, test } from "bun:test";
import { arrowCurve, arrowMarkCount, resolveCardRelease } from "../cardAim";

describe("arrowCurve", () => {
  test("ends on the pointer and leaves the card heading upward", () => {
    const marks = arrowCurve({ x: 600, y: 600 }, { x: 900, y: 300 }, 10);
    expect(marks).toHaveLength(10);
    const last = marks[marks.length - 1];
    expect(last?.x).toBeCloseTo(900);
    expect(last?.y).toBeCloseTo(300);
    // The first chevron rises more than it moves sideways.
    const first = marks[0];
    expect(600 - (first?.y ?? 0)).toBeGreaterThan((first?.x ?? 0) - 600);
    // By the end it heads right, toward the pointer.
    expect(Math.cos(last?.angle ?? 0)).toBeGreaterThan(0.9);
  });

  test("always draws at least one chevron", () => {
    expect(arrowCurve({ x: 0, y: 0 }, { x: 0, y: -10 }, 0)).toHaveLength(1);
  });
});

describe("arrowMarkCount", () => {
  test("spaces chevrons along the arrow's length", () => {
    expect(arrowMarkCount({ x: 0, y: 0 }, { x: 0, y: 300 }, 30)).toBe(10);
    expect(arrowMarkCount({ x: 0, y: 0 }, { x: 0, y: 5 }, 30)).toBe(2);
  });
});

describe("resolveCardRelease", () => {
  test("a card with no target plays above the hand and returns below it", () => {
    const base = { playLineY: 500, targeting: "none" as const };
    expect(resolveCardRelease({ ...base, pointerY: 400 })).toEqual({
      kind: "play",
    });
    expect(resolveCardRelease({ ...base, pointerY: 600 })).toEqual({
      kind: "cancel",
    });
  });

  test("an aimed card plays on the unit under the arrow", () => {
    expect(
      resolveCardRelease({
        hoveredTargetId: "wolf",
        playLineY: 500,
        pointerY: 300,
        targeting: "enemy",
      }),
    ).toEqual({ kind: "play", targetId: "wolf" });
  });

  test("an aimed card released over nothing returns to the hand", () => {
    expect(
      resolveCardRelease({ playLineY: 500, pointerY: 300, targeting: "enemy" }),
    ).toEqual({ kind: "cancel" });
  });

  test("with one legal target, pulling the card up is enough", () => {
    const input = {
      onlyTargetId: "wolf",
      playLineY: 500,
      targeting: "enemy" as const,
    };
    expect(resolveCardRelease({ ...input, pointerY: 300 })).toEqual({
      kind: "play",
      targetId: "wolf",
    });
    expect(resolveCardRelease({ ...input, pointerY: 600 })).toEqual({
      kind: "cancel",
    });
  });
});
