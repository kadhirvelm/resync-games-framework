import { describe, expect, test } from "bun:test";
import { spriteAnimationDisplay } from "../spriteAnimation";

describe("spriteAnimationDisplay", () => {
  test("holds each of six frames for one tick at the requested fps", () => {
    expect(
      spriteAnimationDisplay({
        displayHeight: 160,
        fps: 12,
        frameCount: 6,
        frameHeight: 320,
        frameWidth: 240,
      }),
    ).toEqual({
      durationSeconds: 0.5,
      height: 160,
      timingFunction: "steps(6, jump-none)",
      width: 120,
    });
  });

  test("shows a single frame without stepping", () => {
    expect(
      spriteAnimationDisplay({
        displayHeight: 100,
        fps: 8,
        frameCount: 1,
        frameHeight: 100,
        frameWidth: 100,
      }).timingFunction,
    ).toBeUndefined();
  });

  test("falls back to one frame per second for a missing fps", () => {
    expect(
      spriteAnimationDisplay({
        displayHeight: 100,
        fps: 0,
        frameCount: 4,
        frameHeight: 100,
        frameWidth: 100,
      }).durationSeconds,
    ).toBe(4);
  });
});
