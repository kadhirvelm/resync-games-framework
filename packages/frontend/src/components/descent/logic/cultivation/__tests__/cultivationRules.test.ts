import { describe, expect, test } from "bun:test";
import {
  BREAKTHROUGH_INJURY_SECONDS,
  CultivationCombatStub,
  CultivationStockpileStub,
  type CultivationStockpileStubOptions,
  CultivationSystem,
  type CultivationUnitState,
  cultivationStatModifiers,
  type RegisterCultivationUnitInput,
  type ResourceCost,
} from "..";

/** Stockpile whose material spend always loses a race. */
class RacingStockpileStub extends CultivationStockpileStub {
  /**
   * Rejects every spend, as if another command took the materials first.
   * @param _cost - Ignored cost
   * @returns Always false
   */
  override trySpend(_cost: ResourceCost): boolean {
    return false;
  }
}

/**
 * Creates a funded cultivation fixture.
 * @param stockpile - Optional stockpile to use instead of the default
 * @returns Combat stub, stockpile, and system
 */
function createHarness(stockpile?: CultivationStockpileStub) {
  const options: CultivationStockpileStubOptions = {
    hallTier: "Citadel",
    items: { breakthrough_pill: 5 },
    populationCap: 100,
    resources: { coin: 1_000, iron: 1_000, spirit_herbs: 1_000, stone: 1_000 },
  };
  const combat = new CultivationCombatStub();
  const funded = stockpile ?? new CultivationStockpileStub(options);
  const system = new CultivationSystem(
    { maxRankForLayer: () => "Ascended" },
    combat,
    funded,
  );
  return { combat, stockpile: funded, system };
}

/** Inputs for an Ashborn ready to break through to Sworn. */
const READY_ASHBORN: RegisterCultivationUnitInput = {
  combatProof: 3,
  essence: 50,
  merit: 100,
  unitId: "ready",
};

/** Inputs for a Veteran ready to break through to Champion. */
const READY_VETERAN: RegisterCultivationUnitInput = {
  combatProof: 15,
  essence: 350,
  merit: 700,
  rank: "Veteran",
  school: "ember",
  unitId: "veteran",
};

describe("breakthrough injury", () => {
  test("blocks a retry until the 45s injury has passed", () => {
    const { system } = createHarness();
    system.registerUnit({ ...READY_ASHBORN, essence: 100 });

    expect(system.startBreakthrough("ready").ok).toBe(true);
    system.advanceBreakthroughs(20, { ready: 1 });

    expect(system.getCultivationView("ready").missingRequirements).toContain(
      "Breakthrough injury is active.",
    );
    expect(system.startBreakthrough("ready").ok).toBe(false);
    system.advanceBreakthroughs(BREAKTHROUGH_INJURY_SECONDS);
    expect(system.startBreakthrough("ready").ok).toBe(true);
  });
});

describe("breakthrough rolls", () => {
  test("a missing roll in a record fails the channel", () => {
    const { system } = createHarness();
    system.registerUnit(READY_ASHBORN);
    system.startBreakthrough("ready");

    expect(system.advanceBreakthroughs(20, {})).toMatchObject([
      { succeeded: false, unitId: "ready" },
    ]);
  });

  test("accepts a roll function", () => {
    const { system } = createHarness();
    system.registerUnit(READY_ASHBORN);
    system.startBreakthrough("ready");
    const asked: string[] = [];

    const outcomes = system.advanceBreakthroughs(20, (unitId) => {
      asked.push(unitId);
      return 0.5;
    });

    expect(asked).toEqual(["ready"]);
    expect(outcomes).toMatchObject([{ succeeded: true, unitId: "ready" }]);
  });
});

describe("breakthrough spending", () => {
  test("a lost materials race refunds the pill and population", () => {
    const stockpile = new RacingStockpileStub({
      hallTier: "Citadel",
      items: { breakthrough_pill: 1 },
      populationCap: 100,
      resources: { iron: 100, spirit_herbs: 100, stone: 100 },
    });
    const { system } = createHarness(stockpile);
    system.registerUnit(READY_VETERAN);

    expect(system.startBreakthrough("veteran").ok).toBe(false);
    expect(stockpile.getItemCount("breakthrough_pill")).toBe(1);
    expect(stockpile.getPopulation().used).toBe(0);
    expect(stockpile.getStockpile().iron).toBe(100);
  });

  test("a missing pill spends no materials", () => {
    const stockpile = new CultivationStockpileStub({
      hallTier: "Citadel",
      items: { breakthrough_pill: 1 },
      populationCap: 100,
      resources: { iron: 100, spirit_herbs: 100, stone: 100 },
    });
    const { system } = createHarness(stockpile);
    system.registerUnit(READY_VETERAN);
    stockpile.consumeItem = () => false;

    expect(system.startBreakthrough("veteran").ok).toBe(false);
    expect(stockpile.getStockpile().iron).toBe(100);
    expect(stockpile.getPopulation().used).toBe(0);
  });
});

