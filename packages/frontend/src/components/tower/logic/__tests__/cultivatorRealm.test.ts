import { describe, expect, test } from "bun:test";
import { BUILT_IN_CULTIVATOR, BUILT_IN_TOWER } from "../builtInContent";
import { cultivatorPortraitUrl, cultivatorRealm } from "../cultivatorRealm";
import { startRun } from "../run";
import type { RunState } from "../towerTypes";

/**
 * @param floorIndex - Floor reached
 * @param floors - Floors in the tower
 * @returns A run on that floor of a tower that tall
 */
function runAt(floorIndex: number, floors: number): RunState {
  const run = startRun(BUILT_IN_TOWER, 7);
  const room = run.rooms[0];
  if (!room) {
    throw new Error("The built-in tower has no rooms.");
  }
  return {
    ...run,
    floorIndex,
    rooms: Array.from({ length: floors }, () => room),
  };
}

describe("cultivatorRealm", () => {
  test("rises one realm per quarter of the tower", () => {
    expect(
      [0, 1, 2, 3, 4, 5, 6, 7].map((floor) =>
        cultivatorRealm(runAt(floor, 8), 4),
      ),
    ).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  test("never passes the last realm or reads past the top", () => {
    expect(cultivatorRealm(runAt(12, 8), 4)).toBe(3);
    expect(cultivatorRealm(runAt(5, 8), 1)).toBe(0);
  });
});

describe("cultivatorPortraitUrl", () => {
  const cultivator = {
    ...BUILT_IN_CULTIVATOR,
    portraitUrl: "realm-1",
    realmPortraitUrls: ["realm-1", "realm-2", "realm-3", "realm-4"],
  };

  test("shows the realm reached on the climb", () => {
    expect(cultivatorPortraitUrl(cultivator, runAt(5, 8))).toBe("realm-3");
  });

  test("shows the first realm outside a climb or without realms", () => {
    expect(cultivatorPortraitUrl(cultivator)).toBe("realm-1");
    expect(
      cultivatorPortraitUrl(BUILT_IN_CULTIVATOR, runAt(5, 8)),
    ).toBeUndefined();
  });
});
