import { describe, expect, test } from "bun:test";
import { pointerParallax, tiltFromPointer } from "../tilt";

const BOX = { height: 200, left: 100, top: 50, width: 100 };

describe("tiltFromPointer", () => {
  test("the center sits flat with the glare in the middle", () => {
    expect(tiltFromPointer(BOX, 150, 150)).toEqual({
      glareX: 50,
      glareY: 50,
      rotateX: 0,
      rotateY: 0,
    });
  });

  test("the top right corner leans fully toward the pointer", () => {
    expect(tiltFromPointer(BOX, 200, 50, 10)).toEqual({
      glareX: 100,
      glareY: 0,
      rotateX: 10,
      rotateY: 10,
    });
  });

  test("a pointer outside the card is clamped to its edge", () => {
    const pose = tiltFromPointer(BOX, -500, 900, 6);
    expect(pose.rotateY).toBe(-6);
    expect(pose.rotateX).toBe(-6);
  });

  test("an empty box does not produce NaN", () => {
    const pose = tiltFromPointer(
      { height: 0, left: 0, top: 0, width: 0 },
      0,
      0,
    );
    expect(Number.isNaN(pose.rotateX)).toBe(false);
    expect(Number.isNaN(pose.rotateY)).toBe(false);
  });
});

describe("pointerParallax", () => {
  test("maps the view to -1 through 1", () => {
    expect(pointerParallax(0, 0, 200, 100)).toEqual({ x: -1, y: -1 });
    expect(pointerParallax(100, 50, 200, 100)).toEqual({ x: 0, y: 0 });
    expect(pointerParallax(200, 100, 200, 100)).toEqual({ x: 1, y: 1 });
  });
});
