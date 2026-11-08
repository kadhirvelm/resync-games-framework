import type { GameExperienceId } from "./gameExperienceTypes";

/**
 * Picks one game for the library's "Surprise me" button.
 * @param ids - Games to choose from
 * @param random - Source of numbers in [0, 1); injectable for tests
 * @returns One of `ids`, or `null` when the list is empty
 */
export function pickRandomExperience(
  ids: readonly GameExperienceId[],
  random: () => number = Math.random,
): GameExperienceId | null {
  if (ids.length === 0) {
    return null;
  }
  const index = Math.min(Math.floor(random() * ids.length), ids.length - 1);
  return ids[index] ?? null;
}
