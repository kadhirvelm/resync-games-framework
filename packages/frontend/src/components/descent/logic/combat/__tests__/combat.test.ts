import { describe, expect, test } from "bun:test";
import type { CombatBuilding, CombatClassId, CombatUnit, SchoolId } from "..";
import {
  BLOOD_LIFESTEAL_RATIO,
  BURN_DAMAGE_RATIO,
  BURN_TICK_INTERVAL_MS,
  CHILL_SPEED_MULTIPLIER,
  CLASS_COUNTER_BONUS,
  CombatSimulation,
  createCombatUnit,
  DEFAULT_COMBAT_TICK_MS,
  getClassCounterMultiplier,
  getUnitDefinition,
  StubCombatEconomy,
  trainUnitBatch,
  UNIT_DEFINITIONS,
} from "..";

/**
 * Creates a normalized melee unit so tests isolate one combat rule at a time.
 * @param id - Unique entity id
 * @param classId - Counter-matrix class
 * @param factionId - Owning faction
 * @param school - Optional passive school
 * @returns A nearby unit with 100 health, zero armor, and 20 damage
 */
function unit(
  id: string,
  classId: CombatClassId,
  factionId: string,
  school?: SchoolId,
): CombatUnit {
  return {
    ...createCombatUnit(getUnitDefinition(classId), {
      factionId,
      id,
      position: { x: factionId === "hold" ? 0 : 1, y: 0 },
      school,
    }),
    armor: 0,
    attackKind: "melee",
    attackRange: 2,
    damage: 20,
    hitPoints: 100,
    maxHitPoints: 100,
  };
}

describe("class counter matrix", () => {
  const counters: Readonly<Record<CombatClassId, readonly CombatClassId[]>> = {
    adept: ["hunter"],
    breaker: ["warden"],
    hunter: ["warden"],
    raider: ["hunter", "adept", "breaker"],
    rider: [],
    warden: ["raider", "rider"],
  };

  test("contains every data-driven combat class", () => {
    expect(
      UNIT_DEFINITIONS.map((definition) => definition.classId).sort(),
    ).toEqual(["adept", "breaker", "hunter", "raider", "rider", "warden"]);
  });

  test("makes the Rider the roster's fast, far-seeing scout", () => {
    const rider = getUnitDefinition("rider");
    const otherUnits = UNIT_DEFINITIONS.filter(
      (definition) => definition.classId !== "rider",
    );
    expect(rider.popCost).toBe(2);
    expect(rider.trainingCost).toEqual({ food: 45, water: 25 });
    expect(rider.speed).toBeGreaterThan(
      Math.max(...otherUnits.map((definition) => definition.speed)),
    );
    expect(rider.vision).toBeGreaterThan(
      Math.max(...otherUnits.map((definition) => definition.vision)),
    );
  });

  test("applies +50% only to locked matchups", () => {
    for (const attacker of Object.keys(counters) as CombatClassId[]) {
      for (const defender of Object.keys(counters) as CombatClassId[]) {
        const expected = counters[attacker].includes(defender)
          ? CLASS_COUNTER_BONUS
          : 1;
        expect(getClassCounterMultiplier(attacker, defender)).toBe(expected);
      }
    }
    expect(getClassCounterMultiplier("villager", "raider")).toBe(1);
  });

  test("makes equal-stat Warden damage 1.5x stronger into Raider", () => {
    const warden = unit("warden", "warden", "hold");
    const raider = unit("raider", "raider", "horde");
    const simulation = new CombatSimulation({ units: [warden, raider] });

    simulation.applyDamage("warden", "raider", 20);
    simulation.applyDamage("raider", "warden", 20);

    expect(simulation.getUnit("raider")?.hitPoints).toBe(70);
    expect(simulation.getUnit("warden")?.hitPoints).toBe(80);
  });
});

