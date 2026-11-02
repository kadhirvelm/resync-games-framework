import type { ClassId, CombatClassId } from "./types";

/** Locked +50% class counter bonus. */
export const CLASS_COUNTER_BONUS = 1.5;

const COUNTER_TARGETS: Readonly<Record<CombatClassId, readonly ClassId[]>> = {
  adept: ["hunter"],
  breaker: ["warden"],
  hunter: ["warden"],
  raider: ["hunter", "adept", "breaker"],
  warden: ["raider"],
};

/**
 * Gets the soft-counter damage multiplier for a class matchup.
 * @param attacker - Class dealing the damage
 * @param defender - Class receiving the damage
 * @returns `1.5` for a locked counter matchup, otherwise `1`
 */
export function getClassCounterMultiplier(
  attacker: ClassId,
  defender: ClassId,
): number {
  if (attacker === "villager") {
    return 1;
  }
  return COUNTER_TARGETS[attacker].includes(defender) ? CLASS_COUNTER_BONUS : 1;
}
