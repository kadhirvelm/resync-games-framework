import { describe, expect, test } from "bun:test";
import { BUILT_IN_TOWER } from "../builtInContent";
import { MAX_ASCENSION } from "../generateTower";
import {
  climbEssence,
  createProfile,
  ESSENCE_PER_FLOOR,
  ESSENCE_VICTORY_BONUS,
  HISTORY_LIMIT,
  nextUpgradeCost,
  type PlayerProfile,
  parseProfile,
  purchaseUpgrade,
  recordDiscoveries,
  runOptionsFor,
  settleClimb,
  unlockedAscension,
} from "../progression";
import { recruitCoreborn, startRun } from "../run";
import type { RunState } from "../towerTypes";

const content = BUILT_IN_TOWER;
const FOX = "builtin-huli";

/**
 * @param overrides - Fields to replace on a fresh climb
 * @returns A climb on the built-in tower
 */
function climb(overrides: Partial<RunState> = {}): RunState {
  return { ...startRun(content, 7), ...overrides };
}

/**
 * @param essence - Essence to hold
 * @returns A fresh profile with that much essence
 */
function richProfile(essence: number): PlayerProfile {
  return { ...createProfile(), essence };
}

describe("upgrades", () => {
  test("buying a rank spends its cost and raises the rank", () => {
    const profile = purchaseUpgrade(richProfile(100), "tempered-body");
    expect(profile.upgrades["tempered-body"]).toBe(1);
    expect(profile.essence).toBe(80);
    expect(nextUpgradeCost(profile, "tempered-body")).toBe(45);
  });

  test("an unaffordable or maxed upgrade leaves the profile alone", () => {
    const poor = richProfile(5);
    expect(purchaseUpgrade(poor, "tempered-body")).toBe(poor);

    let maxed = richProfile(1000);
    for (let rank = 0; rank < 4; rank += 1) {
      maxed = purchaseUpgrade(maxed, "fates-thread");
    }
    expect(maxed.upgrades["fates-thread"]).toBe(2);
    expect(nextUpgradeCost(maxed, "fates-thread")).toBeUndefined();
  });

  test("ranks become the bonuses a climb starts with", () => {
    const profile: PlayerProfile = {
      ...createProfile(),
      upgrades: {
        "fates-thread": 1,
        "jade-respite": 2,
        "kindred-bond": 1,
        "remembered-form": 1,
        "tempered-body": 3,
        "wider-calling": 2,
      },
    };
    const options = runOptionsFor(profile, 2);
    expect(options).toEqual({
      ascension: 2,
      cultivatorBonusHitPoints: 12,
      extraDraftOptions: 2,
      extraTechniques: 1,
      modifiers: {
        corebornBonusHitPoints: 3,
        rerollsLeft: 1,
        respiteHealing: 6,
      },
    });
  });
});

describe("climbEssence", () => {
  test("pays for floors, the summit, merges, and recruits", () => {
    const essence = climbEssence(
      climb({
        phase: "victory",
        stats: { battlesWon: 7, corebornLost: [], merges: 2, recruited: 4 },
      }),
    );
    expect(essence.floors).toBe(7 * ESSENCE_PER_FLOOR);
    expect(essence.victory).toBe(ESSENCE_VICTORY_BONUS);
    expect(essence.total).toBe(35 + 30 + 6 + 4);
  });

  test("ascension adds a share on top", () => {
    const essence = climbEssence(
      climb({
        ascension: 2,
        phase: "defeat",
        stats: { battlesWon: 4, corebornLost: [], merges: 0, recruited: 0 },
      }),
    );
    expect(essence.ascensionBonus).toBe(10);
    expect(essence.total).toBe(30);
  });
});

describe("settleClimb", () => {
  test("banks essence, records the tower, and writes history", () => {
    const run = climb({
      floorIndex: 2,
      phase: "defeat",
      stats: { battlesWon: 2, corebornLost: [], merges: 1, recruited: 2 },
    });
    const { profile, summary } = settleClimb(createProfile(), content, run, 99);
    expect(profile.essence).toBe(summary.essence.total);
    expect(profile.towers[content.id]).toEqual({
      bestFloor: 3,
      climbs: 1,
      highestAscensionCleared: -1,
      title: content.title,
      victories: 0,
    });
    expect(profile.history[0]).toMatchObject({
      endedAt: 99,
      floor: 3,
      outcome: "defeat",
    });
    expect(summary.newBestFloor).toBe(true);
    expect(summary.unlockedAscension).toBeUndefined();
  });

  test("a victory unlocks the next ascension, once", () => {
    const won = climb({ floorIndex: 6, phase: "victory" });
    const first = settleClimb(createProfile(), content, won, 1);
    expect(first.summary.unlockedAscension).toBe(1);
    expect(unlockedAscension(first.profile, content.id)).toBe(1);

    const again = settleClimb(first.profile, content, won, 2);
    expect(again.summary.unlockedAscension).toBeUndefined();
    expect(again.summary.newBestFloor).toBe(false);
  });

  test("the highest ascension stays the cap", () => {
    const won = climb({ ascension: MAX_ASCENSION, phase: "victory" });
    const { profile, summary } = settleClimb(createProfile(), content, won, 1);
    expect(summary.unlockedAscension).toBeUndefined();
    expect(unlockedAscension(profile, content.id)).toBe(MAX_ASCENSION);
  });

  test("history keeps only the most recent climbs", () => {
    let profile = createProfile();
    for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) {
      profile = settleClimb(
        profile,
        content,
        climb({ phase: "defeat" }),
        index,
      ).profile;
    }
    expect(profile.history).toHaveLength(HISTORY_LIMIT);
    expect(profile.history[0]?.endedAt).toBe(HISTORY_LIMIT + 2);
  });
});

describe("recordDiscoveries", () => {
  test("adds recruited Coreborn and cleared enemies, and is idempotent", () => {
    const recruited = recruitCoreborn(startRun(content, 7), content, FOX);
    const run: RunState = { ...recruited, floorIndex: 1, phase: "camp" };
    const first = recordDiscoveries(createProfile(), content, run);
    expect(first.codex.coreborn[`${content.id}:${FOX}`]?.bestTier).toBe(1);
    const firstEnemy = run.rooms[0]?.enemies[0];
    expect(
      first.codex.enemies[`${content.id}:${firstEnemy?.templateId}`],
    ).toBeDefined();
    expect(recordDiscoveries(first, content, run)).toBe(first);
  });

  test("leaves rooms not yet won out of the bestiary", () => {
    const run = climb({ phase: "camp" });
    const profile = recordDiscoveries(createProfile(), content, run);
    expect(Object.keys(profile.codex.enemies)).toHaveLength(0);
  });
});

describe("parseProfile", () => {
  test("anything unreadable becomes a fresh profile", () => {
    expect(parseProfile(undefined)).toEqual(createProfile());
    expect(parseProfile({ version: 99 })).toEqual(createProfile());
  });

  test("keeps valid fields and repairs bad ones", () => {
    const parsed = parseProfile({
      essence: -4,
      totals: { climbs: 3 },
      upgrades: { "tempered-body": 2 },
      version: 1,
    });
    expect(parsed.essence).toBe(0);
    expect(parsed.totals.climbs).toBe(3);
    expect(parsed.totals.victories).toBe(0);
    expect(parsed.upgrades["tempered-body"]).toBe(2);
  });
});
