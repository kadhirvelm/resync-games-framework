import { describe, expect, it } from "bun:test";
import { cinderBirdFrame } from "../ashenCinders";

describe("cinderBirdFrame", () => {
  it("keeps a bird on its circle", () => {
    const pose = {
      centerX: 20,
      centerZ: 30,
      height: 18,
      phase: 1,
      radius: 25,
      time: 12,
    };
    const frame = cinderBirdFrame(pose);
    const distance = Math.hypot(frame.x - 20, frame.z - 30);
    expect(distance).toBeCloseTo(25, 5);
    expect(Math.abs(frame.y - 18)).toBeLessThanOrEqual(1.6);
  });

  it("beats wings over time and stays deterministic", () => {
    const pose = {
      centerX: 0,
      centerZ: 0,
      height: 16,
      phase: 0,
      radius: 10,
      time: 0,
    };
    const early = cinderBirdFrame(pose);
    const later = cinderBirdFrame({ ...pose, time: 0.2 });
    expect(early.flap).not.toBe(later.flap);
    expect(cinderBirdFrame(pose)).toEqual(early);
    expect(Math.abs(later.flap)).toBeLessThanOrEqual(0.65);
  });
});
