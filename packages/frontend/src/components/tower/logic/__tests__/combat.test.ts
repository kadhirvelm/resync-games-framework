import { describe, expect, test } from "bun:test";
import type { PlayableCardRules } from "@towers-of-coreborn/api";
import {
  type CombatCard,
  type CombatSetup,
  type CombatState,
  createCombat,
  endTurn,
  enemyIntent,
  incomingDamage,
  playCard,
  TURN_DRAW,
} from "../combat";
import type { EnemyMove, EnemySpawn } from "../towerTypes";

/**
 * @param instanceId - Card instance id
 * @param rules - Cost and effects
 * @param ownerId - Party member who brings it
 * @returns A card with no art
 */
function card(
  instanceId: string,
  rules: PlayableCardRules,
  ownerId = "cultivator",
): CombatCard {
  return { definition: { id: instanceId, rules }, instanceId, ownerId };
}

const STRIKE: PlayableCardRules = {
  aetherCost: 1,
  effects: [{ amount: 6, kind: "attack", text: "Deal 6 damage." }],
  name: "Strike",
};
const GUARD: PlayableCardRules = {
  aetherCost: 1,
  effects: [{ amount: 5, kind: "defend", text: "Grant 5 block." }],
  name: "Guard",
};

/**
 * @param id - Spawn id
 * @param moves - Cycle
 * @param maxHitPoints - Health
 * @returns An enemy spawn
 */
function enemy(id: string, moves: EnemyMove[], maxHitPoints = 30): EnemySpawn {
  return {
    description: "",
    id,
    isBoss: false,
    maxHitPoints,
    moves,
    name: id,
    templateId: id,
  };
}

const BITE: EnemyMove = {
  amount: 4,
  kind: "attack",
  target: "front",
  text: "Bite",
};

/**
 * @param overrides - Fields to replace on the default setup
 * @returns A setup with the cultivator at the back behind one Coreborn
 */
function setup(overrides: Partial<CombatSetup> = {}): CombatSetup {
  return {
    aetherPerTurn: 3,
    cards: Array.from({ length: 6 }, (_, index) =>
      card(`strike-${index}`, STRIKE),
    ),
    enemies: [enemy("left", [BITE]), enemy("right", [BITE])],
    party: [
      {
        block: 0,
        hitPoints: 20,
        id: "coreborn-1",
        isCultivator: false,
        maxHitPoints: 20,
        name: "Fox",
        tier: 1,
      },
      {
        block: 0,
        hitPoints: 40,
        id: "cultivator",
        isCultivator: true,
        maxHitPoints: 40,
        name: "You",
        tier: 1,
      },
    ],
    randomState: 7,
    ...overrides,
  };
}

/**
 * @param state - Battle
 * @param hand - Cards to put in hand, replacing it
 * @returns The battle with that hand
 */
function withHand(state: CombatState, hand: CombatCard[]): CombatState {
  return { ...state, hand };
}

describe("createCombat", () => {
  test("opens turn 1 with full Aether and a five card hand", () => {
    const { events, state } = createCombat(setup());
    expect(state.turn).toBe(1);
    expect(state.aether).toBe(3);
    expect(state.hand).toHaveLength(TURN_DRAW);
    expect(state.drawPile).toHaveLength(1);
    expect(events.map((event) => event.kind)).toEqual(["turn-start", "draw"]);
  });
});

describe("playCard", () => {
  test("asks for a target when two enemies are alive", () => {
    const state = createCombat(setup()).state;
    const result = playCard(state, state.hand[0]?.instanceId ?? "");
    expect(result).toEqual({ ok: false, reason: "needs-target" });
  });

  test("aims at the only living enemy without asking", () => {
    const state = createCombat(
      setup({ enemies: [enemy("solo", [BITE])] }),
    ).state;
    const result = playCard(state, state.hand[0]?.instanceId ?? "");
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.step.state.enemies[0]?.hitPoints).toBe(24);
    expect(result.step.state.aether).toBe(2);
    expect(result.step.state.discardPile).toHaveLength(1);
  });

  test("spends enemy block before health", () => {
    const base = createCombat(setup()).state;
    const state = {
      ...base,
      enemies: base.enemies.map((entry) => ({ ...entry, block: 4 })),
    };
    const result = playCard(state, state.hand[0]?.instanceId ?? "", "right");
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.step.state.enemies[1]).toMatchObject({
      block: 0,
      hitPoints: 28,
    });
  });

  test("gives defend block to the chosen ally", () => {
    const state = withHand(createCombat(setup()).state, [card("guard", GUARD)]);
    const result = playCard(state, "guard", "cultivator");
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.step.state.party[1]?.block).toBe(5);
    expect(result.step.state.party[0]?.block).toBe(0);
  });

  test("refuses a card the party cannot pay for", () => {
    const state = {
      ...withHand(createCombat(setup()).state, [card("guard", GUARD)]),
      aether: 0,
    };
    expect(playCard(state, "guard", "cultivator")).toEqual({
      ok: false,
      reason: "not-enough-aether",
    });
  });

  test("resolves a combo only after its chained kind was played this turn", () => {
    const combo = card("combo", {
      aetherCost: 0,
      effects: [
        { amount: 10, chainsFrom: "attack", kind: "combo", text: "Combo" },
      ],
      name: "Echo",
    });
    const opening = withHand(createCombat(setup()).state, [
      combo,
      card("strike", STRIKE),
    ]);
    const fizzled = playCard(opening, "combo", "left");
    if (!fizzled.ok) {
      throw new Error(fizzled.reason);
    }
    expect(fizzled.step.state.enemies[0]?.hitPoints).toBe(30);
    expect(fizzled.step.events).toContainEqual({
      kind: "combo",
      triggered: false,
    });

    const struck = playCard(opening, "strike", "left");
    if (!struck.ok) {
      throw new Error(struck.reason);
    }
    const chained = playCard(struck.step.state, "combo", "left");
    if (!chained.ok) {
      throw new Error(chained.reason);
    }
    expect(chained.step.state.enemies[0]?.hitPoints).toBe(14);
  });

  test("wins when the last enemy falls", () => {
    const state = createCombat(
      setup({ enemies: [enemy("solo", [BITE], 5)] }),
    ).state;
    const result = playCard(state, state.hand[0]?.instanceId ?? "");
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.step.state.phase).toBe("victory");
  });
});

