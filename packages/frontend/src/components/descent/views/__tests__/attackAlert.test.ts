import { describe, expect, test } from "bun:test";
import type { CombatEvent } from "../../logic/combat/types";
import type { ResourceStockpile, SimSnapshot } from "../../logic/types";
import {
  ATTACK_ALERT_COOLDOWN_MS,
  type AttackAlertState,
  createAttackAlertState,
  updateAttackAlerts,
} from "../attackAlert";
import type { FxReadout } from "../presentation";

interface FixtureEntity {
  factionId?: "hold" | "horde";
  hp?: number;
  id: string;
  maxHp?: number;
  ownerId?: string;
  /** Boss area radius published in `meta.waves`. */
  splashRadius?: number;
  x: number;
  y: number;
}

interface FixtureOptions {
  buildings?: readonly FixtureEntity[];
  fx?: readonly FxReadout[];
  lastHitTick?: Readonly<Record<string, number>>;
  tick: number;
  units?: readonly FixtureEntity[];
}

const RESOURCES: ResourceStockpile = {
  coin: 0,
  essence: 0,
  food: 0,
  iron: 0,
  spirit_herbs: 0,
  stone: 0,
  water: 0,
  wood: 0,
};

/**
 * Builds a minimal published Ashen Gate snapshot.
 * @param options - Entities, effects, hit ticks, and sim tick
 * @returns Snapshot accepted by the alert reducer
 */
function snapshot(options: FixtureOptions): SimSnapshot {
  const units = options.units ?? [];
  const buildings = options.buildings ?? [];
  return {
    buildings: buildings.map((building) => ({
      buildingType: "camp",
      id: building.id,
      ...(building.ownerId === undefined ? {} : { ownerId: building.ownerId }),
      x: building.x,
      y: building.y,
    })),
    layerId: "ashen_gate",
    map: { height: 128, width: 128 },
    meta: {
      ashenGateSlice: { lastHitTick: options.lastHitTick ?? {} },
      ui: {
        buildings: Object.fromEntries(
          buildings.map((building) => [
            building.id,
            {
              factionId: building.factionId ?? "hold",
              hitPoints: building.hp ?? 100,
              maxHitPoints: building.maxHp ?? 100,
              ownerId: building.ownerId,
            },
          ]),
        ),
        fx: options.fx ?? [],
        units: Object.fromEntries(
          units.map((unit) => [
            unit.id,
            {
              factionId: unit.factionId ?? "hold",
              hitPoints: unit.hp ?? 100,
              maxHitPoints: unit.maxHp ?? 100,
              ownerId: unit.ownerId,
            },
          ]),
        ),
      },
      waves: {
        units: units.flatMap((unit) =>
          unit.splashRadius === undefined
            ? []
            : [{ aoeRadius: unit.splashRadius, id: unit.id }],
        ),
      },
    },
    paused: false,
    resources: RESOURCES,
    speed: 1,
    tick: options.tick,
    units: units.map((unit) => ({
      classId: "warden",
      id: unit.id,
      ...(unit.ownerId === undefined ? {} : { ownerId: unit.ownerId }),
      x: unit.x,
      y: unit.y,
    })),
  };
}

/**
 * Creates one published damage number.
 * @param id - Effect id
 * @param tick - Producing sim tick
 * @param x - Target x
 * @param y - Target y
 * @returns Damage effect
 */
function damage(id: number, tick: number, x: number, y: number): FxReadout {
  return { amount: 8, critical: false, id, kind: "damage", tick, x, y };
}

/**
 * Creates one published attack trace.
 * @param id - Effect id
 * @param tick - Producing sim tick
 * @param from - Attacker position
 * @param to - Target position
 * @returns Melee attack effect
 */
function attack(
  id: number,
  tick: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
): FxReadout {
  return { from, id, kind: "melee", tick, to };
}

/**
 * Advances the pure reducer with optional exact combat events.
 * @param state - Previous reducer state
 * @param current - Current snapshot
 * @param now - Wall-clock time
 * @param events - Exact combat events, when available
 * @param localPlayerId - Local co-op owner
 * @returns Reducer result
 */
function advance(
  state: AttackAlertState,
  current: SimSnapshot,
  now: number,
  events?: readonly CombatEvent[],
  localPlayerId?: string,
) {
  return updateAttackAlerts(state, {
    events,
    localPlayerId,
    now,
    snapshot: current,
  });
}

