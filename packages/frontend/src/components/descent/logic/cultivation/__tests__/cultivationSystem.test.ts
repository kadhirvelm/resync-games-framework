import { describe, expect, test } from "bun:test";
import {
  CultivationCombatStub,
  CultivationStockpileStub,
  CultivationSystem,
  getCultivationView,
  PILLS,
  type RankTitle,
  REALMS,
} from "..";

interface Harness {
  combat: CultivationCombatStub;
  stockpile: CultivationStockpileStub;
  system: CultivationSystem;
}

/**
 * Creates a fully funded cultivation fixture with an injected layer cap.
 * @param maxRankForLayer - Live layer-cap query
 * @returns Headless combat, stockpile, and cultivation system
 */
function createHarness(
  maxRankForLayer: () => RankTitle = () => "Ascended",
): Harness {
  const combat = new CultivationCombatStub();
  const stockpile = new CultivationStockpileStub({
    hallTier: "Citadel",
    items: {
      battle_pill: 1,
      blood_dao_pill: 1,
      body_pill: 2,
      breakthrough_pill: 20,
      spirit_pill: 1,
      wind_pill: 1,
    },
    populationCap: 100,
    resources: {
      coin: 1_000,
      iron: 1_000,
      spirit_herbs: 1_000,
      stone: 1_000,
    },
  });
  return {
    combat,
    stockpile,
    system: new CultivationSystem({ maxRankForLayer }, combat, stockpile),
  };
}

describe("cultivation gates", () => {
  test("requires both battle merit and essence rather than either alone", () => {
    const { system } = createHarness();
    system.registerUnit({
      combatProof: 3,
      essence: 50,
      merit: 0,
      unitId: "stockpile-only",
    });
    system.registerUnit({
      combatProof: 3,
      essence: 0,
      merit: 100,
      unitId: "battle-only",
    });

    expect(
      getCultivationView(system, "stockpile-only").missingRequirements,
    ).toContain("Battle merit 0/100");
    expect(
      system.getCultivationView("battle-only").missingRequirements,
    ).toContain("Essence 0/50");
    expect(system.startBreakthrough("stockpile-only").ok).toBe(false);
    expect(system.startBreakthrough("battle-only").ok).toBe(false);
  });

  test("preserves merit, halves essence, and injures for 45s on failure", () => {
    const { combat, stockpile, system } = createHarness();
    system.registerUnit({
      combatProof: 3,
      essence: 51,
      merit: 123,
      unitId: "failed",
    });

    expect(system.startBreakthrough("failed").ok).toBe(true);
    expect(system.advanceBreakthroughs(20, { failed: 1 })).toEqual([
      {
        kind: "channel",
        sourceRank: "Ashborn",
        succeeded: false,
        targetRank: "Sworn",
        unitId: "failed",
      },
    ]);
    expect(system.getUnitState("failed")).toMatchObject({
      activeBreakthrough: undefined,
      essence: 25,
      merit: 123,
      rank: "Ashborn",
    });
    expect(combat.getInjurySeconds("failed")).toBe(45);
    expect(stockpile.getPopulation().used).toBe(0);
  });

  test("reads the injected layer cap at the moment of the attempt", () => {
    let layerCap: RankTitle = "Sworn";
    const { system } = createHarness(() => layerCap);
    system.registerUnit({
      combatProof: 8,
      essence: 150,
      merit: 300,
      rank: "Sworn",
      school: "ember",
      unitId: "capped",
    });

    expect(system.getCultivationView("capped").missingRequirements).toContain(
      "Layer rank cap is Sworn.",
    );
    expect(system.startBreakthrough("capped").ok).toBe(false);
    layerCap = "Veteran";
    expect(system.startBreakthrough("capped").ok).toBe(true);
  });

  test("climbs the full Ashborn to Ascended ladder", () => {
    const { system } = createHarness();
    system.registerUnit({
      combatProof: 25,
      merit: 1_500,
      unitId: "climber",
    });

    const passingRoll = () => 0;
    system.awardEssence("climber", 50);
    expect(system.startBreakthrough("climber").ok).toBe(true);
    system.advanceBreakthroughs(20, passingRoll);
    expect(system.getUnitState("climber").rank).toBe("Sworn");
    expect(system.chooseSchool("climber", "ember").ok).toBe(true);

    system.awardEssence("climber", 150);
    expect(system.startBreakthrough("climber").ok).toBe(true);
    system.advanceBreakthroughs(20, { climber: 0 });
    expect(system.getUnitState("climber").rank).toBe("Veteran");

    system.awardEssence("climber", 350);
    expect(system.startBreakthrough("climber").ok).toBe(true);
    system.advanceBreakthroughs(20, passingRoll);
    expect(system.getUnitState("climber").rank).toBe("Champion");

    system.awardEssence("climber", 800);
    expect(system.startBreakthrough("climber").ok).toBe(true);
    system.advanceBreakthroughs(30);
    expect(system.getUnitState("climber").rank).toBe("Ascended");
    expect(system.getCultivationView("climber").passives).toHaveLength(12);
  });
});

