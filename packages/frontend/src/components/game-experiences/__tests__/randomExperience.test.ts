import { describe, expect, test } from "bun:test";
import { pickRandomExperience } from "../randomExperience";

describe("pickRandomExperience", () => {
  const ids = ["descent", "crossword-crypt", "towers-of-coreborn"] as const;

  test("maps the random range across every game", () => {
    expect(pickRandomExperience(ids, () => 0)).toBe("descent");
    expect(pickRandomExperience(ids, () => 0.5)).toBe("crossword-crypt");
    expect(pickRandomExperience(ids, () => 0.999)).toBe("towers-of-coreborn");
  });

  test("stays in range and handles an empty list", () => {
    expect(pickRandomExperience(ids, () => 1)).toBe("towers-of-coreborn");
    expect(pickRandomExperience([], () => 0.3)).toBeNull();
  });
});