describe("population on success", () => {
  test("releases the reservation once the unit is promoted", () => {
    const { stockpile, system } = createHarness();
    system.registerUnit(READY_VETERAN);

    expect(system.startBreakthrough("veteran").ok).toBe(true);
    expect(stockpile.getPopulation().used).toBe(1);
    system.advanceBreakthroughs(20, { veteran: 0 });

    expect(system.getUnitState("veteran").rank).toBe("Champion");
    expect(stockpile.getPopulation().used).toBe(0);
  });
});

describe("death", () => {
  test("loses 25% merit below Champion and 10% with Long Life", () => {
    const { system } = createHarness();
    system.registerUnit({ merit: 123, unitId: "mortal" });
    system.registerUnit({ merit: 1_005, rank: "Champion", unitId: "elder" });

    system.onUnitDeath("mortal");
    system.onUnitDeath("elder");

    expect(system.getUnitState("mortal").merit).toBe(92);
    expect(system.getUnitState("elder").merit).toBe(904);
  });

  test("heroes keep equipped treasures; mortals drop them", () => {
    const { system } = createHarness();
    system.registerUnit({ isHero: true, unitId: "hero" });
    system.registerUnit({ rank: "Veteran", unitId: "mortal" });
    system.forgeTreasure({
      definitionId: "wardstone",
      essenceGrade: 1,
      instanceId: "stone-hero",
    });
    system.forgeTreasure({
      definitionId: "twin_gong",
      essenceGrade: 1,
      instanceId: "gong-mortal",
    });
    system.equipTreasure("hero", "stone-hero");
    system.equipTreasure("mortal", "gong-mortal");

    expect(system.onUnitDeath("hero")).toEqual([]);
    expect(system.getUnitState("hero").equippedTreasures).toHaveLength(1);
    expect(system.onUnitDeath("mortal")).toHaveLength(1);
    expect(system.getUnitState("mortal").equippedTreasures).toHaveLength(0);
    expect(system.getGroundTreasures().map((t) => t.instanceId)).toEqual([
      "gong-mortal",
    ]);
  });
});

describe("cultivationStatModifiers", () => {
  /**
   * Builds a bare cultivation unit for modifier tests.
   * @param overrides - Fields to replace
   * @returns A pill-free Ashborn
   */
  const unitState = (
    overrides: Partial<CultivationUnitState> = {},
  ): CultivationUnitState => ({
    appliedPills: [],
    combatProof: 0,
    equippedTreasures: [],
    essence: 0,
    isHero: false,
    merit: 0,
    rank: "Ashborn",
    unitId: "u",
    ...overrides,
  });

  test("is neutral for a fresh Ashborn", () => {
    expect(cultivationStatModifiers(unitState())).toEqual({
      damage: 1,
      maxHealth: 1,
      moveSpeed: 1,
      schoolEffect: 1,
    });
  });

  test("applies the realm multiplier and pill bonuses", () => {
    const modifiers = cultivationStatModifiers(
      unitState({
        appliedPills: [
          {
            amount: 0.1,
            pillId: "body_pill",
            realm: "Sworn",
            role: "permanent",
            stat: "max_health",
          },
          {
            amount: 0.08,
            pillId: "wind_pill",
            realm: "Veteran",
            role: "permanent",
            stat: "move_speed",
          },
          {
            amount: 0.2,
            pillId: "ember_dao_pill",
            realm: "Veteran",
            role: "dao",
            schoolMatch: true,
            stat: "school_effect",
          },
          {
            amount: 0.1,
            pillId: "rime_dao_pill",
            realm: "Veteran",
            role: "dao",
            schoolMatch: false,
            stat: "school_effect",
          },
        ],
        rank: "Veteran",
        school: "ember",
      }),
    );

    expect(modifiers.damage).toBe(3);
    expect(modifiers.maxHealth).toBeCloseTo(3.3);
    expect(modifiers.moveSpeed).toBeCloseTo(1.08);
    expect(modifiers.schoolEffect).toBeCloseTo(1.3);
  });
});
