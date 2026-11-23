/**
 * Age of Empires-inspired hill elevation, slope movement speed, and high-ground
 * combat rules.
 *
 * Hills are smooth, walkable flat-topped plateaus with cosine ramps. Overlapping
 * hills sum smoothly (clamped at {@link MAX_HILL_ELEVATION}) to form terraced
 * high ground and natural ridges with C1-continuous elevation and gradients.
 */

import type { TerrainHill } from "./layerTypes";

/** Maximum stacked elevation above flat ground, in world units. */
export const MAX_HILL_ELEVATION = 5;

/**
 * Minimum elevation difference (in world units) required to grant or penalize
 * high-ground combat advantage. Keeps flat ground and slight noise neutral.
 */
export const HIGH_GROUND_THRESHOLD = 0.4;

/** Age of Empires II downhill damage bonus (+25%). */
export const HIGH_GROUND_DAMAGE_BONUS = 1.25;

/** Age of Empires II uphill damage penalty (-25%). */
export const LOW_GROUND_DAMAGE_PENALTY = 0.75;

/** Extra attack range (in tiles) for ranged units firing downhill. */
export const HIGH_GROUND_RANGED_BONUS = 1.25;

/** How strongly uphill grade reduces walk speed. */
export const UPHILL_SLOPE_FACTOR = 0.65;

/** Minimum movement speed multiplier on the steepest uphill climb. */
export const UPHILL_MIN_SPEED_MULTIPLIER = 0.65;

/** How strongly downhill grade boosts walk speed. */
export const DOWNHILL_SLOPE_FACTOR = 0.5;

/** Maximum movement speed multiplier on the steepest downhill descent. */
export const DOWNHILL_MAX_SPEED_MULTIPLIER = 1.3;

/** Analytical elevation gradient at one map point. */
export interface ElevationGradient {
  readonly gx: number;
  readonly gy: number;
}

/**
 * Evaluates the walkable ground elevation at a map coordinate.
 * @param hills - Walkable hills on the current layer
 * @param x - Map x coordinate
 * @param y - Map y coordinate
 * @returns Elevation in world units, in `[0, MAX_HILL_ELEVATION]`
 */
export function elevationAt(
  hills: readonly TerrainHill[],
  x: number,
  y: number,
): number {
  if (hills.length === 0) return 0;
  let total = 0;
  for (let index = 0; index < hills.length; index += 1) {
    const hill = hills[index] as TerrainHill;
    const dx = x - hill.x;
    const dy = y - hill.y;
    const outerSq = hill.radius * hill.radius;
    const distSq = dx * dx + dy * dy;
    if (distSq >= outerSq) continue;
    if (distSq <= hill.plateauRadius * hill.plateauRadius) {
      total += hill.height;
      continue;
    }
    const ramp = hill.radius - hill.plateauRadius;
    if (ramp <= 0) {
      total += hill.height;
      continue;
    }
    const dist = Math.sqrt(distSq);
    const t = (dist - hill.plateauRadius) / ramp;
    total += hill.height * 0.5 * (1 + Math.cos(Math.PI * t));
  }
  return total > MAX_HILL_ELEVATION ? MAX_HILL_ELEVATION : total;
}

/**
 * Evaluates the analytical elevation gradient `(dh/dx, dh/dy)` at a map point.
 * Points on flat ground or flat hilltop plateaus have a zero gradient.
 * @param hills - Walkable hills on the current layer
 * @param x - Map x coordinate
 * @param y - Map y coordinate
 * @returns Partial derivatives of elevation along map x and y
 */
export function elevationGradientAt(
  hills: readonly TerrainHill[],
  x: number,
  y: number,
): ElevationGradient {
  if (hills.length === 0) return { gx: 0, gy: 0 };
  let gx = 0;
  let gy = 0;
  for (let index = 0; index < hills.length; index += 1) {
    const hill = hills[index] as TerrainHill;
    const dx = x - hill.x;
    const dy = y - hill.y;
    const outerSq = hill.radius * hill.radius;
    const distSq = dx * dx + dy * dy;
    if (
      distSq >= outerSq ||
      distSq <= hill.plateauRadius * hill.plateauRadius
    ) {
      continue;
    }
    const ramp = hill.radius - hill.plateauRadius;
    if (ramp <= 0) continue;
    const dist = Math.sqrt(distSq);
    if (dist <= 1e-6) continue;
    const t = (dist - hill.plateauRadius) / ramp;
    const dhDd = (-0.5 * Math.PI * hill.height * Math.sin(Math.PI * t)) / ramp;
    gx += (dhDd * dx) / dist;
    gy += (dhDd * dy) / dist;
  }
  return { gx, gy };
}

