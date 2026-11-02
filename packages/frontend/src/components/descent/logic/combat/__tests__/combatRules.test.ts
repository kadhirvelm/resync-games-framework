import { describe, expect, test } from "bun:test";
import { TICK_MS } from "../../sim/constants";
import {
  BURN_DURATION_MS,
  type CombatBuilding,
  type CombatClassId,
  type CombatEvent,
  CombatSimulation,
  type CombatUnit,
  compareIds,
  createCombatUnit,
  DEFAULT_COMBAT_TICK_MS,
  getUnitDefinition,
  mergeBurn,
  type SchoolId,
} from "..";

/**
 * Creates a normalized melee unit with zero armor and 20 damage.
 * @param id - Unique entity id
 * @param classId - Counter-matrix class
 * @param factionId - Owning faction
 * @param overrides - Fields to replace after normalization
 * @returns A 100-health unit at the origin unless overridden
 */
function unit(
  id: string,
  classId: CombatClassId,
  factionId: string,
  overrides: Partial<CombatUnit> & { school?: SchoolId } = {},
): CombatUnit {
  return {
    ...createCombatUnit(getUnitDefinition(classId), {
      factionId,
      id,
      position: { x: 0, y: 0 },
    }),
    armor: 0,
    attackKind: "melee",
    attackRange: 2,
    damage: 20,
    hitPoints: 100,
    maxHitPoints: 100,
    vision: 8,
    ...overrides,
  };
}

/**
 * Creates a structure for building-damage tests.
 * @param id - Unique building id
 * @param factionId - Owning faction
 * @param overrides - Fields to replace
 * @returns A 100-health, zero-armor building at x = 5
 */
function building(
  id: string,
  factionId: string,
  overrides: Partial<CombatBuilding> = {},
): CombatBuilding {
  return {
    armor: 0,
    factionId,
    hitPoints: 100,
    id,
    maxHitPoints: 100,
    position: { x: 5, y: 0 },
    ...overrides,
  };
}

/**
 * Counts attacks started by one unit.
 * @param events - Events to scan
 * @param sourceId - Attacker id
 * @returns Number of `attack_started` events from that attacker
 */
function countAttacks(events: CombatEvent[], sourceId: string): number {
  return events.filter(
    (event) => event.kind === "attack_started" && event.sourceId === sourceId,
  ).length;
}

describe("tick length", () => {
  test("defaults to the Descent sim tick", () => {
    expect(DEFAULT_COMBAT_TICK_MS).toBe(TICK_MS);
  });

  test("attack rate does not depend on tick length", () => {
    const attacksOverHundredSeconds = (tickMs: number): number => {
      const simulation = new CombatSimulation({
        tickMs,
        units: [
          unit("attacker", "warden", "hold", { attacksPerSecond: 0.8 }),
          unit("dummy", "warden", "horde", {
            damage: 0,
            hitPoints: 1e9,
            maxHitPoints: 1e9,
            position: { x: 1, y: 0 },
          }),
        ],
      });
      return countAttacks(
        simulation.advanceTicks(100_000 / tickMs),
        "attacker",
      );
    };

    expect(attacksOverHundredSeconds(50)).toBe(80);
    expect(attacksOverHundredSeconds(100)).toBe(80);
  });
});

