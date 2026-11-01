import { describe, expect, test } from "bun:test";
import { BUILT_IN_TOWER } from "../builtInContent";
import { startRun } from "../run";
import {
  parseSaveSlots,
  removeClimb,
  SAVE_VERSION,
  type SavedClimb,
  sortedClimbs,
  storeClimb,
} from "../saveGame";
import type { RunState } from "../towerTypes";

/**
 * @param savedAt - Save timestamp
 * @param run - Fields to replace on the run
 * @returns A saved climb of the built-in tower
 */
function saved(savedAt: number, run: Partial<RunState> = {}): SavedClimb {
  return {
    battleNumber: 2,
    content: BUILT_IN_TOWER,
    run: { ...startRun(BUILT_IN_TOWER, 3), ...run },
    savedAt,
    version: SAVE_VERSION,
  };
}

describe("save slots", () => {
  test("a climb is stored under its tower and replaced by the next save", () => {
    const first = storeClimb({}, saved(1));
    const second = storeClimb(first, saved(2));
    expect(Object.keys(second)).toEqual([BUILT_IN_TOWER.id]);
    expect(second[BUILT_IN_TOWER.id]?.savedAt).toBe(2);
  });

  test("a finished climb clears its slot", () => {
    const slots = storeClimb({}, saved(1));
    expect(storeClimb(slots, saved(2, { phase: "defeat" }))).toEqual({});
    expect(removeClimb(slots, BUILT_IN_TOWER.id)).toEqual({});
    const empty = {};
    expect(removeClimb(empty, "missing")).toBe(empty);
  });

  test("sorted climbs put the most recent first", () => {
    const older = { ...saved(1), content: { ...BUILT_IN_TOWER, id: "a" } };
    const newer = { ...saved(5), content: { ...BUILT_IN_TOWER, id: "b" } };
    expect(
      sortedClimbs({ a: older, b: newer }).map((entry) => entry.savedAt),
    ).toEqual([5, 1]);
  });

  test("a save survives a round trip through JSON", () => {
    const slots = storeClimb({}, saved(4));
    const restored = parseSaveSlots(JSON.parse(JSON.stringify(slots)));
    expect(restored).toEqual(slots);
  });

  test("damaged, mismatched, or old entries are dropped", () => {
    const good = saved(4);
    expect(
      parseSaveSlots({
        [BUILT_IN_TOWER.id]: good,
        broken: { version: SAVE_VERSION },
        mismatched: good,
        old: { ...good, version: 0 },
      }),
    ).toEqual({ [BUILT_IN_TOWER.id]: good });
    expect(parseSaveSlots("nonsense")).toEqual({});
  });
});
