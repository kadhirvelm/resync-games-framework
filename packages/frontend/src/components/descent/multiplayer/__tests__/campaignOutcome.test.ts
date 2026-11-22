import { describe, expect, it } from "bun:test";
import { createDescentSim } from "../../logic/sim/descentSim";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createSliceState,
} from "../../logic/slice/sliceState";
import type { SimSnapshot } from "../../logic/types";
import { readDescentCampaignOutcome } from "../campaignOutcome";

/**
 * Creates a rendered replay snapshot with a selected outcome.
 * @param outcome - Sim result before a room transition
 * @returns A snapshot whose scenario state contains the selected result
 */
function snapshotWithOutcome(
  outcome: "victory" | "defeat" | "playing",
): SimSnapshot {
  const snapshot = createDescentSim({ modules: [], seed: 42 }).snapshot();
  return {
    ...snapshot,
    meta: {
      ...snapshot.meta,
      [ASHEN_GATE_SLICE_MODULE_ID]: { ...createSliceState(), outcome },
    },
  };
}

describe("campaign outcome match fencing", () => {
  it("never reports the previous mission victory after advancing", () => {
    expect(
      readDescentCampaignOutcome(snapshotWithOutcome("victory"), "old", "new"),
    ).toBeNull();
  });
  it("never reports the previous attempt defeat after retrying", () => {
    expect(
      readDescentCampaignOutcome(snapshotWithOutcome("defeat"), "old", "retry"),
    ).toBeNull();
  });
  it("reports only terminal outcomes produced by the current replay", () => {
    expect(
      readDescentCampaignOutcome(
        snapshotWithOutcome("victory"),
        "match",
        "match",
      ),
    ).toBe("victory");
    expect(
      readDescentCampaignOutcome(
        snapshotWithOutcome("defeat"),
        "match",
        "match",
      ),
    ).toBe("defeat");
    expect(
      readDescentCampaignOutcome(
        snapshotWithOutcome("playing"),
        "match",
        "match",
      ),
    ).toBeNull();
    expect(readDescentCampaignOutcome(null, "match", "match")).toBeNull();
    expect(
      readDescentCampaignOutcome(snapshotWithOutcome("victory"), null, null),
    ).toBeNull();
  });
});
