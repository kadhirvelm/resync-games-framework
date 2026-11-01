import { describe, expect, test } from "bun:test";
import { BUILT_IN_TOWER } from "../builtInContent";
import { TOWER_FLOOR_COUNT } from "../generateTower";
import {
  BASE_CARD_COPIES,
  beginBattle,
  claimReward,
  FORTIFY_AMOUNT,
  finishBattle,
  memberCard,
  mergeCoreborn,
  mergeOptions,
  moveMember,
  recruitCoreborn,
  runDeck,
  startRun,
} from "../run";
import type { RunState } from "../towerTypes";

const content = BUILT_IN_TOWER;
const FOX = "builtin-huli";
const CRANE = "builtin-crane";

/**
 * @param picks - Template ids for the opening draft
 * @returns A run in camp with those Coreborn in front of the cultivator
 */
function campRun(picks: string[] = [FOX, CRANE]): RunState {
  let run = startRun(content, 42);
  for (const pick of picks) {
    run = recruitCoreborn(run, content, pick);
  }
  return run;
}

/**
 * @param run - Run in camp
 * @param outcome - Battle result
 * @param health - Health to report, by member id. Others keep theirs.
 * @returns The run after the battle
 */
function fight(
  run: RunState,
  outcome: "victory" | "defeat",
  health: Record<string, number> = {},
): RunState {
  return finishBattle(beginBattle(run), content, {
    outcome,
    party: run.party.map((member) => ({
      hitPoints: health[member.id] ?? member.hitPoints,
      id: member.id,
    })),
    randomState: run.randomState,
  });
}

describe("startRun", () => {
  test("opens the draft with the cultivator alone and a full tower", () => {
    const run = startRun(content, 1);
    expect(run.phase).toBe("recruit");
    expect(run.party.map((member) => member.kind)).toEqual(["cultivator"]);
    expect(run.rooms).toHaveLength(TOWER_FLOOR_COUNT);
    expect(run.rooms.at(-1)?.isBoss).toBe(true);
  });

  test("the same seed builds the same tower", () => {
    expect(startRun(content, 9).rooms).toEqual(startRun(content, 9).rooms);
  });
});

describe("recruitCoreborn", () => {
  test("adds Coreborn at the front and moves to camp after the last pick", () => {
    const run = campRun();
    expect(run.phase).toBe("camp");
    expect(run.party.map((member) => member.templateId)).toEqual([
      CRANE,
      FOX,
      "",
    ]);
    expect(runDeck(run, content)).toHaveLength(
      content.cultivator.starterDeck.length + 2 * BASE_CARD_COPIES,
    );
  });
});

describe("moveMember", () => {
  test("reorders the party in camp", () => {
    const run = moveMember(campRun(), 2, 0);
    expect(run.party.map((member) => member.kind)).toEqual([
      "cultivator",
      "coreborn",
      "coreborn",
    ]);
  });

  test("does nothing once the battle has started", () => {
    const run = beginBattle(campRun());
    expect(moveMember(run, 0, 2).party).toBe(run.party);
  });
});

describe("merging", () => {
  test("two copies merge into the next tier with upgraded cards and full health", () => {
    const run = campRun([FOX, FOX]);
    const [pair] = mergeOptions(run);
    if (!pair) {
      throw new Error("expected a merge");
    }
    expect(pair.resultTier).toBe(2);
    const wounded = {
      ...run,
      party: run.party.map((member) => ({ ...member, hitPoints: 1 })),
    };
    const merged = mergeCoreborn(wounded, content, pair);
    const fox = merged.party.find((member) => member.kind === "coreborn");
    expect(merged.party).toHaveLength(2);
    expect(fox).toMatchObject({ cardCopies: BASE_CARD_COPIES, tier: 2 });
    expect(fox?.hitPoints).toBe(fox?.maxHitPoints);
    const tierTwo = content.coreborn.find((entry) => entry.id === FOX)?.tiers[1]
      ?.card;
    expect(fox && memberCard(fox, content)).toEqual(tierTwo);
    expect(merged.stats.merges).toBe(1);
  });

  test("merging is only allowed between battles", () => {
    const run = campRun([FOX, FOX]);
    const [pair] = mergeOptions(run);
    if (!pair) {
      throw new Error("expected a merge");
    }
    const inBattle = beginBattle(run);
    expect(mergeCoreborn(inBattle, content, pair)).toBe(inBattle);
  });

  test("tier 4 cannot merge further", () => {
    const run = campRun([FOX, FOX]);
    const capped = {
      ...run,
      party: run.party.map((member) =>
        member.kind === "coreborn" ? { ...member, tier: 4 as const } : member,
      ),
    };
    expect(mergeOptions(capped)).toEqual([]);
  });
});