describe("attackAlert snapshot detection", () => {
  test("does not replay effects already present on the first snapshot", () => {
    const current = snapshot({
      fx: [damage(1, 0, 4, 4)],
      lastHitTick: { defender: 0 },
      tick: 1,
      units: [{ hp: 90, id: "defender", x: 4, y: 4 }],
    });
    const result = updateAttackAlerts(createAttackAlertState(), {
      now: 100,
      snapshot: current,
    });
    expect(result.alerts).toEqual([]);
  });

  test("alerts at a locally owned unit hit by enemy combat damage", () => {
    const before = snapshot({
      tick: 1,
      units: [{ hp: 100, id: "defender", x: 4, y: 4 }],
    });
    const after = snapshot({
      fx: [damage(1, 1, 4, 4)],
      lastHitTick: { defender: 1 },
      tick: 2,
      units: [{ hp: 92, id: "defender", x: 4, y: 4 }],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    const result = advance(initial.state, after, 200);

    expect(result.alerts).toEqual([
      {
        id: "fx:1",
        severity: "warning",
        targetId: "defender",
        targetKind: "unit",
        worldPosition: { x: 4, y: 4 },
      },
    ]);
  });

  test("ignores vent-only damage and another co-op player's damage", () => {
    const before = snapshot({
      tick: 1,
      units: [{ hp: 100, id: "ally", ownerId: "p2", x: 4, y: 4 }],
    });
    const vent = snapshot({
      lastHitTick: { ally: 1 },
      tick: 2,
      units: [{ hp: 92, id: "ally", ownerId: "p2", x: 4, y: 4 }],
    });
    const initial = advance(createAttackAlertState(), before, 100, [], "p1");
    const noVentAlert = advance(initial.state, vent, 200, undefined, "p1");
    expect(noVentAlert.alerts).toEqual([]);

    const alliedHit = snapshot({
      fx: [damage(1, 2, 4, 4)],
      lastHitTick: { ally: 2 },
      tick: 3,
      units: [{ hp: 84, id: "ally", ownerId: "p2", x: 4, y: 4 }],
    });
    const noAllyAlert = advance(
      noVentAlert.state,
      alliedHit,
      300,
      undefined,
      "p1",
    );
    expect(noAllyAlert.alerts).toEqual([]);
  });

  test("attributes direct building damage to a hostile attack effect", () => {
    const camp = { hp: 300, id: "camp", maxHp: 300, x: 10, y: 10 };
    const enemy = {
      factionId: "horde" as const,
      id: "imp",
      x: 12,
      y: 10,
    };
    const before = snapshot({ buildings: [camp], tick: 5, units: [enemy] });
    const after = snapshot({
      buildings: [{ ...camp, hp: 292 }],
      fx: [attack(2, 5, enemy, camp)],
      tick: 6,
      units: [enemy],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    const result = advance(initial.state, after, 200);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      severity: "critical",
      targetId: "camp",
      targetKind: "building",
      worldPosition: { x: 10, y: 10 },
    });
  });

  test("does not infer enemy building damage from a Hold attack", () => {
    const camp = { hp: 300, id: "camp", maxHp: 300, x: 10, y: 10 };
    const hold = { id: "warden", x: 12, y: 10 };
    const before = snapshot({ buildings: [camp], tick: 5, units: [hold] });
    const after = snapshot({
      buildings: [{ ...camp, hp: 292 }],
      fx: [attack(2, 5, hold, camp)],
      tick: 6,
      units: [hold],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    expect(advance(initial.state, after, 200).alerts).toEqual([]);
  });

  test("retains a lethal direct building hit", () => {
    const camp = { hp: 8, id: "camp", maxHp: 300, x: 10, y: 10 };
    const enemy = {
      factionId: "horde" as const,
      id: "imp",
      x: 12,
      y: 10,
    };
    const before = snapshot({ buildings: [camp], tick: 5, units: [enemy] });
    const after = snapshot({
      buildings: [],
      fx: [attack(3, 5, enemy, camp)],
      tick: 6,
      units: [enemy],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    const result = advance(initial.state, after, 200);
    expect(result.alerts[0]).toMatchObject({
      severity: "critical",
      targetId: "camp",
      targetKind: "building",
      worldPosition: { x: 10, y: 10 },
    });
  });

  test("detects later boss splash in a multi-tick advance", () => {
    const boss = {
      factionId: "horde" as const,
      id: "cinderjaw",
      splashRadius: 3.5,
      x: 6,
      y: 4,
    };
    const ally = { hp: 100, id: "ally", ownerId: "p2", x: 4, y: 4 };
    const defender = { hp: 100, id: "defender", ownerId: "p1", x: 6, y: 4 };
    const before = snapshot({ tick: 10, units: [boss, ally, defender] });
    const after = snapshot({
      fx: [damage(1, 12, 4, 4), attack(2, 12, boss, ally)],
      lastHitTick: { ally: 12, defender: 12 },
      tick: 13,
      units: [boss, { ...ally, hp: 92 }, { ...defender, hp: 75 }],
    });
    const initial = advance(createAttackAlertState(), before, 100, [], "p1");
    const result = advance(initial.state, after, 200, undefined, "p1");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      id: "splash:defender:12",
      targetId: "defender",
      worldPosition: { x: 6, y: 4 },
    });
  });

  test("accepts the oldest attack FX retained by a post-increment snapshot", () => {
    const camp = { hp: 300, id: "camp", maxHp: 300, x: 10, y: 10 };
    const enemy = {
      factionId: "horde" as const,
      id: "imp",
      x: 12,
      y: 10,
    };
    const before = snapshot({ buildings: [camp], tick: 10, units: [enemy] });
    const after = snapshot({
      buildings: [{ ...camp, hp: 292 }],
      fx: [attack(3, 11, enemy, camp)],
      tick: 28,
      units: [enemy],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    const result = advance(initial.state, after, 200);
    expect(result.alerts.map((alert) => alert.targetId)).toEqual(["camp"]);
  });

  test("retains a lethal hit position and marks it critical", () => {
    const before = snapshot({
      tick: 1,
      units: [{ hp: 5, id: "defender", maxHp: 100, x: 8, y: 9 }],
    });
    const after = snapshot({
      fx: [damage(1, 1, 8, 9)],
      tick: 2,
      units: [],
    });
    const initial = advance(createAttackAlertState(), before, 100);
    const result = advance(initial.state, after, 200);
    expect(result.alerts[0]).toMatchObject({
      severity: "critical",
      targetId: "defender",
      worldPosition: { x: 8, y: 9 },
    });
  });
});

describe("attackAlert event detection and rate limiting", () => {
  test("accepts exact enemy events and rejects friendly fire", () => {
    const entities = [
      { id: "defender", x: 4, y: 4 },
      { factionId: "horde" as const, id: "imp", x: 6, y: 4 },
    ];
    const before = snapshot({ tick: 1, units: entities });
    const after = snapshot({ tick: 2, units: entities });
    const initial = advance(createAttackAlertState(), before, 100);
    const enemyHit = advance(initial.state, after, 200, [
      {
        amount: 8,
        kind: "damage_applied",
        sourceId: "imp",
        targetId: "defender",
      },
    ]);
    expect(enemyHit.alerts).toHaveLength(1);

    const friendlyHit = advance(createAttackAlertState(), before, 100);
    const rejected = advance(friendlyHit.state, after, 200, [
      {
        amount: 8,
        kind: "damage_applied",
        sourceId: "defender",
        targetId: "defender",
      },
    ]);
    expect(rejected.alerts).toEqual([]);
  });

  test("allows one alert per region per eight seconds but not one global alert", () => {
    let state = createAttackAlertState();
    state = advance(
      state,
      snapshot({
        tick: 1,
        units: [
          { hp: 100, id: "near", x: 4, y: 4 },
          { hp: 100, id: "far", x: 40, y: 4 },
        ],
      }),
      100,
    ).state;
    const first = advance(
      state,
      snapshot({
        fx: [damage(1, 1, 4, 4), damage(2, 1, 40, 4)],
        lastHitTick: { far: 1, near: 1 },
        tick: 2,
        units: [
          { hp: 92, id: "near", x: 4, y: 4 },
          { hp: 92, id: "far", x: 40, y: 4 },
        ],
      }),
      1_000,
    );
    expect(first.alerts.map((alert) => alert.targetId).sort()).toEqual([
      "far",
      "near",
    ]);

    const suppressed = advance(
      first.state,
      snapshot({
        fx: [damage(3, 2, 4, 4)],
        lastHitTick: { near: 2 },
        tick: 3,
        units: [
          { hp: 84, id: "near", x: 4, y: 4 },
          { hp: 92, id: "far", x: 40, y: 4 },
        ],
      }),
      2_000,
    );
    expect(suppressed.alerts).toEqual([]);

    const allowed = advance(
      suppressed.state,
      snapshot({
        fx: [damage(4, 3, 4, 4)],
        lastHitTick: { near: 3 },
        tick: 4,
        units: [
          { hp: 76, id: "near", x: 4, y: 4 },
          { hp: 92, id: "far", x: 40, y: 4 },
        ],
      }),
      1_000 + ATTACK_ALERT_COOLDOWN_MS,
    );
    expect(allowed.alerts.map((alert) => alert.targetId)).toEqual(["near"]);
  });
});
