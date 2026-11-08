import { describe, expect, test } from "bun:test";
import {
  ANAGRAM_ENTRIES,
  CROSSWORD_CRYPT_RUN_SETTINGS,
  CROSSWORD_CRYPT_WORDS,
  CROSSWORD_ENTRIES,
  type CrosswordCryptDifficulty,
  type CrosswordCryptPlayer,
  crosswordWordSpans,
  dealRoom,
  dealVault,
  RIDDLE_ENTRIES,
  roomDifficulty,
} from "@resync-game-framework/api";
import { roomLevelSummary } from "../presentation";

/**
 * @param difficulties - One choice per seated player
 * @returns Players with those choices
 */
function partyOf(
  ...difficulties: CrosswordCryptDifficulty[]
): CrosswordCryptPlayer[] {
  return difficulties.map((difficulty, index) => ({
    difficulty,
    id: `p${index}`,
    name: `Player ${index}`,
  }));
}

const expertIds = new Set(
  [
    ...ANAGRAM_ENTRIES,
    ...RIDDLE_ENTRIES,
    ...CROSSWORD_ENTRIES,
    ...CROSSWORD_CRYPT_WORDS,
  ]
    .filter((entry) => entry.difficulty === "expert")
    .map((entry) => entry.id),
);

describe("room difficulty", () => {
  test("plays at the easiest level anyone picked", () => {
    expect(roomDifficulty(partyOf("expert", "expert"))).toBe("expert");
    expect(roomDifficulty(partyOf("expert", "standard"))).toBe("standard");
    expect(roomDifficulty(partyOf("expert", "standard", "easy"))).toBe("easy");
  });

  test("expert runs have fewer torches and hints", () => {
    expect(CROSSWORD_CRYPT_RUN_SETTINGS.expert).toEqual({
      hints: 1,
      torches: 3,
    });
    expect(CROSSWORD_CRYPT_RUN_SETTINGS.standard).toEqual({
      hints: 2,
      torches: 5,
    });
    expect(roomLevelSummary(["expert", "expert"])).toBe(
      "Room plays at Expert · 3 torches, 1 hint",
    );
    expect(roomLevelSummary(["expert", "easy"])).toBe(
      "Room plays at Easy · 5 torches, 2 hints",
    );
  });
});

describe("expert content", () => {
  test("expert rooms and vaults deal only expert content", () => {
    const party = partyOf("expert", "expert", "expert");
    for (let seed = 0; seed < 30; seed += 1) {
      for (let room = 0; room < 4; room += 1) {
        expect(expertIds.has(dealRoom(`x${seed}`, party, room).entryId)).toBe(
          true,
        );
      }
      expect(expertIds.has(dealVault(`x${seed}`, party).entryId)).toBe(true);
    }
  });

  test("standard rooms never deal expert content", () => {
    const party = partyOf("standard", "standard");
    for (let seed = 0; seed < 30; seed += 1) {
      for (let room = 0; room < 4; room += 1) {
        expect(expertIds.has(dealRoom(`s${seed}`, party, room).entryId)).toBe(
          false,
        );
      }
    }
  });

  test("expert crosswords are 5×5 grids of six five-letter words", () => {
    for (const entry of CROSSWORD_ENTRIES.filter(
      (candidate) => candidate.difficulty === "expert",
    )) {
      const letters = entry.grid.join("").replaceAll("#", "");
      expect(entry.grid).toHaveLength(5);
      expect(letters).toHaveLength(21);
      expect(entry.across).toHaveLength(3);
      expect(entry.down).toHaveLength(3);
    }
  });

  test("an expert crossword deals all six numbered clues exactly once", () => {
    const party = partyOf("expert", "expert");
    for (let seed = 0; seed < 60; seed += 1) {
      for (let room = 0; room < 3; room += 1) {
        const deal = dealRoom(`c${seed}`, party, room);
        if (deal.roomType !== "crossword") continue;
        const lines = [
          ...Object.values(deal.privateSlices).flatMap(
            (slice) => slice.content,
          ),
          ...(deal.whisper ? [deal.whisper] : []),
        ];
        expect(new Set(lines).size).toBe(6);
        expect(crosswordWordSpans(deal.grid)).toHaveLength(6);
        return;
      }
    }
    throw new Error("No expert crossword dealt");
  });

  test("expert anagrams and vault words are long", () => {
    const anagrams = ANAGRAM_ENTRIES.filter(
      (entry) => entry.difficulty === "expert",
    );
    expect(anagrams).toHaveLength(8);
    expect(anagrams.every((entry) => entry.answer.length >= 9)).toBe(true);
    const vaultWords = CROSSWORD_CRYPT_WORDS.filter(
      (entry) => entry.difficulty === "expert",
    );
    expect(vaultWords.every((entry) => entry.answer.length >= 9)).toBe(true);
    expect(
      vaultWords.every((entry) => !entry.slices.letters.includes("begins")),
    ).toBe(true);
  });
});

describe("anagram tiles", () => {
  test("reading the split tiles in turn never spells the answer", () => {
    for (const entry of ANAGRAM_ENTRIES) {
      for (const count of [2, 3, 4] as const) {
        const parts = entry.splits[count].map((part) => part.split(" "));
        const longest = Math.max(...parts.map((part) => part.length));
        const roundRobin = Array.from({ length: longest }, (_, index) =>
          parts.map((part) => part[index] ?? "").join(""),
        ).join("");
        expect(roundRobin).not.toBe(entry.answer);
        expect([...parts.flat()].sort().join("")).toBe(
          [...entry.answer].sort().join(""),
        );
      }
    }
  });
});
