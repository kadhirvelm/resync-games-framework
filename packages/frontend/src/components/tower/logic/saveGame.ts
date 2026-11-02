import type { ClimbRecord, SaveClimbPayload } from "@resync-game-framework/api";
import type { RunState, TowerContent } from "./towerTypes";

/**
 * Saved climbs: any number of climbs in progress, each climbed by one
 * cultivator. Each save carries a snapshot of the tower's content, so a
 * climb resumes exactly as it was even after the workshop generates new
 * assets. The server stores the snapshot as-is.
 */

/** Version written into saved climbs. Bump when the snapshot shape changes. */
export const SAVE_VERSION = 1;

/** One climb in progress. */
export interface SavedClimb {
  battleNumber: number;
  content: TowerContent;
  /** Cultivator climbing it */
  cultivatorId: string;
  /** Fixed for the whole climb */
  id: string;
  run: RunState;
  /** Timestamp in milliseconds */
  savedAt: number;
  version: typeof SAVE_VERSION;
}

/** The part of a saved climb the server keeps as an opaque snapshot. */
type ClimbSnapshot = Pick<
  SavedClimb,
  "battleNumber" | "content" | "run" | "version"
>;

/** Saved climbs keyed by climb id. */
export type SaveSlots = Record<string, SavedClimb>;

/**
 * @param run - Current climb
 * @returns Whether the climb has ended and should no longer be saved
 */
export function isClimbOver(run: RunState): boolean {
  return run.phase === "victory" || run.phase === "defeat";
}

/**
 * Stores a climb in its slot, or clears the slot once it has ended.
 * @param slots - Current saves
 * @param climb - Climb to store
 * @returns The updated saves
 */
export function storeClimb(slots: SaveSlots, climb: SavedClimb): SaveSlots {
  if (isClimbOver(climb.run)) {
    return removeClimb(slots, climb.id);
  }
  return { ...slots, [climb.id]: climb };
}

/**
 * @param slots - Current saves
 * @param climbId - Climb to drop
 * @returns The saves without that climb, or the same object when it was not saved
 */
export function removeClimb(slots: SaveSlots, climbId: string): SaveSlots {
  if (!(climbId in slots)) {
    return slots;
  }
  const { [climbId]: _removed, ...rest } = slots;
  return rest;
}

/**
 * @param slots - Current saves
 * @param keep - Whether a climb stays
 * @returns The saves that pass, or the same object when every climb stays
 */
export function filterClimbs(
  slots: SaveSlots,
  keep: (climb: SavedClimb) => boolean,
): SaveSlots {
  const kept = Object.values(slots).filter(keep);
  if (kept.length === Object.keys(slots).length) {
    return slots;
  }
  return Object.fromEntries(kept.map((climb) => [climb.id, climb]));
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
 * @param slots - Current saves
 * @param towerId - Tower content id
 * @returns That tower's saves, most recently played first
 */
export function climbsForTower(
  slots: SaveSlots,
  towerId: string,
): SavedClimb[] {
  return sortedClimbs(slots).filter((climb) => climb.content.id === towerId);
}

/**
 * @param climb - Climb in progress
 * @returns The request that saves it on the server
 */
export function toSaveClimbPayload(climb: SavedClimb): SaveClimbPayload {
  const snapshot: ClimbSnapshot = {
    battleNumber: climb.battleNumber,
    content: climb.content,
    run: climb.run,
    version: climb.version,
  };
  return {
    ascension: climb.run.ascension,
    cultivatorId: climb.cultivatorId,
    floorCount: climb.run.rooms.length,
    floorIndex: Math.min(climb.run.floorIndex, climb.run.rooms.length - 1),
    id: climb.id,
    snapshot,
    towerId: climb.content.id,
    towerTitle: climb.content.title,
  };
}

/**
 * Reads the server's saved climbs, dropping any whose snapshot is not a
 * usable climb of this version.
 * @param records - Climbs from the server
 * @returns Valid saves keyed by climb id
 */
export function readClimbRecords(records: readonly ClimbRecord[]): SaveSlots {
  const slots: SaveSlots = {};
  for (const record of records) {
    const { snapshot } = record;
    if (!isClimbSnapshot(snapshot) || snapshot.content.id !== record.towerId) {
      continue;
    }
    slots[record.id] = {
      battleNumber: snapshot.battleNumber,
      content: snapshot.content,
      cultivatorId: record.cultivatorId,
      id: record.id,
      run: snapshot.run,
      savedAt: Date.parse(record.updatedAt) || 0,
      version: SAVE_VERSION,
    };
  }
  return slots;
}

/**
 * Light shape check: enough to resume without crashing. Older snapshots
 * are dropped rather than migrated.
 * @param value - One stored snapshot
 * @returns Whether it looks like a climb snapshot of this version
 */
function isClimbSnapshot(value: unknown): value is ClimbSnapshot {
  if (!isRecord(value) || value.version !== SAVE_VERSION) {
    return false;
  }
  const { content, run } = value;
  if (!isRecord(content) || !isRecord(run)) {
    return false;
  }
  return (
    typeof value.battleNumber === "number" &&
    typeof content.id === "string" &&
    isRecord(content.cultivator) &&
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
