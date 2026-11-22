import { describe, expect, test } from "bun:test";
import {
  buildProgressScale,
  MIN_CONSTRUCTION_SCALE,
  PLACEMENT_INVALID_TINT,
  PLACEMENT_NEUTRAL_TINT,
  PLACEMENT_VALID_TINT,
  placementPreviewTint,
} from "../preview";

describe("construction and placement preview presentation", () => {
  test("keeps the ghost neutral until validity is known", () => {
    expect(placementPreviewTint(undefined)).toBe(PLACEMENT_NEUTRAL_TINT);
    expect(placementPreviewTint(null)).toBe(PLACEMENT_NEUTRAL_TINT);
    expect(PLACEMENT_NEUTRAL_TINT).toBe("#7fd1df");
  });

  test("turns valid ghosts green and invalid ghosts red", () => {
    expect(placementPreviewTint(true)).toBe(PLACEMENT_VALID_TINT);
    expect(placementPreviewTint(false)).toBe(PLACEMENT_INVALID_TINT);
    expect(PLACEMENT_VALID_TINT).not.toBe(PLACEMENT_INVALID_TINT);
  });

  test("rises from a visible foundation stub to full height", () => {
    expect(buildProgressScale(0)).toBe(0.15);
    expect(buildProgressScale(0.5)).toBeCloseTo(0.575);
    expect(buildProgressScale(1)).toBe(1);
    expect(buildProgressScale(0.75)).toBeGreaterThan(buildProgressScale(0.25));
  });

  test("clamps invalid and out-of-range progress to a safe scale", () => {
    expect(buildProgressScale(-1)).toBe(MIN_CONSTRUCTION_SCALE);
    expect(buildProgressScale(2)).toBe(1);
    expect(buildProgressScale(Number.NaN)).toBe(MIN_CONSTRUCTION_SCALE);
    expect(buildProgressScale(Number.POSITIVE_INFINITY)).toBe(
      MIN_CONSTRUCTION_SCALE,
    );
  });
});
