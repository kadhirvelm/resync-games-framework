import { describe, expect, test } from "bun:test";
import {
  cardTargeting,
  fallbackEffectText,
  scaleCardRules,
} from "../cardRules";

describe("cardTargeting", () => {
  test("damage needs an enemy, block alone needs an ally, the rest need nothing", () => {
    expect(
      cardTargeting({
        aetherCost: 1,
        effects: [{ amount: 4, kind: "attack", text: "" }],
        name: "a",
      }),
    ).toBe("enemy");
    expect(
      cardTargeting({
        aetherCost: 1,
        effects: [{ amount: 4, kind: "defend", text: "" }],
        name: "d",
      }),
    ).toBe("ally");
    expect(
      cardTargeting({
        aetherCost: 1,
        effects: [{ amount: 1, kind: "draw", text: "" }],
        name: "r",
      }),
    ).toBe("none");
    expect(
      cardTargeting({
        aetherCost: 1,
        effects: [{ amount: 6, chainsFrom: "defend", kind: "combo", text: "" }],
        name: "c",
      }),
    ).toBe("ally");
    expect(
      cardTargeting({
        aetherCost: 1,
        effects: [
          { amount: 4, kind: "defend", text: "" },
          { amount: 9, chainsFrom: "attack", kind: "combo", text: "" },
        ],
        name: "m",
      }),
    ).toBe("enemy");
  });
});

describe("fallbackEffectText", () => {
  test("writes rules text from the kind and amount", () => {
    expect(fallbackEffectText({ amount: 1, kind: "draw", text: "" })).toBe(
      "Draw 1 card.",
    );
    expect(
      fallbackEffectText({
        amount: 8,
        chainsFrom: "aether",
        kind: "combo",
        text: "",
      }),
    ).toBe("Combo (after aether): deal 8 damage.");
  });
});

describe("scaleCardRules", () => {
  test("raises damage and block but caps draw and Aether growth at one", () => {
    const scaled = scaleCardRules(
      {
        aetherCost: 1,
        effects: [
          { amount: 4, kind: "defend", text: "Grant 4 block." },
          { amount: 1, kind: "draw", text: "Draw 1 card." },
        ],
        name: "Mend",
      },
      2.2,
      "Mend IV",
    );
    expect(scaled.name).toBe("Mend IV");
    expect(scaled.effects.map((effect) => effect.amount)).toEqual([9, 2]);
    expect(scaled.effects[0]?.text).toBe("Grant 9 block.");
  });
});
