import { describe, expect, test } from "bun:test";
import {
  completeTierCards,
  inferCorebornRole,
  synthesizeTierCards,
  tierHitPoints,
} from "../characterRoles";
import type { CardDefinition } from "../towerTypes";

describe("inferCorebornRole", () => {
  test("reads the role from the prompt's words", () => {
    expect(
      inferCorebornRole("A shield escort who guards the procession", 0),
    ).toBe("guardian");
    expect(
      inferCorebornRole("An agile scout with a copper bow and arrows", 0),
    ).toBe("striker");
    expect(
      inferCorebornRole("A caretaker who restores and heals the wounded", 0),
    ).toBe("mender");
  });

  test("rotates roles when the prompt names none", () => {
    expect(inferCorebornRole("A quiet figure", 0)).toBe("striker");
    expect(inferCorebornRole("A quiet figure", 1)).toBe("guardian");
  });
});

describe("synthesizeTierCards", () => {
  test("keeps cost and effect kinds while amounts rise each tier", () => {
    const cards = synthesizeTierCards("striker", "fox");
    expect(cards).toHaveLength(4);
    expect(new Set(cards.map((card) => card.rules.aetherCost)).size).toBe(1);
    const amounts = cards.map((card) => card.rules.effects[0]?.amount ?? 0);
    expect([...amounts].sort((left, right) => left - right)).toEqual(amounts);
    expect(amounts[3]).toBeGreaterThan(amounts[0] ?? 0);
  });
});

describe("completeTierCards", () => {
  const generated: CardDefinition = {
    id: "lantern-1",
    imageUrl: "https://example.test/lantern.webp",
    rules: {
      aetherCost: 2,
      effects: [{ amount: 8, kind: "attack", text: "Deal 8 damage." }],
      name: "Lantern Shot",
    },
  };

  test("keeps generated tiers and scales the nearest one into the gaps", () => {
    const cards = completeTierCards(
      [generated, undefined, undefined, undefined],
      "striker",
      "rook",
    );
    expect(cards[0]).toBe(generated);
    expect(cards[1]?.rules).toMatchObject({
      aetherCost: 2,
      name: "Lantern Shot +1",
    });
    expect(cards[1]?.rules.effects[0]?.amount).toBe(11);
    expect(cards[1]?.rules.effects[0]?.text).toBe("Deal 11 damage.");
    expect(cards[1]?.imageUrl).toBe(generated.imageUrl);
  });

  test("scales a higher tier down when no lower tier exists", () => {
    const cards = completeTierCards(
      [undefined, undefined, generated, undefined],
      "striker",
      "rook",
    );
    expect(cards[0]?.rules.effects[0]?.amount).toBeLessThan(8);
  });
});

describe("tierHitPoints", () => {
  test("adds health for each tier above 1", () => {
    expect(tierHitPoints(20, 1)).toBe(20);
    expect(tierHitPoints(20, 4)).toBe(44);
  });
});
