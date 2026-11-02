import { describe, expect, test } from "bun:test";
import { PLAYABLE_CARD_KINDS } from "@resync-game-framework/api";
import { playableCardEffectSchema } from "../playableCardTools";

describe("playableCardEffectSchema", () => {
  test("accepts each API kind and rejects a kind outside the toolkit", () => {
    for (const kind of PLAYABLE_CARD_KINDS) {
      const chainsFrom = kind === "combo" ? "attack" : "";
      const parsed = playableCardEffectSchema.safeParse({
        amount: 6,
        chainsFrom,
        kind,
        text: "Deal 6 damage to one enemy.",
      });
      expect(parsed.success).toBe(true);
    }

    expect(
      playableCardEffectSchema.safeParse({
        amount: 6,
        chainsFrom: "",
        kind: "poison",
        text: "Apply poison.",
      }).success,
    ).toBe(false);
  });
});