describe("finishBattle", () => {
  test("a fallen Coreborn leaves the party for the rest of the run", () => {
    const run = campRun();
    const fox = run.party[1]?.id ?? "";
    const after = fight(run, "victory", { [fox]: 0 });
    expect(after.party.some((member) => member.id === fox)).toBe(false);
    expect(after.stats.corebornLost).toEqual(["Huli Kit"]);
    expect(after.phase).toBe("reward");
  });

  test("losing the cultivator ends the run", () => {
    const after = fight(campRun(), "defeat", { cultivator: 0 });
    expect(after.phase).toBe("defeat");
  });

  test("the first floor rewards a Coreborn", () => {
    const after = fight(campRun(), "victory");
    expect(after.pendingReward?.kind).toBe("coreborn");
  });

  test("beating the boss crowns the climb", () => {
    const run = { ...campRun(), floorIndex: TOWER_FLOOR_COUNT - 1 };
    expect(fight(run, "victory").phase).toBe("victory");
  });
});

describe("claimReward", () => {
  test("a technique joins the cultivator's cards and the climb moves up", () => {
    const run: RunState = {
      ...beginBattle(campRun()),
      pendingReward: {
        cards: content.techniques.slice(0, 3),
        kind: "techniques",
      },
      phase: "reward",
    };
    const chosen = content.techniques[1];
    const after = claimReward(run, content, {
      cardId: chosen?.id ?? "",
      kind: "techniques",
    });
    expect(after.cultivatorDeck.at(-1)).toEqual(chosen);
    expect(after.floorIndex).toBe(1);
    expect(after.phase).toBe("camp");
  });

  test("a Coreborn card adds a copy for that member", () => {
    const run = campRun();
    const fox = run.party[1]?.id ?? "";
    const rewarded: RunState = {
      ...run,
      pendingReward: { kind: "monster-cards", memberIds: [fox] },
      phase: "reward",
    };
    const after = claimReward(rewarded, content, {
      kind: "monster-cards",
      memberId: fox,
    });
    expect(after.party[1]?.cardCopies).toBe(BASE_CARD_COPIES + 1);
  });

  test("fortify raises everyone's maximum health", () => {
    const run = campRun();
    const rewarded: RunState = {
      ...run,
      pendingReward: { kind: "health", options: ["mend", "fortify"] },
      phase: "reward",
    };
    const after = claimReward(rewarded, content, {
      kind: "health",
      option: "fortify",
    });
    after.party.forEach((member, index) => {
      expect(member.maxHitPoints).toBe(
        (run.party[index]?.maxHitPoints ?? 0) + FORTIFY_AMOUNT,
      );
    });
  });

  test("mend never heals past maximum health", () => {
    const run = campRun();
    const rewarded: RunState = {
      ...run,
      party: run.party.map((member) => ({
        ...member,
        hitPoints: member.maxHitPoints - 1,
      })),
      pendingReward: { kind: "health", options: ["mend", "fortify"] },
      phase: "reward",
    };
    const after = claimReward(rewarded, content, {
      kind: "health",
      option: "mend",
    });
    expect(
      after.party.every((member) => member.hitPoints === member.maxHitPoints),
    ).toBe(true);
  });
});
