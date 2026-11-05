import type { CombatClassId } from "../combat/types";
import { secondsToTicks, TICKS_PER_SECOND } from "../sim/constants";

/** Sim ticks in one second. Speed changes ticks per frame, not this length. */
export { TICKS_PER_SECOND };

/**
 * How much larger a layer boss is than an ordinary unit, in both body size
 * (collision and reach) and drawn size.
 */
export const BOSS_SIZE_SCALE = 3;

/** How far ahead the Omen Tower reads the next wave. Locked at 60. */
export const OMEN_LEAD_SECONDS = 60;

/** Omen lead expressed in sim ticks. */
export const OMEN_LEAD_TICKS = secondsToTicks(OMEN_LEAD_SECONDS);

/** Ticks in one sim minute, the Hell Pressure step. */
export const TICKS_PER_MINUTE = secondsToTicks(60);

/**
 * Hell Pressure added at each uncleared minute.
 * About fourteen minutes fills the meter, so pressure trails the wave
 * schedule instead of outrunning a new Hold. Placeholder.
 */
export const HELL_PRESSURE_PER_MINUTE = 0.07;

/**
 * Extra hit points and damage at full Hell Pressure.
 * At 1.0 the horde has +50% stats. Placeholder.
 */
export const HELL_PRESSURE_STAT_BONUS = 0.5;

/** Wave power cannot rise more than 60% over the layer's base. */
export const WAVE_POWER_CAP = 1.6;

/**
 * Collected essence that would add +100% power before the cap, per grade.
 * Grade 1 reaches the +60% cap at 150 essence, so gathering essence early
 * does not spike the next waves. Placeholder.
 */
export const ESSENCE_PER_POWER_POINT = 250;

/** Essence a horde kill pays before grade and Siphon. Placeholder. */
export const KILL_ESSENCE = 4;

/** Siphon steals kills inside this distance. */
export const SIPHON_RADIUS = 8;

/** Share of a nearby kill's essence the Hold still receives. */
export const SIPHON_PAYOUT_FRACTION = 0.25;

/** Sim seconds between Summoner fodder pulses. */
export const SUMMONER_INTERVAL_SECONDS = 10;

/** Summoner pulse length in ticks. */
export const SUMMONER_INTERVAL_TICKS = secondsToTicks(
  SUMMONER_INTERVAL_SECONDS,
);

/** Fodder bodies one Summoner pulse creates. */
export const SUMMONER_FODDER_COUNT = 2;

/** Combat class used for Summoner fodder and Cinderjaw's vent imps. */
export const FODDER_CLASS_ID: CombatClassId = "raider";

/** Hit point and damage scale for Summoner fodder. */
export const FODDER_STAT_SCALE = 0.45;

/** Hit point and damage scale for vent imps. */
export const VENT_IMP_STAT_SCALE = 0.7;

/** Hit point and damage scale for an elite body. */
export const ELITE_STAT_SCALE = 1.75;

/** Physical damage kept by an Armored elite. */
export const ARMORED_PHYSICAL_MULTIPLIER = 0.5;

/** Speed gained per allied death for a Berserker, before the cap. */
export const BERSERKER_SPEED_PER_ALLY = 0.2;

/** Maximum extra speed from fallen allies (+100%). */
export const BERSERKER_SPEED_BONUS_CAP = 1;

/** Legacy west edge of the old fixed spawn block. Kept for old imports. */
export const SPAWN_ANCHOR_X = 40;

/** Legacy spawn row origin. Kept for old imports. */
export const SPAWN_ANCHOR_Y = 20;

/** Map tiles between the east edge and the first spawn column. */
export const SPAWN_EAST_INSET = 3;

/** Bodies stay this many tiles inside every map edge. */
export const SPAWN_EDGE_MARGIN = 1;

/**
 * Map width assumed when a clock carries no bounds (old saves, headless
 * directors). This is the fixed Ashen Gate size those saves were made on;
 * live runs always pass the world's own bounds.
 */
export const DEFAULT_WAVE_MAP_WIDTH = 128;

/** Map height assumed when a clock carries no bounds. */
export const DEFAULT_WAVE_MAP_HEIGHT = 80;

/** Living fodder one Summoner may keep on the field at once. */
export const SUMMONER_FODDER_CAP = 6;

/** Share of normal kill essence paid for Summoner fodder and vent imps. */
export const MINOR_KILL_ESSENCE_FRACTION = 0.25;

/** Gap between spawn slots, in map units. */
export const SPAWN_SPACING = 3;

/** Spawn slots per row, so a wave stays inside the map. */
export const SPAWN_COLUMNS = 8;

/**
 * Converts a sim-second mark into a completed-tick count.
 * @param seconds - Seconds from the layer start
 * @returns Tick count on the fixed clock
 */
export function secondsToWaveTicks(seconds: number): number {
  return secondsToTicks(seconds);
}
