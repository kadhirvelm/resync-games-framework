import { describe, expect, test } from "bun:test";
import {
  createInitialDescentRoomState,
  DESCENT_CAMPAIGN_MISSIONS,
  DESCENT_MAP_IDS,
  isDescentMapId,
} from "../descent";

describe("Descent campaign catalog", () => {
  test("publishes the three supported missions in progression order with unique ids", () => {
    const ids = DESCENT_CAMPAIGN_MISSIONS.map((mission) => mission.id);

    expect(ids).toEqual([
      "ashen_campaign_1",
      "ashen_campaign_2",
      "ashen_campaign_3",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("scales enemy stats up and wave timing down from the baseline mission", () => {
    expect(
      DESCENT_CAMPAIGN_MISSIONS.map(({ waveStatScale, waveTimeScale }) => ({
        waveStatScale,
        waveTimeScale,
      })),
    ).toEqual([
      { waveStatScale: 1, waveTimeScale: 1 },
      { waveStatScale: 1.25, waveTimeScale: 0.9 },
      { waveStatScale: 1.5, waveTimeScale: 0.8 },
    ]);
  });

  test("includes campaign missions alongside the existing maps without duplicates", () => {
    expect(DESCENT_MAP_IDS).toEqual([
      "ashen_crucible",
      "ashen_crucible_tutorial",
      ...DESCENT_CAMPAIGN_MISSIONS.map((mission) => mission.id),
    ]);
    expect(new Set(DESCENT_MAP_IDS).size).toBe(DESCENT_MAP_IDS.length);
  });
});

describe("isDescentMapId", () => {
  test("accepts every supported map", () => {
    for (const mapId of [
      "ashen_crucible",
      "ashen_crucible_tutorial",
      "ashen_campaign_1",
      "ashen_campaign_2",
      "ashen_campaign_3",
    ]) {
      expect(isDescentMapId(mapId)).toBe(true);
    }
  });

  test("rejects unsupported wire values", () => {
    for (const value of [
      "",
      "ashen_campaign_0",
      "ashen_campaign_4",
      "ashen_campaign_01",
      "ASHEN_CAMPAIGN_1",
      " ashen_campaign_1",
      "ashen_campaign_1 ",
      "deeper_layer",
      null,
      undefined,
      1,
      true,
      {},
      ["ashen_campaign_1"],
      new String("ashen_campaign_1"),
    ]) {
      expect(isDescentMapId(value)).toBe(false);
    }
  });
});

describe("createInitialDescentRoomState", () => {
  test("starts in the standard lobby without an active campaign", () => {
    expect(createInitialDescentRoomState()).toEqual({
      mapId: "ashen_crucible",
      matchId: null,
      phase: "lobby",
      roster: [],
      seed: null,
      startedAt: null,
    });
  });

  test("isolates room state and mutable rosters between calls", () => {
    const first = createInitialDescentRoomState();
    const second = createInitialDescentRoomState();

    expect(first).not.toBe(second);
    expect(first.roster).not.toBe(second.roster);

    first.mapId = "ashen_campaign_1";
    first.campaign = {
      completedMissionIds: [],
      missionIndex: 0,
      outcomes: {},
      status: "active",
    };
    first.roster.push({
      color: "#f2c14e",
      colorIndex: 0,
      id: "player-1",
      name: "Player One",
      slotIndex: 0,
    });

    expect(second.mapId).toBe("ashen_crucible");
    expect(second.campaign).toBeUndefined();
    expect(second.roster).toEqual([]);
    expect(createInitialDescentRoomState()).toEqual(second);
  });
});