describe("school passives", () => {
  test("Ember burns over time and jumps to a nearby ally on kill", () => {
    const ember = unit("ember", "warden", "hold", "ember");
    const target = unit("target", "warden", "horde");
    const bystander = {
      ...unit("bystander", "warden", "horde"),
      position: { x: 2, y: 0 },
    };
    const simulation = new CombatSimulation({
      units: [ember, target, bystander],
    });

    expect(simulation.attack("ember", "target")).toBe(true);
    expect(simulation.getUnit("target")?.statuses.burn).toBeDefined();
    simulation.advanceTicks(BURN_TICK_INTERVAL_MS / DEFAULT_COMBAT_TICK_MS);
    expect(simulation.getUnit("target")?.hitPoints).toBe(
      100 - 20 - 20 * BURN_DAMAGE_RATIO,
    );

    const doomed = {
      ...unit("doomed", "warden", "horde"),
      hitPoints: 10,
      position: { x: 1, y: 1 },
    };
    const spreadTarget = {
      ...unit("spread-target", "warden", "horde"),
      position: { x: 2, y: 1 },
    };
    const spreadSimulation = new CombatSimulation({
      units: [
        unit("second-ember", "warden", "hold", "ember"),
        doomed,
        spreadTarget,
      ],
    });
    expect(spreadSimulation.attack("second-ember", "doomed")).toBe(true);
    expect(
      spreadSimulation.getUnit("spread-target")?.statuses.burn,
    ).toBeDefined();
  });

  test("Rime cycles chill, freeze, then chill again", () => {
    const rime = {
      ...unit("rime", "warden", "hold", "rime"),
      attacksPerSecond: 1_000 / DEFAULT_COMBAT_TICK_MS,
      damage: 1,
    };
    const target = unit("target", "warden", "horde");
    const simulation = new CombatSimulation({ units: [rime, target] });

    expect(simulation.attack("rime", "target")).toBe(true);
    expect(simulation.getEffectiveSpeed("target")).toBeCloseTo(
      target.speed * CHILL_SPEED_MULTIPLIER,
    );
    simulation.advanceTick();
    expect(simulation.getUnit("target")?.statuses.frozen).toBeDefined();
    expect(simulation.getUnit("target")?.statuses.chill).toBeUndefined();
    expect(simulation.getEffectiveSpeed("target")).toBe(0);

    const thirdHit = simulation.advanceTick();
    expect(thirdHit).toContainEqual({
      effect: "chill",
      kind: "status_applied",
      sourceId: "rime",
      targetId: "target",
    });
    expect(simulation.getUnit("target")?.statuses.chill).toBeDefined();
  });

  test("Blood lifesteals from actual post-armor damage", () => {
    const blood = {
      ...unit("blood", "warden", "hold", "blood"),
      hitPoints: 40,
    };
    const target = unit("target", "warden", "horde");
    const simulation = new CombatSimulation({ units: [blood, target] });

    expect(simulation.attack("blood", "target")).toBe(true);
    expect(simulation.getUnit("blood")?.hitPoints).toBe(
      40 + 20 * BLOOD_LIFESTEAL_RATIO,
    );
  });
});

describe("structures, economy, and simulation seams", () => {
  test("Breaker doubles its raw damage against structures", () => {
    const breaker = unit("breaker", "breaker", "hold");
    const building: CombatBuilding = {
      armor: 0,
      factionId: "horde",
      hitPoints: 100,
      id: "wall",
      maxHitPoints: 100,
      position: { x: 1, y: 0 },
    };
    const simulation = new CombatSimulation({
      buildings: [building],
      units: [breaker],
    });

    simulation.applyDamage("breaker", "wall", 20);

    expect(simulation.getBuilding("wall")?.hitPoints).toBe(60);
    expect(simulation.drainEvents()).toContainEqual({
      amount: 40,
      hitPoints: 60,
      kind: "building_damaged",
      sourceId: "breaker",
      targetId: "wall",
    });
  });

  test("trains Ashborn in batches of five through the economy interface", () => {
    const economy = new StubCombatEconomy({
      food: 200,
      population: 3,
      populationCap: 10,
      water: 100,
    });

    expect(trainUnitBatch("warden", "Ashborn", economy)).toEqual({
      count: 5,
      ok: true,
      populationAdded: 5,
      spent: { food: 150, water: 75 },
    });
    expect(economy.state).toEqual({
      food: 50,
      population: 8,
      populationCap: 10,
      water: 25,
    });
  });

  test("executes move orders on ticks and exposes layered vision multipliers", () => {
    const warden = unit("warden", "warden", "hold");
    const simulation = new CombatSimulation({ units: [warden] });

    simulation.enqueueCommand(
      { type: "order_move", unitIds: ["warden"], x: 10, y: 0 },
      "player-1",
    );
    expect(simulation.getUnit("warden")?.order).toBeUndefined();
    simulation.advanceTick();
    expect(simulation.getUnit("warden")?.position.x).toBeGreaterThan(0);

    simulation.setVisionMultiplier(0.5);
    simulation.setVisionMultiplier(0.5, "hold");
    expect(simulation.getVision("warden")).toBe(warden.vision * 0.25);
  });

  test("emits treasure, merit, and wave death hooks", () => {
    const source = unit("source", "warden", "hold");
    const target = {
      ...unit("target", "warden", "horde"),
      hasTreasure: true,
      hitPoints: 10,
      isWaveUnit: true,
      merit: 100,
    };
    const simulation = new CombatSimulation({ units: [source, target] });

    simulation.applyDamage("source", "target", 20);

    expect(simulation.drainEvents()).toEqual([
      {
        amount: 10,
        kind: "damage_applied",
        sourceId: "source",
        targetId: "target",
      },
      {
        killerId: "source",
        kind: "unit_killed",
        meritLost: 25,
        treasureDropped: true,
        unitId: "target",
      },
      { killerId: "source", kind: "wave_unit_died", unitId: "target" },
    ]);
  });
});