/**
 * Computes the movement speed multiplier for a unit walking in direction
 * `(dirX, dirY)` from `(x, y)`. Walking uphill slows the unit; walking
 * downhill speeds it up; walking across flat ground or along a contour stays
 * at `1.0`.
 * @param hills - Walkable hills on the current layer
 * @param x - Current map x coordinate
 * @param y - Current map y coordinate
 * @param dirX - Movement vector x component (need not be normalized)
 * @param dirY - Movement vector y component (need not be normalized)
 * @returns Speed multiplier in `[UPHILL_MIN_SPEED_MULTIPLIER, DOWNHILL_MAX_SPEED_MULTIPLIER]`
 */
export function slopeSpeedMultiplier(
  hills: readonly TerrainHill[],
  x: number,
  y: number,
  dirX: number,
  dirY: number,
): number {
  if (hills.length === 0) return 1;
  const length = Math.hypot(dirX, dirY);
  if (length <= 1e-6) return 1;
  const { gx, gy } = elevationGradientAt(hills, x, y);
  if (gx === 0 && gy === 0) return 1;
  const directionalSlope = (gx * dirX + gy * dirY) / length;
  if (directionalSlope > 0) {
    return Math.max(
      UPHILL_MIN_SPEED_MULTIPLIER,
      1 - directionalSlope * UPHILL_SLOPE_FACTOR,
    );
  }
  if (directionalSlope < 0) {
    return Math.min(
      DOWNHILL_MAX_SPEED_MULTIPLIER,
      1 + -directionalSlope * DOWNHILL_SLOPE_FACTOR,
    );
  }
  return 1;
}

/**
 * Age of Empires II high-ground damage multiplier:
 * - `+25%` (`1.25`) when attacking downhill by at least {@link HIGH_GROUND_THRESHOLD}.
 * - `-25%` (`0.75`) when attacking uphill by at least {@link HIGH_GROUND_THRESHOLD}.
 * - `1.0` on level ground.
 * @param attackerElevation - Elevation of the attacking unit
 * @param targetElevation - Elevation of the target unit or building
 * @returns Multiplicative damage modifier
 */
export function highGroundDamageMultiplier(
  attackerElevation: number,
  targetElevation: number,
): number {
  const delta = attackerElevation - targetElevation;
  if (delta >= HIGH_GROUND_THRESHOLD) return HIGH_GROUND_DAMAGE_BONUS;
  if (delta <= -HIGH_GROUND_THRESHOLD) return LOW_GROUND_DAMAGE_PENALTY;
  return 1;
}

/**
 * Extra attack reach granted to ranged (projectile) units firing from higher
 * ground down onto lower targets.
 * @param attackerElevation - Elevation of the attacking unit
 * @param targetElevation - Elevation of the target
 * @param attackKind - `"melee"` or `"projectile"`
 * @returns Bonus attack range in tiles (`0` for melee or level/uphill shots)
 */
export function highGroundRangeBonus(
  attackerElevation: number,
  targetElevation: number,
  attackKind: "melee" | "projectile",
): number {
  if (attackKind !== "projectile") return 0;
  return attackerElevation - targetElevation >= HIGH_GROUND_THRESHOLD
    ? HIGH_GROUND_RANGED_BONUS
    : 0;
}

/**
 * Whether a map position sits meaningfully above flat ground (on a hill).
 * @param hills - Walkable hills on the current layer
 * @param x - Map x coordinate
 * @param y - Map y coordinate
 * @returns True when elevation meets or exceeds {@link HIGH_GROUND_THRESHOLD}
 */
export function isOnHighGround(
  hills: readonly TerrainHill[],
  x: number,
  y: number,
): boolean {
  return elevationAt(hills, x, y) >= HIGH_GROUND_THRESHOLD;
}
