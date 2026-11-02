import type { MapBounds } from "../types";

/** Stable experience and storage id for Descent. */
export const DESCENT_GAME_ID = "descent";

/** Sim time per tick. Fixed; speed never changes it. Placeholder value. */
export const TICK_MS = 50;

/** Ticks per second of sim time, derived from `TICK_MS`. */
export const TICKS_PER_SECOND = 1000 / TICK_MS;

/** Allowed speed multipliers (ticks advanced per real-time frame step). */
export const SIM_SPEEDS = [1, 2, 4] as const;

/** One allowed speed multiplier. */
export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** Placeholder map bounds for a new world. */
export const DEFAULT_MAP_BOUNDS: MapBounds = { height: 128, width: 128 };

/** Format tag written into every serialized sim. */
export const SIM_SAVE_FORMAT = "descent-sim";

/** Current serialized sim version. Bump it and add a migration on change. */
export const SIM_SAVE_VERSION = 1;

/**
 * Converts sim seconds to whole ticks, for wave clocks and timers that must
 * run on sim time.
 * @param seconds - Duration in sim seconds
 * @returns The duration rounded to the nearest tick
 */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * TICKS_PER_SECOND);
}

/**
 * Converts ticks to sim seconds for display.
 * @param ticks - Duration in ticks
 * @returns The duration in sim seconds
 */
export function ticksToSeconds(ticks: number): number {
  return ticks / TICKS_PER_SECOND;
}

/**
 * Narrows a number to an allowed speed multiplier.
 * @param value - Candidate multiplier
 * @returns Whether the value is one of `SIM_SPEEDS`
 */
export function isSimSpeed(value: number): value is SimSpeed {
  return (SIM_SPEEDS as readonly number[]).includes(value);
}
