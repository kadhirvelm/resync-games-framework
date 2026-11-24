import { describe, expect, it } from "bun:test";
import { DESCENT_CAMPAIGN_MISSIONS } from "@resync-game-framework/api";
import {
  createSoloCampaignProgress,
  isSoloCampaignMissionUnlocked,
  isSoloCampaignProgress,
  readSoloCampaignProgress,
  recordSoloCampaignOutcome,
  SOLO_CAMPAIGN_STORAGE_KEY,
  writeSoloCampaignProgress,
} from "../soloCampaign";

const [first, second, third] = DESCENT_CAMPAIGN_MISSIONS;

describe("solo campaign", () => {
  it("unlocks sequentially, ignores defeat, replays and skipped wins, and completes", () => {
    const initial = createSoloCampaignProgress();
    expect(isSoloCampaignMissionUnlocked(initial, first.id)).toBe(true);
    expect(isSoloCampaignMissionUnlocked(initial, second.id)).toBe(false);
    expect(recordSoloCampaignOutcome(initial, first.id, "defeat")).toBe(
      initial,
    );
    expect(recordSoloCampaignOutcome(initial, second.id, "victory")).toBe(
      initial,
    );
    const one = recordSoloCampaignOutcome(initial, first.id, "victory");
    expect(initial.completedMissionIds).toEqual([]);
    expect(isSoloCampaignMissionUnlocked(one, first.id)).toBe(true);
    expect(isSoloCampaignMissionUnlocked(one, second.id)).toBe(true);
    expect(recordSoloCampaignOutcome(one, first.id, "victory")).toBe(one);
    const two = recordSoloCampaignOutcome(one, second.id, "victory");
    const done = recordSoloCampaignOutcome(two, third.id, "victory");
    expect(done.completedMissionIds).toEqual(
      DESCENT_CAMPAIGN_MISSIONS.map((m) => m.id),
    );
    expect(recordSoloCampaignOutcome(done, third.id, "victory")).toBe(done);
  });

  it("round trips separately and rejects corrupt, unsupported and non-prefix records", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const progress = recordSoloCampaignOutcome(
      createSoloCampaignProgress(),
      first.id,
      "victory",
    );
    expect(readSoloCampaignProgress(storage)).toBeNull();
    expect(writeSoloCampaignProgress(storage, progress)).toBe(true);
    expect(readSoloCampaignProgress(storage)).toEqual(progress);
    for (const invalid of [
      "{",
      JSON.stringify({ completedMissionIds: [], version: 2 }),
      JSON.stringify({ completedMissionIds: [second.id], version: 1 }),
      JSON.stringify({ completedMissionIds: [first.id, first.id], version: 1 }),
    ]) {
      data.set(SOLO_CAMPAIGN_STORAGE_KEY, invalid);
      expect(readSoloCampaignProgress(storage)).toBeNull();
    }
    expect(isSoloCampaignProgress(null)).toBe(false);
  });

  it("handles storage failures without throwing", () => {
    const storage = {
      getItem: () => {
        throw new Error();
      },
      setItem: () => {
        throw new Error();
      },
    };
    expect(readSoloCampaignProgress(storage)).toBeNull();
    expect(
      writeSoloCampaignProgress(storage, createSoloCampaignProgress()),
    ).toBe(false);
  });
});
