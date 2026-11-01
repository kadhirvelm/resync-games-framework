import { describe, expect, test } from "bun:test";
import { OWNER_COLORS, partyAccentIndex } from "../ownerColors";

describe("partyAccentIndex", () => {
  test("the cultivator is always jade wherever it stands", () => {
    const party = [
      { isCultivator: false },
      { isCultivator: false },
      { isCultivator: true },
    ];
    expect(partyAccentIndex(party, 2)).toBe(0);
    expect(partyAccentIndex([{ isCultivator: true }], 0)).toBe(0);
  });

  test("Coreborn take the remaining colors in party order", () => {
    const party = [
      { isCultivator: false },
      { isCultivator: true },
      { isCultivator: false },
    ];
    expect(partyAccentIndex(party, 0)).toBe(1);
    expect(partyAccentIndex(party, 2)).toBe(2);
  });

  test("colors wrap without reusing the cultivator's jade", () => {
    const party = Array.from({ length: OWNER_COLORS.length + 1 }, () => ({
      isCultivator: false,
    }));
    expect(partyAccentIndex(party, OWNER_COLORS.length - 1)).toBe(1);
  });
});
