import { describe, expect, test } from "bun:test";
import type { ClimbRecord } from "@towers-of-coreborn/api";
import { BUILT_IN_TOWER } from "../builtInContent";
import { startRun } from "../run";
import {
  climbsForTower,
  filterClimbs,
  readClimbRecords,
  removeClimb,
  SAVE_VERSION,
  type SavedClimb,
  sortedClimbs,
  storeClimb,
  toSaveClimbPayload,
} from "../saveGame";
import type { RunState } from "../towerTypes";

const CULTIVATOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * @param id - Climb id
 * @param savedAt - Save timestamp
 * @param run - Fields to replace on the run
 * @returns A saved climb of the built-in tower
 */
function saved(
  id: string,
  savedAt: number,
  run: Partial<RunState> = {},
): SavedClimb {
  return {
    battleNumber: 2,
    content: BUILT_IN_TOWER,
    cultivatorId: CULTIVATOR_ID,
    id,
    run: { ...startRun(BUILT_IN_TOWER, 3), ...run },
    savedAt,
    version: SAVE_VERSION,
  };
}

/**
 * @param climb - Saved climb
 * @returns The record the server would send back for it
 */
function asRecord(climb: SavedClimb): ClimbRecord {
  const payload = toSaveClimbPayload(climb);
  return {
    ...payload,
    snapshot: JSON.parse(JSON.stringify(payload.snapshot)),
    updatedAt: new Date(climb.savedAt).toISOString(),
  };
}

describe("save slots", () => {
  test("climbs of one tower keep their own slots", () => {
    const slots = storeClimb(storeClimb({}, saved("a", 1)), saved("b", 2));
    expect(Object.keys(slots)).toEqual(["a", "b"]);
    expect(storeClimb(slots, saved("a", 3)).a?.savedAt).toBe(3);
    expect(
      climbsForTower(slots, BUILT_IN_TOWER.id).map((climb) => climb.id),
    ).toEqual(["b", "a"]);
    expect(climbsForTower(slots, "elsewhere")).toEqual([]);
  });

  test("a finished climb clears its slot", () => {
    const slots = storeClimb({}, saved("a", 1));
    expect(storeClimb(slots, saved("a", 2, { phase: "defeat" }))).toEqual({});
    expect(removeClimb(slots, "a")).toEqual({});
    const empty = {};
    expect(removeClimb(empty, "missing")).toBe(empty);
  });

  test("sorted climbs put the most recent first", () => {
    expect(
      sortedClimbs({ a: saved("a", 1), b: saved("b", 5) }).map(
        (entry) => entry.savedAt,
      ),
    ).toEqual([5, 1]);
  });

  test("filtering keeps the same object when nothing is dropped", () => {
    const slots = {
      a: saved("a", 1),
      b: { ...saved("b", 2), cultivatorId: "x" },
    };
    expect(filterClimbs(slots, () => true)).toBe(slots);
    expect(
      Object.keys(filterClimbs(slots, (climb) => climb.cultivatorId === "x")),
    ).toEqual(["b"]);
  });
});

describe("server records", () => {
  test("a climb survives a round trip through the server", () => {
    const climb = saved("4f1c0b2e-6a7d-4c8e-9f10-123456789abc", 4000);
    expect(readClimbRecords([asRecord(climb)])).toEqual({ [climb.id]: climb });
  });

  test("the payload describes the climb for menus", () => {
    const payload = toSaveClimbPayload(saved("a", 1, { ascension: 2 }));
    expect(payload).toMatchObject({
      ascension: 2,
      cultivatorId: CULTIVATOR_ID,
      floorIndex: 0,
      towerId: BUILT_IN_TOWER.id,
      towerTitle: BUILT_IN_TOWER.title,
    });
    expect(payload.floorCount).toBeGreaterThan(0);
  });

  test("damaged, mismatched, finished, or old snapshots are dropped", () => {
    const good = asRecord(saved("good", 1));
    const finished = asRecord(saved("done", 1, { phase: "victory" }));
    expect(
      Object.keys(
        readClimbRecords([
          good,
          { ...good, id: "broken", snapshot: { version: SAVE_VERSION } },
          { ...good, id: "mismatched", towerId: "elsewhere" },
          {
            ...good,
            id: "old",
            snapshot: { ...(good.snapshot as object), version: 0 },
          },
          { ...finished, snapshot: { ...(finished.snapshot as object) } },
          { ...good, id: "nonsense", snapshot: "nonsense" },
        ]),
      ),
    ).toEqual(["good"]);
  });
});
