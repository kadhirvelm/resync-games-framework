import { describe, expect, test } from "bun:test";
import type { SaveClimbPayload } from "@towers-of-coreborn/api";
import { readSaveClimbPayload } from "../climbPayload";

const CLIMB_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";
const CULTIVATOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/**
 * @param change - Fields to override
 * @returns A valid save payload with the change applied
 */
function payload(change: Partial<SaveClimbPayload> = {}): SaveClimbPayload {
  return {
    ascension: 1,
    cultivatorId: CULTIVATOR_ID,
    floorCount: 8,
    floorIndex: 2,
    id: CLIMB_ID,
    snapshot: { run: {} },
    towerId: "built-in",
    towerTitle: "The Jade Spire",
    ...change,
  };
}

describe("readSaveClimbPayload", () => {
  test("accepts a valid climb", () => {
    expect(readSaveClimbPayload(payload())).toEqual(payload());
  });

  const malformed: [string, Partial<SaveClimbPayload>][] = [
    ["a non-object snapshot", { snapshot: [] }],
    ["a floor past the top", { floorIndex: 8 }],
    ["a fractional ascension", { ascension: 1.5 }],
    ["a malformed climb id", { id: "climb-1" }],
    ["a blank tower title", { towerTitle: "  " }],
  ];
  for (const [label, change] of malformed) {
    test(`rejects ${label}`, () => {
      expect(() => readSaveClimbPayload(payload(change))).toThrow();
    });
  }
});
