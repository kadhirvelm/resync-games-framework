import { describe, expect, test } from "bun:test";
import {
  ANAGRAM_ENTRIES,
  CROSSWORD_CRYPT_WORDS,
  CROSSWORD_ENTRIES,
  containsBlockedTerm,
  RIDDLE_ENTRIES,
} from "@resync-game-framework/api";

describe("Crossword Crypt curated content", () => {
  test("ships the planned bank sizes and exactly three riddle lines", () => {
    expect(CROSSWORD_CRYPT_WORDS).toHaveLength(74);
    expect(ANAGRAM_ENTRIES).toHaveLength(16);
    expect(RIDDLE_ENTRIES).toHaveLength(20);
    expect(CROSSWORD_ENTRIES).toHaveLength(12);
    expect(RIDDLE_ENTRIES.every((entry) => entry.lines.length === 3)).toBe(
      true,
    );
  });

  test("contains no blocked answer, clue, or riddle line", () => {
    const text = [
      ...CROSSWORD_CRYPT_WORDS.flatMap((entry) => [
        entry.answer,
        entry.clue,
        ...Object.values(entry.slices),
      ]),
      ...RIDDLE_ENTRIES.flatMap((entry) => [entry.answer, ...entry.lines]),
      ...CROSSWORD_ENTRIES.flatMap((entry) => [
        ...entry.across,
        ...entry.down,
        ...entry.grid,
      ]),
    ];
    expect(text.some(containsBlockedTerm)).toBe(false);
    expect(containsBlockedTerm("a planted shit clue")).toBe(true);
  });
});
