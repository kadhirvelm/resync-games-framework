import type { CombatEvent } from "../tower/logic/combat";
import { paced } from "./battleMotion";

/** One event placed on a step's timeline. */
export interface TimedEvent {
  /** Milliseconds after the step starts when the event lands */
  at: number;
  event: CombatEvent;
  /**
   * For a hit that opens a flurry from a new attacker: when that attacker
   * starts its dash. Later hits in the same flurry reuse the first dash.
   */
  windupAt?: number;
}

/** When every event in one step plays, and how long the step lasts. */
export interface StepTimeline {
  beats: TimedEvent[];
  /** Milliseconds until the next step may start */
  duration: number;
}

/** Time from an attacker starting its dash to the blow landing. */
export const DASH_IMPACT_MS = 190;

/** Time after a blow before the next beat, so the hit reads. */
const AFTER_HIT_MS = 230;

/** Gap between blows of one flurry, such as an attack on every party member. */
const FLURRY_GAP_MS = 110;

/** Quiet time after the last beat before the step ends. */
const STEP_TAIL_MS = 160;

/**
 * Time each kind of beat holds the timeline before the next one.
 * Hits are timed separately, because their windup comes first.
 */
const BEAT_MS: Record<Exclude<CombatEvent["kind"], "damage">, number> = {
  aether: 140,
  block: 210,
  "card-played": 140,
  combo: 200,
  death: 420,
  draw: 110,
  "enemy-move": 260,
  shuffle: 280,
  "turn-start": 420,
};

/**
 * Lays one combat step's events out in time. Each attacker dashes before
 * its first blow; further blows from the same attacker follow quickly
 * without a second dash.
 * @param events - The step's events, in order
 * @param pace - Battle speed multiplier on durations
 * @returns Paced landing time for every event and the step's length
 */
export function scheduleStep(
  events: readonly CombatEvent[],
  pace: number,
): StepTimeline {
  const beats: TimedEvent[] = [];
  let cursor = 0;
  let lastAttacker: string | undefined;
  let lastHitAt = 0;

  for (const event of events) {
    if (event.kind !== "damage") {
      beats.push({ at: paced(cursor, pace), event });
      cursor += BEAT_MS[event.kind];
      lastAttacker = undefined;
      continue;
    }
    const continuesFlurry = event.sourceId === lastAttacker;
    if (continuesFlurry) {
      lastHitAt += FLURRY_GAP_MS;
      beats.push({ at: paced(lastHitAt, pace), event });
      cursor = lastHitAt + AFTER_HIT_MS;
      continue;
    }
    const dashes = event.sourceId !== event.targetId;
    const impact = dashes ? cursor + DASH_IMPACT_MS : cursor;
    beats.push({
      at: paced(impact, pace),
      event,
      ...(dashes ? { windupAt: paced(cursor, pace) } : {}),
    });
    lastAttacker = event.sourceId;
    lastHitAt = impact;
    cursor = impact + AFTER_HIT_MS;
  }

  const duration = events.length === 0 ? 0 : cursor + STEP_TAIL_MS;
  return { beats, duration: paced(duration, pace) };
}