describe("pills", () => {
  test("rejects a fourth permanent pill with no silent consume", () => {
    const { stockpile, system } = createHarness();
    system.registerUnit({ unitId: "toxic" });

    expect(system.feedPill("toxic", "body_pill").ok).toBe(true);
    expect(system.feedPill("toxic", "spirit_pill").ok).toBe(true);
    expect(system.feedPill("toxic", "wind_pill").ok).toBe(true);
    const bodyPillsBefore = stockpile.getItemCount("body_pill");
    const fourth = system.feedPill("toxic", "body_pill");

    expect(fourth).toEqual({
      error: "Toxicity cap reached for Ashborn.",
      ok: false,
    });
    expect(stockpile.getItemCount("body_pill")).toBe(bodyPillsBefore);
    expect(system.getCultivationView("toxic").toxicity).toBe(3);
  });

  test("applies an off-school Dao Pill at half effect", () => {
    const { system } = createHarness();
    system.registerUnit({
      rank: "Sworn",
      school: "ember",
      unitId: "dao",
    });

    expect(system.previewPill("dao", "blood_dao_pill")).toMatchObject({
      canFeed: true,
      effectivenessMultiplier: 0.5,
      projectedAmount: 0.1,
      schoolMatch: false,
    });
    expect(system.feedPill("dao", "blood_dao_pill")).toEqual({
      ok: true,
      value: 0.1,
    });
    expect(system.getUnitState("dao").appliedPills[0]).toMatchObject({
      amount: 0.1,
      pillId: "blood_dao_pill",
      schoolMatch: false,
    });
  });

  test("keeps Battle Pill as a non-executable data stub", () => {
    const { system } = createHarness();
    system.registerUnit({ unitId: "battle-pill" });

    expect(PILLS.find((pill) => pill.id === "battle_pill")?.role).toBe(
      "battle",
    );
    expect(system.previewPill("battle-pill", "battle_pill").canFeed).toBe(
      false,
    );
  });
});

describe("treasures", () => {
  test("drops an equipped treasure on death and allows recovery and re-equip", () => {
    const { combat, system } = createHarness();
    system.registerUnit({ rank: "Veteran", unitId: "bearer" });
    expect(
      system.forgeTreasure({
        definitionId: "cinder_banner",
        essenceGrade: 4,
        instanceId: "banner-1",
      }).ok,
    ).toBe(true);
    expect(system.equipTreasure("bearer", "banner-1").ok).toBe(true);

    expect(system.applyCombatDamage("bearer", 100)).toEqual([
      {
        definitionId: "cinder_banner",
        essenceGrade: 4,
        instanceId: "banner-1",
      },
    ]);
    expect(system.getGroundTreasures()).toHaveLength(1);
    expect(system.recoverTreasure("banner-1").ok).toBe(true);
    combat.restoreUnit("bearer");
    expect(system.equipTreasure("bearer", "banner-1").ok).toBe(true);
    expect(system.getUnitState("bearer").equippedTreasures).toHaveLength(1);
  });
});

describe("Tribulation", () => {
  test("promotes a surviving Champion to Ascended after 30 seconds", () => {
    const { system } = createHarness();
    system.registerUnit({
      combatProof: 25,
      essence: 800,
      maxHealth: 100,
      merit: 1_500,
      rank: "Champion",
      school: "rime",
      unitId: "survivor",
    });

    expect(system.startBreakthrough("survivor")).toMatchObject({
      ok: true,
      value: { kind: "tribulation", remainingSeconds: 30 },
    });
    expect(system.advanceBreakthroughs(29)).toEqual([]);
    expect(system.applyCombatDamage("survivor", 99)).toEqual([]);
    expect(system.advanceBreakthroughs(1)).toMatchObject([
      { kind: "tribulation", succeeded: true, unitId: "survivor" },
    ]);
    expect(system.getUnitState("survivor").rank).toBe("Ascended");
  });

  test("takes the failure path (and Long Life merit loss) when the Champion dies while channeling", () => {
    const { combat, stockpile, system } = createHarness();
    system.registerUnit({
      combatProof: 25,
      essence: 800,
      maxHealth: 100,
      merit: 1_500,
      rank: "Champion",
      school: "blood",
      unitId: "struck-down",
    });
    expect(system.startBreakthrough("struck-down").ok).toBe(true);

    system.applyCombatDamage("struck-down", 100);

    expect(system.getUnitState("struck-down")).toMatchObject({
      activeBreakthrough: undefined,
      essence: 400,
      merit: 1_350,
      rank: "Champion",
    });
    expect(combat.getInjurySeconds("struck-down")).toBe(45);
    expect(stockpile.getPopulation().used).toBe(0);
  });
});

describe("realm data", () => {
  test("defines the complete canonical ladder and cumulative visible beats", () => {
    expect(REALMS.map((realm) => realm.rank)).toEqual([
      "Ashborn",
      "Sworn",
      "Veteran",
      "Champion",
      "Ascended",
    ]);
    expect(REALMS.at(-1)?.passives).toEqual([
      "True Domain",
      "Immortal Body",
      "Tribulation Scar",
    ]);
  });
});
