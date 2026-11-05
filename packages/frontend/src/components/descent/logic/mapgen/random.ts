import { createSimRng, normalizeSeed, type SimRng } from "../sim/rng";

/**
 * Mixes a run seed with a text salt so map generation draws from its own
 * stream and never moves the sim's RNG cursor.
 * @param seed - Run seed
 * @param salt - Purpose label, such as `"ashen_gate:layout:0"`
 * @returns A well-mixed 32-bit seed
 */
export function deriveSeed(seed: number, salt: string): number {
  let hash = normalizeSeed(seed) ^ 0x811c9dc5;
  for (let index = 0; index < salt.length; index += 1) {
    hash = Math.imul(hash ^ salt.charCodeAt(index), 0x01000193);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * Creates a standalone seeded RNG for map generation.
 * @param seed - Run seed
 * @param salt - Purpose label mixed into the seed
 * @returns Deterministic random helpers with their own cursor
 */
export function createMapRng(seed: number, salt: string): SimRng {
  return createSimRng({ rngState: deriveSeed(seed, salt) });
}

/**
 * @param rng - Random source
 * @param min - Lowest value
 * @param max - Highest value
 * @returns A float in `[min, max)`
 */
export function randomBetween(rng: SimRng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}