describe("formation moves", () => {
  test("walks each unit to its own slot at the slowest member's pace", () => {
    const raider = {
      ...createCombatUnit(getUnitDefinition("raider"), {
        factionId: "hold",
        id: "raider",
        position: { x: 0, y: 0 },
      }),
    };
    const breaker = {
      ...createCombatUnit(getUnitDefinition("breaker"), {
        factionId: "hold",
        id: "breaker",
        position: { x: 0, y: 2 },
      }),
    };
    const simulation = new CombatSimulation({ units: [raider, breaker] });
    simulation.enqueueCommand(
      {
        destinations: { breaker: { x: 30, y: 2 }, raider: { x: 30, y: 0 } },
        keepPace: true,
        type: "order_move",
        unitIds: ["raider", "breaker"],
        x: 30,
        y: 1,
      },
      "player-1",
    );
    simulation.advanceTick();
    simulation.advanceTick();
    const raiderAfter = simulation.getUnit("raider");
    const breakerAfter = simulation.getUnit("breaker");
    expect(raiderAfter?.order).toMatchObject({
      destination: { x: 30, y: 0 },
      pace: breaker.speed,
    });
    expect(raiderAfter?.position.x).toBeCloseTo(
      breakerAfter?.position.x ?? Number.NaN,
      6,
    );
    expect(raiderAfter?.position.y).toBe(0);
    expect(breakerAfter?.position.y).toBe(2);
  });

  test("an order without keepPace lets each unit run at its own speed", () => {
    const raider = createCombatUnit(getUnitDefinition("raider"), {
      factionId: "hold",
      id: "raider",
      position: { x: 0, y: 0 },
    });
    const breaker = createCombatUnit(getUnitDefinition("breaker"), {
      factionId: "hold",
      id: "breaker",
      position: { x: 0, y: 2 },
    });
    const simulation = new CombatSimulation({ units: [raider, breaker] });
    simulation.enqueueCommand(
      { type: "order_move", unitIds: ["raider", "breaker"], x: 30, y: 1 },
      "player-1",
    );
    simulation.advanceTick();
    simulation.advanceTick();
    expect(simulation.getUnit("raider")?.position.x ?? 0).toBeGreaterThan(
      simulation.getUnit("breaker")?.position.x ?? 0,
    );
  });
});

describe("large bodies", () => {
  test("melee reaches the edge of a large body, not its center", () => {
    const boss = {
      ...createCombatUnit(getUnitDefinition("breaker"), {
        factionId: "horde",
        id: "boss",
        position: { x: 1.4, y: 0 },
      }),
      bodyRadius: 0.7,
    };
    const raider = createCombatUnit(getUnitDefinition("raider"), {
      factionId: "hold",
      id: "raider",
      position: { x: 0, y: 0 },
    });
    expect(raider.attackRange).toBeLessThan(1.4);
    const simulation = new CombatSimulation({ units: [raider, boss] });
    expect(simulation.attack("raider", "boss")).toBe(true);
  });

  test("an ordinary target still needs center-to-center range", () => {
    const target = createCombatUnit(getUnitDefinition("breaker"), {
      factionId: "horde",
      id: "target",
      position: { x: 1.4, y: 0 },
    });
    const raider = createCombatUnit(getUnitDefinition("raider"), {
      factionId: "hold",
      id: "raider",
      position: { x: 0, y: 0 },
    });
    const simulation = new CombatSimulation({ units: [raider, target] });
    expect(simulation.attack("raider", "target")).toBe(false);
  });

  test("a large attacker reaches from its own edge", () => {
    const boss = {
      ...createCombatUnit(getUnitDefinition("raider"), {
        factionId: "horde",
        id: "boss",
        position: { x: 0, y: 0 },
      }),
      bodyRadius: 0.7,
    };
    const warden = createCombatUnit(getUnitDefinition("warden"), {
      factionId: "hold",
      id: "warden",
      position: { x: 1.9, y: 0 },
    });
    const simulation = new CombatSimulation({ units: [boss, warden] });
    expect(simulation.attack("boss", "warden")).toBe(true);
  });
});