describe("Ember refresh", () => {
  test("mergeBurn keeps the tick clock and the stronger burn", () => {
    const refreshed = mergeBurn(
      { damagePerTick: 5, elapsedMs: 600, remainingMs: 400, sourceId: "a" },
      "b",
      3,
    );

    expect(refreshed).toEqual({
      damagePerTick: 5,
      elapsedMs: 600,
      remainingMs: BURN_DURATION_MS,
      sourceId: "a",
    });
  });

  test("two staggered Ember attackers still deal burn damage", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("ember-a", "warden", "hold", {
          attacksPerSecond: 1,
          school: "ember",
        }),
        unit("ember-b", "warden", "hold", {
          attackCooldownMs: 500,
          attacksPerSecond: 1,
          school: "ember",
        }),
        unit("target", "warden", "horde", {
          damage: 0,
          hitPoints: 1e6,
          maxHitPoints: 1e6,
          position: { x: 1, y: 0 },
        }),
      ],
    });

    const burnTicks = simulation
      .advanceTicks(2_000 / DEFAULT_COMBAT_TICK_MS)
      .filter(
        (event) =>
          event.kind === "damage_applied" &&
          event.targetId === "target" &&
          event.amount === 3,
      );

    expect(burnTicks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("damage math", () => {
  test("subtracts armor before the class counter", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("warden", "warden", "hold"),
        unit("raider", "raider", "horde", { armor: 5 }),
      ],
    });

    simulation.applyDamage("warden", "raider", 20);

    expect(simulation.getUnit("raider")?.hitPoints).toBe(100 - 15 * 1.5);
  });

  test("subtracts structure armor before the Breaker multiplier", () => {
    const simulation = new CombatSimulation({
      buildings: [building("wall", "horde", { armor: 5 })],
      units: [unit("breaker", "breaker", "hold")],
    });

    simulation.applyDamage("breaker", "wall", 20);

    expect(simulation.getBuilding("wall")?.hitPoints).toBe(100 - 15 * 2);
  });

  test("keeps a floor of one damage", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("warden", "warden", "hold"),
        unit("raider", "raider", "horde", { armor: 30 }),
      ],
    });

    simulation.applyDamage("warden", "raider", 20);

    expect(simulation.getUnit("raider")?.hitPoints).toBe(99);
  });
});

describe("friendly fire", () => {
  test("ignores direct damage and explicit attacks on allies", () => {
    const simulation = new CombatSimulation({
      buildings: [building("hall", "hold", { position: { x: 1, y: 0 } })],
      units: [
        unit("a", "warden", "hold"),
        unit("b", "warden", "hold", { position: { x: 1, y: 0 } }),
      ],
    });

    simulation.applyDamage("a", "b", 50);
    simulation.applyDamage("a", "hall", 50);

    expect(simulation.attack("a", "b")).toBe(false);
    expect(simulation.attack("a", "hall")).toBe(false);
    expect(simulation.getUnit("b")?.hitPoints).toBe(100);
    expect(simulation.getBuilding("hall")?.hitPoints).toBe(100);
  });

  test("clears an attack order aimed at an ally", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("a", "warden", "hold"),
        unit("b", "warden", "hold", { position: { x: 1, y: 0 } }),
      ],
    });

    simulation.enqueueCommand(
      { targetId: "b", type: "order_attack", unitIds: ["a"] },
      "player",
    );
    simulation.advanceTicks(5);

    expect(simulation.getUnit("a")?.order).toBeUndefined();
    expect(simulation.getUnit("b")?.hitPoints).toBe(100);
  });
});

describe("deterministic ordering", () => {
  test("compares ids by code unit rather than locale", () => {
    expect(compareIds("B", "a")).toBeLessThan(0);
    expect(compareIds("a", "B")).toBeGreaterThan(0);
    expect(compareIds("a", "a")).toBe(0);
  });
});

