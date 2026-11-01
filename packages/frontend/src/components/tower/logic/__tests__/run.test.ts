import { describe, expect, test } from "bun:test";
import { BUILT_IN_TOWER } from "../builtInContent";
import { TOWER_FLOOR_COUNT } from "../generateTower";
import {
  abandonRun,
  BASE_CARD_COPIES,
  BASE_DRAFT_SIZE,
  beginBattle,
  claimReward,
  combatSetup,
  DEFAULT_RUN_OPTIONS,
  FORTIFY_AMOUNT,
  finishBattle,
  memberCard,
  mergeCoreborn,
  mergeOptions,
  moveMember,
  recruitCoreborn,
  rerollReward,
  runDeck,
  startRun,
} from "../run";
import type { RunState, TowerContent, UnitSprite } from "../towerTypes";

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

describe("combatSetup", () => {
  test("gives each Coreborn its battle sprite and leaves the rest drawn as portraits", () => {
    const sprite: UnitSprite = {
      animations: {
        idle: {
          fps: 8,
          frameCount: 6,
          loop: true,
          stripUrl: "https://cdn.test/fox/idle.png",
        },
      },
      facing: "right",
      frameHeight: 180,
      frameWidth: 140,
      id: "fox-sprite",
    };
    const animated: TowerContent = {
      ...content,
      coreborn: content.coreborn.map((template) =>
        template.id === FOX ? { ...template, sprite } : template,
      ),
    };
    const run = beginBattle(campRun());
    const party = combatSetup(run, animated).party;
    const fox = run.party.find((member) => member.templateId === FOX);

    expect(party.find((unit) => unit.id === fox?.id)?.sprite).toBe(sprite);
    expect(
      party.filter((unit) => unit.id !== fox?.id).map((unit) => unit.sprite),
    ).toEqual([undefined, undefined]);
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

describe("run options", () => {
  test("cultivation bonuses shape the opening of a climb", () => {
    const run = startRun(content, 5, {
      ...DEFAULT_RUN_OPTIONS,
      ascension: 2,
      cultivatorBonusHitPoints: 8,
      extraDraftOptions: 1,
      extraTechniques: 1,
    });
    const plain = startRun(content, 5);
    expect(run.ascension).toBe(2);
    expect(run.party[0]?.maxHitPoints).toBe(
      (plain.party[0]?.maxHitPoints ?? 0) + 8,
    );
    expect(run.cultivatorDeck).toHaveLength(plain.cultivatorDeck.length + 1);
    const draft =
      run.pendingReward?.kind === "coreborn"
        ? run.pendingReward.templateIds
        : [];
    expect(draft).toHaveLength(
      Math.min(content.coreborn.length, BASE_DRAFT_SIZE + 1),
    );
  });

  test("kindred bond adds health to recruits and survives a merge", () => {
    /**
     * @param bonus - Coreborn bonus health
     * @returns A camp run with two foxes merged into one
     */
    const mergedFox = (bonus: number): RunState => {
      const opening = startRun(content, 42, {
        ...DEFAULT_RUN_OPTIONS,
        modifiers: {
          ...DEFAULT_RUN_OPTIONS.modifiers,
          corebornBonusHitPoints: bonus,
        },
      });
      const run = recruitCoreborn(
        recruitCoreborn(opening, content, FOX),
        content,
        FOX,
      );
      expect(run.party[0]?.maxHitPoints).toBeGreaterThan(0);
      const [pair] = mergeOptions(run);
      return pair ? mergeCoreborn(run, content, pair) : run;
    };
    const plain = mergedFox(0);
    const bonded = mergedFox(3);
    expect(bonded.party[0]?.tier).toBe(2);
    expect(bonded.party[0]?.maxHitPoints).toBe(
      (plain.party[0]?.maxHitPoints ?? 0) + 3,
    );
  });

  test("respite heals survivors after a won battle, up to their maximum", () => {
    const base = campRun();
    const run: RunState = {
      ...base,
      modifiers: { ...base.modifiers, respiteHealing: 4 },
    };
    const fox = run.party[1];
    const after = fight(run, "victory", { [fox?.id ?? ""]: 1 });
    const healed = after.party.find((member) => member.id === fox?.id);
    expect(healed?.hitPoints).toBe(5);
    const cultivator = after.party.find(
      (member) => member.kind === "cultivator",
    );
    expect(cultivator?.hitPoints).toBe(cultivator?.maxHitPoints);
  });
});

describe("rerollReward", () => {
  test("spends a reroll on a fresh offer of the same kind", () => {
    const base = campRun();
    const run: RunState = {
      ...base,
      modifiers: { ...base.modifiers, rerollsLeft: 1 },
      pendingReward: { cards: [], kind: "techniques" },
      phase: "reward",
      rooms: base.rooms.map((room, index) =>
        index === 0 ? { ...room, reward: "techniques" } : room,
      ),
    };
    const rerolled = rerollReward(run, content);
    expect(rerolled.modifiers.rerollsLeft).toBe(0);
    expect(rerolled.pendingReward?.kind).toBe("techniques");
    expect(rerolled.randomState).not.toBe(run.randomState);
    expect(rerollReward(rerolled, content)).toBe(rerolled);
  });

  test("does nothing without rerolls or outside a reward", () => {
    const run = campRun();
    expect(rerollReward(run, content)).toBe(run);
  });
});

describe("abandonRun", () => {
  test("ends the climb as a defeat where it stands", () => {
    const run = campRun();
    const abandoned = abandonRun(run);
    expect(abandoned.phase).toBe("defeat");
    expect(abandoned.floorIndex).toBe(run.floorIndex);
    expect(abandonRun(abandoned)).toBe(abandoned);
  });
});
