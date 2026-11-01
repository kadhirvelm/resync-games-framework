import { parseSaveSlots } from "@/components/tower/logic/saveGame";
import { STORAGE_KEYS } from "@/components/tower/persistence";
import type { GameExperienceId } from "./gameExperienceTypes";

/** The storage surface needed to detect resumable game data. */
type ReadableStorage = Pick<Storage, "getItem">;

/**
 * Checks whether the existing 2D game has at least one valid saved climb.
 * Storage and malformed-data failures are treated as no resume data.
 * @param storage - Browser-compatible key/value storage
 * @returns Whether a saved climb can be resumed
 */
export function hasStoredTowerClimb(storage: ReadableStorage): boolean {
  try {
    const storedSaves = storage.getItem(STORAGE_KEYS.saves);
    if (storedSaves === null) {
      return false;
    }
    return Object.keys(parseSaveSlots(JSON.parse(storedSaves))).length > 0;
  } catch {
    return false;
  }
}

/**
 * Finds every registered experience with currently resumable browser data.
 * @param storage - Browser-compatible key/value storage
 * @returns Experience ids whose selector cards should offer Continue
 */
export function getResumeExperienceIds(
  storage: ReadableStorage,
): ReadonlySet<GameExperienceId> {
  if (!hasStoredTowerClimb(storage)) {
    return new Set<GameExperienceId>();
  }
  return new Set<GameExperienceId>(["towers-of-coreborn"]);
}
