import { describe, expect, test } from "bun:test";
import {
  advanceGait,
  advancePresentationTime,
  animationClipMatches,
  estimateStepInterval,
  gaitMotion,
  MAX_STEP_INTERVAL_MS,
  motionBlend,
  smoothAngle,
  stepProgress,
  unitMotionPhase,
} from "../motion";

describe("descent presentation motion", () => {
  test("uses the same exponential response across split frames", () => {
    const wholeFrame = motionBlend(32, 120);
    const halfFrame = motionBlend(16, 120);
    const composed = halfFrame + (1 - halfFrame) * halfFrame;

    expect(composed).toBeCloseTo(wholeFrame, 10);
  });

  test("turns across the short side of the radians seam", () => {
    const current = Math.PI - 0.1;
    const target = -Math.PI + 0.1;
    const halfway = smoothAngle(current, target, 0.5);

    expect(halfway).toBeCloseTo(Math.PI, 5);
  });

  test("finds clips after Babylon prefixes an instance name", () => {
    expect(animationClipMatches("walk", "walk")).toBe(true);
    expect(animationClipMatches("warden-1-walk", "walk")).toBe(true);
    expect(animationClipMatches("warden-1-idle", "walk")).toBe(false);
  });

  test("desynchronizes units and gives locomotion a stronger cadence", () => {
    const first = unitMotionPhase("villager-1");
    const second = unitMotionPhase("villager-2");
    expect(first).not.toBe(second);

    let standing = { phase: first, weight: 0 };
    let walking = { phase: first, weight: 0 };
    for (let frame = 0; frame < 120; frame += 1) {
      standing = advanceGait(standing, 16, false);
      walking = advanceGait(walking, 16, true);
    }
    expect(walking.weight).toBeGreaterThan(0.99);
    expect(standing.weight).toBeLessThan(0.01);
    expect(Math.abs(walking.phase - standing.phase)).toBeGreaterThan(0.01);
    expect(gaitMotion(walking).bob).toBeGreaterThanOrEqual(0);
  });

  test("never pops the bob when a unit starts walking", () => {
    const gait = { phase: 1.3, weight: 0 };
    const before = gaitMotion(gait);
    const after = gaitMotion(advanceGait(gait, 16, true));
    expect(Math.abs(after.bob - before.bob)).toBeLessThan(0.005);
  });

  test("learns the sim's step cadence and ignores standing pauses", () => {
    let estimate = 500;
    for (let step = 0; step < 20; step += 1) {
      estimate = estimateStepInterval(estimate, 250);
    }
    expect(estimate).toBeCloseTo(250, 0);
    expect(estimateStepInterval(250, MAX_STEP_INTERVAL_MS + 1)).toBe(250);
    expect(estimateStepInterval(250, 0)).toBe(250);
  });

  test("glides one step linearly and snaps zero-length steps", () => {
    expect(stepProgress(1_250, 1_000, 500)).toBeCloseTo(0.5);
    expect(stepProgress(2_000, 1_000, 500)).toBe(1);
    expect(stepProgress(900, 1_000, 500)).toBe(0);
    expect(stepProgress(1_000, 1_000, 0)).toBe(1);
  });

  test("freezes presentation time while paused without a resume jump", () => {
    const pausedAt = advancePresentationTime(1_000, 16, true);
    expect(pausedAt).toBe(1_000);
    expect(advancePresentationTime(pausedAt, 5_000, true)).toBe(1_000);
    expect(advancePresentationTime(pausedAt, 16, false)).toBe(1_016);
    expect(advancePresentationTime(pausedAt, 5_000, false)).toBe(1_050);
  });
});