describe("endTurn", () => {
  test("enemies act right to left, then a new turn refills Aether and clears party block", () => {
    const state = { ...createCombat(setup()).state, aether: 0 };
    const guarded = {
      ...state,
      party: state.party.map((unit) => ({ ...unit, block: 2 })),
    };
    const steps = endTurn(guarded);
    const actors = steps.flatMap((step) =>
      step.events.flatMap((event) =>
        event.kind === "enemy-move" ? [event.enemyId] : [],
      ),
    );
    expect(actors).toEqual(["right", "left"]);
    const last = steps[steps.length - 1]?.state as CombatState;
    expect(last.turn).toBe(2);
    expect(last.aether).toBe(3);
    expect(last.party.every((unit) => unit.block === 0)).toBe(true);
    // 2 block absorbs part of the first bite; the second bite lands in full.
    expect(last.party[0]?.hitPoints).toBe(20 - 2 - 4);
  });

  test("advances each enemy to the next move in its cycle", () => {
    const guard: EnemyMove = {
      amount: 6,
      kind: "defend",
      target: "front",
      text: "Shell",
    };
    const state = createCombat(
      setup({ enemies: [enemy("solo", [BITE, guard])] }),
    ).state;
    const after = endTurn(state).at(-1)?.state as CombatState;
    expect(
      enemyIntent(after.enemies[0] as CombatState["enemies"][number]),
    ).toEqual(guard);
  });

  test("back and all attacks reach past the front", () => {
    const reach: EnemyMove = {
      amount: 5,
      kind: "attack",
      target: "back",
      text: "Lunge",
    };
    const sweep: EnemyMove = {
      amount: 3,
      kind: "attack",
      target: "all",
      text: "Sweep",
    };
    const state = createCombat(
      setup({ enemies: [enemy("a", [reach]), enemy("b", [sweep])] }),
    ).state;
    expect(Object.fromEntries(incomingDamage(state))).toEqual({
      "coreborn-1": 3,
      cultivator: 8,
    });
    const after = endTurn(state).at(-1)?.state as CombatState;
    expect(after.party.map((unit) => unit.hitPoints)).toEqual([17, 32]);
  });

  test("a fallen Coreborn takes its cards out of every pile", () => {
    const crush: EnemyMove = {
      amount: 50,
      kind: "attack",
      target: "front",
      text: "Crush",
    };
    const cards = [
      card("fox-1", STRIKE, "coreborn-1"),
      card("fox-2", STRIKE, "coreborn-1"),
      ...Array.from({ length: 6 }, (_, index) => card(`mine-${index}`, STRIKE)),
    ];
    const state = createCombat(
      setup({ cards, enemies: [enemy("solo", [crush])] }),
    ).state;
    const steps = endTurn(state);
    const death = steps
      .flatMap((step) => step.events)
      .find((event) => event.kind === "death");
    expect(death).toEqual({
      cardsRemoved: 2,
      kind: "death",
      unitId: "coreborn-1",
    });
    const after = steps.at(-1)?.state as CombatState;
    const remaining = [...after.drawPile, ...after.discardPile, ...after.hand];
    expect(remaining.some((entry) => entry.ownerId === "coreborn-1")).toBe(
      false,
    );
    expect(after.phase).toBe("player");
  });

  test("losing the cultivator ends the battle in defeat", () => {
    const crush: EnemyMove = {
      amount: 99,
      kind: "attack",
      target: "all",
      text: "Quake",
    };
    const state = createCombat(
      setup({ enemies: [enemy("solo", [crush])] }),
    ).state;
    const steps = endTurn(state);
    expect(steps.at(-1)?.state.phase).toBe("defeat");
  });

  test("shuffles the discard pile back in when the draw pile runs out", () => {
    const state = createCombat(setup()).state;
    const steps = endTurn(state);
    const opening = steps.at(-1) as (typeof steps)[number];
    expect(opening.events.some((event) => event.kind === "shuffle")).toBe(true);
    expect(opening.state.hand).toHaveLength(TURN_DRAW);
  });
});
