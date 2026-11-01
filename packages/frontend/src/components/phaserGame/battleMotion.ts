import type { SoundName } from "../tower/audio/sound";
import type { CombatEvent } from "../tower/logic/combat";
import type { BattleRoomInfo } from "./battleAssetRequests";

/** Damage at or above this shakes the camera and plays the heavy hit. */
export const HEAVY_HIT_DAMAGE = 10;

/**
 * Scales a delay or tween duration by the player's battle speed.
 * @param ms - Duration at normal speed, in milliseconds
 * @param pace - Multiplier from settings. Anything not positive counts as 1.
 * @returns The paced duration, rounded to whole milliseconds
 */
export function paced(ms: number, pace: number): number {
  const factor = Number.isFinite(pace) && pace > 0 ? pace : 1;
  return Math.max(0, Math.round(ms * factor));
}

/**
 * @param event - One combat event
 * @returns Whether it lands hard enough to shake the camera
 */
export function isHeavyImpact(event: CombatEvent): boolean {
  if (event.kind === "death") {
    return true;
  }
  return event.kind === "damage" && event.dealt >= HEAVY_HIT_DAMAGE;
}

/**
 * @param event - One combat event
 * @returns The effect for that event, if it has one
 */
export function soundForEvent(event: CombatEvent): SoundName | undefined {
  if (event.kind === "death") {
    return "death";
  }
  if (isHeavyImpact(event)) {
    return "heavy-hit";
  }
  if (event.kind === "damage") {
    return event.dealt > 0 ? "hit" : "block";
  }
  if (event.kind === "block") {
    return "block";
  }
  if (event.kind === "card-played") {
    return "card";
  }
  if (event.kind === "aether") {
    return "aether";
  }
  if (event.kind === "combo") {
    return event.triggered ? "combo" : undefined;
  }
  if (event.kind === "turn-start" && event.turn > 1) {
    return "turn";
  }
  return undefined;
}

/**
 * Picks the effects for one step. Each effect plays once per step, and a
 * heavy hit or a death drowns out ordinary hits in the same step.
 * @param events - The step's events, in order
 * @returns Effects to play, in first-seen order
 */
export function stepSounds(events: CombatEvent[]): SoundName[] {
  const sounds: SoundName[] = [];
  for (const event of events) {
    const sound = soundForEvent(event);
    if (sound && !sounds.includes(sound)) {
      sounds.push(sound);
    }
  }
  if (sounds.includes("heavy-hit") || sounds.includes("death")) {
    return sounds.filter((sound) => sound !== "hit");
  }
  return sounds;
}

/** Copy for the title card that opens a battle. */
export interface RoomTitleCard {
  eyebrow: string;
  /** Line under the title, for the boss only */
  subtitle?: string;
  title: string;
}

/**
 * @param room - Room the battle takes place in
 * @returns Eyebrow, title, and boss subtitle for the opening card
 */
export function roomTitleCard(room: BattleRoomInfo): RoomTitleCard {
  if (room.isBoss) {
    return {
      eyebrow: "The summit",
      subtitle: "The Tower Heart awakens",
      title: room.title,
    };
  }
  return {
    eyebrow: `Floor ${room.floor} of ${room.floorCount}`,
    title: room.title,
  };
}
