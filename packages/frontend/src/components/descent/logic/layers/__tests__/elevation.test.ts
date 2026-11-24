import { describe, expect, test } from "bun:test";
import {
  DOWNHILL_MAX_SPEED_MULTIPLIER,
  elevationAt,
  elevationGradientAt,
  HIGH_GROUND_DAMAGE_BONUS,
  HIGH_GROUND_RANGED_BONUS,
  highGroundDamageMultiplier,
  highGroundRangeBonus,
  isOnHighGround,
  LOW_GROUND_DAMAGE_PENALTY,
  MAX_HILL_ELEVATION,
  slopeSpeedMultiplier,
  UPHILL_MIN_SPEED_MULTIPLIER,
} from "../elevation";
import {
  LAYER_TERRAIN_META_KEY,
  setLayerTerrain,
  worldTerrainHills,
} from "../hazards";
import type { TerrainHill } from "../layerTypes";

const SAMPLE_HILL: TerrainHill = {
  height: 2.4,
  id: "test-hill-1",
  plateauRadius: 5,
  radius: 15,
  x: 50,
  y: 50,
};

describe("hill elevation and gradients", () => {
  test("returns flat elevation on empty hills and outside the outer radius", () => {
    expect(elevationAt([], 50, 50)).toBe(0);
    expect(elevationAt([SAMPLE_HILL], 65, 50)).toBe(0);
    expect(elevationAt([SAMPLE_HILL], 80, 80)).toBe(0);
  });

  test("holds full height across the flat hilltop plateau and tapers smoothly down the ramp", () => {
    expect(elevationAt([SAMPLE_HILL], 50, 50)).toBeCloseTo(2.4, 5);
    expect(elevationAt([SAMPLE_HILL], 55, 50)).toBeCloseTo(2.4, 5);
    const midRamp = elevationAt([SAMPLE_HILL], 60, 50);
    expect(midRamp).toBeCloseTo(1.2, 5);
    expect(elevationAt([SAMPLE_HILL], 57.5, 50)).toBeGreaterThan(midRamp);
    expect(elevationAt([SAMPLE_HILL], 62.5, 50)).toBeLessThan(midRamp);
  });

  test("stacks overlapping hills for terraced ridges and caps at MAX_HILL_ELEVATION", () => {
    const crown: TerrainHill = {
      height: 1.4,
      id: "test-hill-crown",
      plateauRadius: 2,
      radius: 5,
      x: 50,
      y: 50,
    };
    expect(elevationAt([SAMPLE_HILL, crown], 50, 50)).toBeCloseTo(3.8, 5);

    const giant: TerrainHill = {
      height: 4,
      id: "giant",
      plateauRadius: 5,
      radius: 10,
      x: 50,
      y: 50,
    };
    expect(elevationAt([SAMPLE_HILL, giant], 50, 50)).toBe(MAX_HILL_ELEVATION);
  });

  test("analytical gradient matches finite differences on the slope and is zero on flat plateaus", () => {
    expect(elevationGradientAt([SAMPLE_HILL], 50, 50)).toEqual({
      gx: 0,
      gy: 0,
    });
    expect(elevationGradientAt([SAMPLE_HILL], 80, 50)).toEqual({
      gx: 0,
      gy: 0,
    });
    const px = 58;
    const py = 54;
    const eps = 1e-4;
    const numGx =
      (elevationAt([SAMPLE_HILL], px + eps, py) -
        elevationAt([SAMPLE_HILL], px - eps, py)) /
      (2 * eps);
    const numGy =
      (elevationAt([SAMPLE_HILL], px, py + eps) -
        elevationAt([SAMPLE_HILL], px, py - eps)) /
      (2 * eps);
    const grad = elevationGradientAt([SAMPLE_HILL], px, py);
    expect(grad.gx).toBeCloseTo(numGx, 4);
    expect(grad.gy).toBeCloseTo(numGy, 4);
  });
});

describe("slope speed and Age of Empires high-ground combat rules", () => {
  test("slows units walking uphill, speeds units walking downhill, and keeps contour walking neutral", () => {
    // At (60, 50), the hill center is west at (50, 50), so -x is uphill, +x is downhill, +y is contour.
    const uphill = slopeSpeedMultiplier([SAMPLE_HILL], 60, 50, -1, 0);
    const downhill = slopeSpeedMultiplier([SAMPLE_HILL], 60, 50, 1, 0);
    const contour = slopeSpeedMultiplier([SAMPLE_HILL], 60, 50, 0, 1);
    const plateau = slopeSpeedMultiplier([SAMPLE_HILL], 50, 50, 1, 0);

    expect(uphill).toBeLessThan(1);
    expect(uphill).toBeGreaterThanOrEqual(UPHILL_MIN_SPEED_MULTIPLIER);
    expect(downhill).toBeGreaterThan(1);
    expect(downhill).toBeLessThanOrEqual(DOWNHILL_MAX_SPEED_MULTIPLIER);
    expect(contour).toBe(1);
    expect(plateau).toBe(1);
  });

  test("applies AoE2 +25% downhill and -25% uphill damage modifiers", () => {
    expect(highGroundDamageMultiplier(2.4, 0)).toBe(HIGH_GROUND_DAMAGE_BONUS);
    expect(highGroundDamageMultiplier(0, 2.4)).toBe(LOW_GROUND_DAMAGE_PENALTY);
    expect(highGroundDamageMultiplier(2.0, 2.0)).toBe(1);
    expect(highGroundDamageMultiplier(0.2, 0)).toBe(1);
  });

  test("grants bonus ranged reach only when firing projectiles downhill", () => {
    expect(highGroundRangeBonus(2.4, 0, "projectile")).toBe(
      HIGH_GROUND_RANGED_BONUS,
    );
    expect(highGroundRangeBonus(2.4, 0, "melee")).toBe(0);
    expect(highGroundRangeBonus(0, 2.4, "projectile")).toBe(0);
    expect(highGroundRangeBonus(2.0, 2.0, "projectile")).toBe(0);
  });

  test("identifies high ground positions accurately", () => {
    expect(isOnHighGround([SAMPLE_HILL], 50, 50)).toBe(true);
    expect(isOnHighGround([SAMPLE_HILL], 80, 80)).toBe(false);
  });
});

describe("worldTerrainHills persistence", () => {
  test("saves, reads, and validates hills on world.meta.layerTerrain", () => {
    const world = {
      layerId: "ashen_gate",
      meta: {} as Record<string, unknown>,
    };
    setLayerTerrain(world, {
      hills: [SAMPLE_HILL],
      layerId: "ashen_gate",
      ventVolumes: [],
    });
    expect(worldTerrainHills(world)).toEqual([SAMPLE_HILL]);

    // Legacy save without hills returns empty cleanly.
    const legacy = {
      layerId: "ashen_gate",
      meta: {
        [LAYER_TERRAIN_META_KEY]: {
          layerId: "ashen_gate",
          ventVolumes: [],
        },
      } as Record<string, unknown>,
    };
    expect(worldTerrainHills(legacy)).toEqual([]);

    // Malformed hill (plateauRadius >= radius) is rejected.
    const malformed = {
      layerId: "ashen_gate",
      meta: {
        [LAYER_TERRAIN_META_KEY]: {
          hills: [{ ...SAMPLE_HILL, plateauRadius: 16 }],
          layerId: "ashen_gate",
          ventVolumes: [],
        },
      } as Record<string, unknown>,
    };
    expect(worldTerrainHills(malformed)).toEqual([]);
  });
});
