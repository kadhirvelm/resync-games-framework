import {
  THREE_D_LAST_WORLD_KEY,
  THREE_D_SAVE_KEY,
} from "@/components/babylonGame/logic/prototypeRun";
import { STORAGE_KEYS } from "@/components/tower/persistence";
import type { GameExperienceId } from "./gameExperienceTypes";

/** The storage surface needed to detect resumable game data. */
type ReadableStorage = Pick<Storage, "getItem">;

/** Returns resume hints even when accessing the browser storage property is blocked. */
export function readBrowserResumeExperienceIds(): ReadonlySet<GameExperienceId> {
  try {
    return getResumeExperienceIds(window.localStorage);
  } catch {
    return new Set<GameExperienceId>();
  }
}

/**
 * Checks whether the existing 2D game has at least one saved climb. Climbs
 * live on the server; the game mirrors their ids into storage whenever it
 * loads or saves, so this check needs no request.
 * Storage and malformed-data failures are treated as no resume data.
 * @param storage - Browser-compatible key/value storage
 * @returns Whether a saved climb can be resumed
 */
export function hasStoredTowerClimb(storage: ReadableStorage): boolean {
  try {
    const stored = storage.getItem(STORAGE_KEYS.savedClimbIds);
    if (stored === null) {
      return false;
    }
    const climbIds: unknown = JSON.parse(stored);
    return (
      Array.isArray(climbIds) &&
      climbIds.some((climbId) => typeof climbId === "string")
    );
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
  const ids = new Set<GameExperienceId>();
  if (hasStoredTowerClimb(storage)) ids.add("towers-of-coreborn");
  try {
    const lastWorld = storage.getItem(THREE_D_LAST_WORLD_KEY);
    const raw = lastWorld
      ? storage.getItem(`${THREE_D_SAVE_KEY}.${lastWorld}`)
      : null;
    const saved = raw ? JSON.parse(raw) : null;
    if (
      saved?.version === 1 &&
      saved.prototypeId === lastWorld &&
      saved.finished === false
    )
      ids.add("three-d-sandbox");
  } catch {
    /* Resume is best effort when browser storage is unavailable. */
  }
  return ids;
}
