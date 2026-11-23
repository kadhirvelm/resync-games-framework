/**
 * Seeded Age of Empires-style hill placement. Produces walkable flat-topped
 * plateau hills and occasional two-tier terraced crowns while keeping water,
 * bridges, Camp aprons, and map borders flat.
 */

import type { TerrainHill } from "../layers/layerTypes";
import type { SimRng } from "../sim/rng";
import { clamp, distance, type MapPoint } from "./geometry";
import { randomBetween } from "./random";

/** Inputs for {@link placeHills}. */
export interface HillSpec {
  /** Desired number of primary hills (two-tier crowns may add extra entries). */
  count: number;
  /** Probability [0, 1] that a large hill gains a second terraced crown tier. */
  crownChance?: number;
  /** Optional pre-placed signature hills (e.g. a central fortress plateau). */
  fixedHills?: readonly TerrainHill[];
  /** Map height in tiles. */
  height: number;
  /** Override peak height range for generated hills. */
  heightRange?: { readonly max: number; readonly min: number };
  /** Prefix for generated hill ids, e.g. `ashen`. */
  idPrefix: string;
  /**
   * Returns whether a hill of `radius` centered at `(x, y)` may sit there.
   * Rejects Camp aprons, rivers/ponds, bridges, and spawn clearings so water
   * flows through valleys and starting bases remain level.
   */
  canPlace: (x: number, y: number, radius: number) => boolean;
  /** Optional tactical overlook candidates tried first (e.g., beside bridges). */
  preferredCenters?: readonly MapPoint[];
  /** Override outer radius range for generated hills. */
  radiusRange?: { readonly max: number; readonly min: number };
  /** Seeded RNG stream for hill generation. */
  rng: SimRng;
  /** Map width in tiles. */
  width: number;
}

const HILL_RADIUS = { max: 18, min: 11.5 } as const;
const HILL_HEIGHT = { max: 2.5, min: 1.7 } as const;
const CROWN_HEIGHT = { max: 1.4, min: 1.0 } as const;
const EDGE_PADDING = 3;
const MAX_CANDIDATE_TRIES = 48;

/**
 * Generates walkable Age of Empires-style plateau hills across a map.
 * @param spec - Map bounds, placement predicate, count, and RNG
 * @returns Deterministic list of walkable hills (including terraced crowns)
 */
export function placeHills(spec: HillSpec): TerrainHill[] {
  const { canPlace, count, height, idPrefix, rng, width } = spec;
  const radiusRange = spec.radiusRange ?? HILL_RADIUS;
  const heightRange = spec.heightRange ?? HILL_HEIGHT;
  const crownChance = spec.crownChance ?? 0.35;
  const hills: TerrainHill[] = [];
  const primaryCenters: { radius: number; x: number; y: number }[] = [];

  for (const fixed of spec.fixedHills ?? []) {
    hills.push({ ...fixed });
    primaryCenters.push({ radius: fixed.radius, x: fixed.x, y: fixed.y });
  }

  const fitsSpacing = (x: number, y: number, radius: number): boolean => {
    if (
      x - radius < EDGE_PADDING ||
      x + radius > width - EDGE_PADDING ||
      y - radius < EDGE_PADDING ||
      y + radius > height - EDGE_PADDING
    ) {
      return false;
    }
    if (!canPlace(x, y, radius)) return false;
    // Allow gentle skirt overlap (0.78× sum of radii) to form natural ridges
    // without stacking centers on top of each other.
    return primaryCenters.every(
      (existing) =>
        distance(existing, { x, y }) >= (existing.radius + radius) * 0.78,
    );
  };

  const commitHill = (x: number, y: number, radius: number): void => {
    const roundedX = Math.round(x * 2) / 2;
    const roundedY = Math.round(y * 2) / 2;
    const roundedRadius = Math.round(radius * 2) / 2;
    const plateauShare = randomBetween(rng, 0.36, 0.48);
    const plateauRadius = Math.round(roundedRadius * plateauShare * 2) / 2;
    const hillHeight =
      Math.round(randomBetween(rng, heightRange.min, heightRange.max) * 10) /
      10;
    const baseIndex = primaryCenters.length + 1;
    primaryCenters.push({ radius: roundedRadius, x: roundedX, y: roundedY });
    hills.push({
      height: hillHeight,
      id: `${idPrefix}-hill-${baseIndex}`,
      label: "High ground",
      plateauRadius,
      radius: roundedRadius,
      x: roundedX,
      y: roundedY,
    });

    // Give a share of wider hills a second terraced crown tier.
    if (roundedRadius >= 14.5 && rng.next() < crownChance) {
      const crownRadius = Math.round(plateauRadius * 1.15 * 2) / 2;
      const crownPlateau = Math.round(crownRadius * 0.44 * 2) / 2;
      const offsetAngle = randomBetween(rng, 0, Math.PI * 2);
      const offsetDist = randomBetween(
        rng,
        0,
        Math.max(0.5, plateauRadius * 0.25),
      );
      const crownX =
        Math.round((roundedX + Math.cos(offsetAngle) * offsetDist) * 2) / 2;
      const crownY =
        Math.round((roundedY + Math.sin(offsetAngle) * offsetDist) * 2) / 2;
      const crownHeight =
        Math.round(
          randomBetween(rng, CROWN_HEIGHT.min, CROWN_HEIGHT.max) * 10,
        ) / 10;
      if (crownPlateau < crownRadius && crownRadius > 2) {
        hills.push({
          height: crownHeight,
          id: `${idPrefix}-hill-${baseIndex}-crown`,
          label: "High ground",
          plateauRadius: crownPlateau,
          radius: crownRadius,
          x: crownX,
          y: crownY,
        });
      }
    }
  };

  // First try preferred tactical overlook spots (e.g. beside river crossings).
  for (const preferred of spec.preferredCenters ?? []) {
    if (primaryCenters.length >= count) break;
    const radius = randomBetween(
      rng,
      radiusRange.min,
      Math.max(radiusRange.min, radiusRange.max - 1.5),
    );
    const x = clamp(
      preferred.x,
      radius + EDGE_PADDING,
      width - radius - EDGE_PADDING,
    );
    const y = clamp(
      preferred.y,
      radius + EDGE_PADDING,
      height - radius - EDGE_PADDING,
    );
    if (fitsSpacing(x, y, radius)) {
      commitHill(x, y, radius);
    }
  }

  // Fill remaining hills across the battlefield with stratified columns so
  // high ground appears on both flanks and across the mid-field.
  while (primaryCenters.length < count) {
    let placed = false;
    for (let attempt = 0; attempt < MAX_CANDIDATE_TRIES; attempt += 1) {
      const radius = randomBetween(rng, radiusRange.min, radiusRange.max);
      const x = randomBetween(
        rng,
        radius + EDGE_PADDING,
        width - radius - EDGE_PADDING,
      );
      const y = randomBetween(
        rng,
        radius + EDGE_PADDING,
        height - radius - EDGE_PADDING,
      );
      if (!fitsSpacing(x, y, radius)) continue;
      commitHill(x, y, radius);
      placed = true;
      break;
    }
    if (!placed) break;
  }

  return hills;
}