describe("target acquisition", () => {
  test("an idle unit engages an enemy in vision and walks back after", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("guard", "warden", "hold"),
        unit("intruder", "warden", "horde", {
          damage: 0,
          hitPoints: 1,
          position: { x: 6, y: 0 },
          speed: 0,
        }),
      ],
    });

    simulation.advanceTick();
    expect(simulation.getUnit("guard")?.order).toEqual({
      destination: { x: 0, y: 0 },
      targetId: "intruder",
      type: "attack_move",
    });

    simulation.advanceTicks(200);
    expect(simulation.getUnit("intruder")?.hitPoints).toBe(0);
    expect(simulation.getUnit("guard")?.position).toEqual({ x: 0, y: 0 });
    expect(simulation.getUnit("guard")?.order).toBeUndefined();
  });

  test("attack-move drops a target that outruns the leash", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("guard", "warden", "hold", { speed: 1 }),
        unit("runner", "warden", "horde", {
          damage: 0,
          position: { x: 5, y: 0 },
          speed: 10,
        }),
      ],
    });
    simulation.enqueueCommand(
      { type: "order_move", unitIds: ["runner"], x: 100, y: 0 },
      "horde",
    );

    simulation.advanceTick();
    expect(simulation.getUnit("guard")?.order).toMatchObject({
      targetId: "runner",
    });
    simulation.advanceTicks(20);
    expect(simulation.getUnit("guard")?.order).toEqual({
      destination: { x: 0, y: 0 },
      targetId: undefined,
      type: "attack_move",
    });

    simulation.advanceTicks(200);
    expect(simulation.getUnit("guard")?.position).toEqual({ x: 0, y: 0 });
  });

  test("attack-move falls back to enemy buildings, never friendly ones", () => {
    const simulation = new CombatSimulation({
      buildings: [
        building("own-wall", "hold", { position: { x: 2, y: 0 } }),
        building("enemy-wall", "horde", { position: { x: 5, y: 0 } }),
      ],
      units: [unit("breaker", "breaker", "hold")],
    });
    simulation.enqueueCommand(
      { type: "order_attack_move", unitIds: ["breaker"], x: 10, y: 0 },
      "player",
    );

    const events = simulation.advanceTicks(100);

    expect(events).toContainEqual({
      amount: 40,
      hitPoints: 60,
      kind: "building_damaged",
      sourceId: "breaker",
      targetId: "enemy-wall",
    });
    expect(simulation.getBuilding("own-wall")?.hitPoints).toBe(100);
  });
});

describe("Adept healing", () => {
  test("heals the most-injured ally below 70% instead of attacking", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("adept", "adept", "hold", { attackRange: 5 }),
        unit("hurt", "warden", "hold", {
          hitPoints: 50,
          position: { x: 1, y: 0 },
        }),
        unit("scratched", "warden", "hold", {
          hitPoints: 80,
          position: { x: 1, y: 1 },
        }),
      ],
    });

    const events = simulation.advanceTick();

    expect(events).toContainEqual({
      amount: 16,
      kind: "unit_healed",
      sourceId: "adept",
      unitId: "hurt",
    });
    expect(simulation.getUnit("hurt")?.hitPoints).toBe(66);
    expect(simulation.getUnit("scratched")?.hitPoints).toBe(80);
  });

  test("respects the per-simulation healing multiplier", () => {
    const simulation = new CombatSimulation({
      healingMultiplier: 0.5,
      units: [
        unit("adept", "adept", "hold", { attackRange: 5 }),
        unit("hurt", "warden", "hold", {
          hitPoints: 50,
          position: { x: 1, y: 0 },
        }),
      ],
    });

    simulation.advanceTick();

    expect(simulation.getUnit("hurt")?.hitPoints).toBe(58);
  });

  test("attacks normally when no ally needs healing", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("adept", "adept", "hold"),
        unit("enemy", "warden", "horde", {
          damage: 0,
          position: { x: 1, y: 0 },
        }),
      ],
    });

    expect(countAttacks(simulation.advanceTick(), "adept")).toBe(1);
  });
});

describe("event buffer", () => {
  test("advanceTick removes the events it returns", () => {
    const simulation = new CombatSimulation({
      units: [
        unit("a", "warden", "hold"),
        unit("b", "warden", "horde", { position: { x: 1, y: 0 } }),
      ],
    });

    simulation.applyDamage("a", "b", 10);
    expect(simulation.advanceTick().length).toBeGreaterThan(0);

    expect(simulation.drainEvents()).toEqual([
      { amount: 10, kind: "damage_applied", sourceId: "a", targetId: "b" },
    ]);
    simulation.advanceTick();
    expect(simulation.drainEvents()).toEqual([]);
  });
});
