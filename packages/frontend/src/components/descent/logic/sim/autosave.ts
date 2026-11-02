import { DESCENT_GAME_ID, secondsToTicks } from "./constants";
import type { DescentSim } from "./descentSim";

/** The storage surface save helpers need; `window.localStorage` fits. */
export type SaveStorage = Pick<Storage, "getItem" | "setItem">;

/** Slot written automatically when a layer starts. */
export const AUTOSAVE_SLOT = "autosave";

/**
 * Storage key for one save slot. The blob stored there is the versioned
 * output of `DescentSim.serialize`.
 * @param slot - Slot name, such as `autosave` or `manual-1`
 * @returns A key of the form `descent.save.<slot>`
 */
export function saveSlotKey(slot: string): string {
  return `${DESCENT_GAME_ID}.save.${slot}`;
}

/**
 * Writes a sim to a slot. Quota and blocked-storage errors are swallowed so
 * a failed save never stops play.
 * @param storage - Browser-compatible storage
 * @param slot - Slot name
 * @param sim - Sim to serialize
 * @returns Whether the write succeeded
 */
export function writeSaveSlot(
  storage: SaveStorage,
  slot: string,
  sim: Pick<DescentSim, "serialize">,
): boolean {
  try {
    storage.setItem(saveSlotKey(slot), sim.serialize());
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a slot's serialized sim without parsing it.
 * @param storage - Browser-compatible storage
 * @param slot - Slot name
 * @returns The stored blob, or null when empty or unreadable
 */
export function readSaveSlot(
  storage: SaveStorage,
  slot: string,
): string | null {
  try {
    return storage.getItem(saveSlotKey(slot));
  } catch {
    return null;
  }
}

/**
 * Saves the sim to a slot every time a layer starts, at the tick boundary
 * right after the starting tick.
 * @param sim - Sim to watch
 * @param storage - Browser-compatible storage
 * @param slot - Slot to overwrite; defaults to `AUTOSAVE_SLOT`
 * @param onSaved - Optional callback with the layer id and write result
 * @returns Function that stops autosaving
 */
export function attachLayerAutosave(
  sim: DescentSim,
  storage: SaveStorage,
  slot: string = AUTOSAVE_SLOT,
  onSaved?: (layerId: string, succeeded: boolean) => void,
): () => void {
  return sim.onEvent((event) => {
    if (event.type !== "layer_started") return;
    const succeeded = writeSaveSlot(storage, slot, sim);
    onSaved?.(event.layerId, succeeded);
  });
}

/**
 * Saves a running layer at a bounded sim-time interval so a browser reload
 * resumes the current stockpile, buildings, and unit progression.
 * @param sim - Sim to watch
 * @param storage - Browser-compatible storage
 * @param intervalSeconds - Sim seconds between writes, default five
 * @param slot - Slot to overwrite
 * @returns Function that stops periodic autosaving
 */
export function attachPeriodicAutosave(
  sim: DescentSim,
  storage: SaveStorage,
  intervalSeconds = 5,
  slot: string = AUTOSAVE_SLOT,
): () => void {
  const intervalTicks = Math.max(1, secondsToTicks(intervalSeconds));
  let nextTick = sim.tick + intervalTicks;
  return sim.subscribe(() => {
    if (sim.tick < nextTick) return;
    writeSaveSlot(storage, slot, sim);
    nextTick = sim.tick + intervalTicks;
  });
}
