import type { RunState, TowerContent } from "./towerTypes";

/**
 * Saved climbs: one in-progress climb per tower. Each save carries a snapshot
 * of the tower's content, so a climb resumes exactly as it was even after the
 * workshop generates new assets.
 */

/** Version written into saved climbs. Bump when the shape changes. */
export const SAVE_VERSION = 1;

/** One climb in progress. */
export interface SavedClimb {
  battleNumber: number;
  content: TowerContent;
  run: RunState;
  /** Timestamp in milliseconds */
  savedAt: number;
  version: typeof SAVE_VERSION;
}

/** Saved climbs keyed by tower content id. */
export type SaveSlots = Record<string, SavedClimb>;

/**
 * @param run - Current climb
 * @returns Whether the climb has ended and should no longer be saved
 */
export function isClimbOver(run: RunState): boolean {
  return run.phase === "victory" || run.phase === "defeat";
}

/**
 * Stores a climb in its tower's slot, or clears the slot once it has ended.
 * @param slots - Current saves
 * @param climb - Climb to store
 * @returns The updated saves
 */
export function storeClimb(slots: SaveSlots, climb: SavedClimb): SaveSlots {
  if (isClimbOver(climb.run)) {
    return removeClimb(slots, climb.content.id);
  }
  return { ...slots, [climb.content.id]: climb };
}

/**
 * @param slots - Current saves
 * @param towerId - Tower whose save to drop
 * @returns The saves without that tower, or the same object when it had none
 */
export function removeClimb(slots: SaveSlots, towerId: string): SaveSlots {
  if (!(towerId in slots)) {
    return slots;
  }
  const { [towerId]: _removed, ...rest } = slots;
  return rest;
}

/**
 * @param slots - Current saves
 * @returns Saves, most recently played first
 */
export function sortedClimbs(slots: SaveSlots): SavedClimb[] {
  return Object.values(slots).sort(
    (left, right) => right.savedAt - left.savedAt,
  );
}

/**
 * Reads stored saves, dropping any entry that is not a usable climb.
 * @param raw - Parsed JSON from storage
 * @returns Valid saves keyed by tower id
 */
export function parseSaveSlots(raw: unknown): SaveSlots {
  if (!isRecord(raw)) {
    return {};
  }
  const slots: SaveSlots = {};
  for (const [towerId, entry] of Object.entries(raw)) {
    if (isSavedClimb(entry) && entry.content.id === towerId) {
      slots[towerId] = entry;
    }
  }
  return slots;
}

/**
 * Light shape check: enough to resume without crashing. Older saves are
 * dropped rather than migrated.
 * @param value - One stored entry
 * @returns Whether it looks like a saved climb of this version
 */
function isSavedClimb(value: unknown): value is SavedClimb {
  if (!isRecord(value) || value.version !== SAVE_VERSION) {
    return false;
  }
  const { content, run } = value;
  if (!isRecord(content) || !isRecord(run)) {
    return false;
  }
  return (
    typeof content.id === "string" &&
    Array.isArray(content.coreborn) &&
    Array.isArray(run.party) &&
    Array.isArray(run.rooms) &&
    run.rooms.length > 0 &&
    typeof run.floorIndex === "number" &&
    typeof run.phase === "string" &&
    isRecord(run.modifiers) &&
    !isClimbOver(run as unknown as RunState)
  );
}

/**
 * @param value - Anything
 * @returns Whether it is a plain object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
