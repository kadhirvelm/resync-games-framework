import { describe, expect, test } from "bun:test";
import {
  applyCellUpdates,
  CROSSWORD_ENTRIES,
  type CrosswordCryptPlayer,
  type CrosswordCryptPublicState,
  crosswordGridGuess,
  crosswordWordSpans,
  dealRoom,
  emptyGridLetters,
  hiddenAnswerCells,
  INITIAL_CROSSWORD_CRYPT_STATE,
  redistribute,
  spendHint,
} from "@resync-game-framework/api";

const party: CrosswordCryptPlayer[] = [
  { difficulty: "standard", id: "one", name: "One" },
  { difficulty: "standard", id: "two", name: "Two" },
  { difficulty: "standard", id: "three", name: "Three" },
  { difficulty: "standard", id: "four", name: "Four" },
];

/**
 * Deals the first crossword room found for a party size.
 * @param size - Seated players
 * @returns A crossword deal
 */
function crosswordDeal(size: number) {
  for (let seed = 0; seed < 200; seed += 1) {
    for (let room = 0; room < 3; room += 1) {
      const deal = dealRoom(`seed-${seed}`, party.slice(0, size), room);
      if (deal.roomType === "crossword") return deal;
    }
  }
  throw new Error("No crossword deal found");
}

/**
 * @param deal - A crossword deal
 * @returns Every clue line in its private slices and whisper
 */
function dealtClueLines(deal: ReturnType<typeof dealRoom>): string[] {
  return [
    ...Object.values(deal.privateSlices).flatMap((slice) => slice.content),
    ...(deal.whisper ? [deal.whisper] : []),
  ];
}

/**
 * @param deal - A crossword deal
 * @returns Puzzle state with an empty shared grid
 */
function crosswordState(
  deal: ReturnType<typeof dealRoom>,
): CrosswordCryptPublicState {
  return {
    ...INITIAL_CROSSWORD_CRYPT_STATE,
    answerCells: hiddenAnswerCells(deal.answer),
    grid: deal.grid,
    gridLetters: emptyGridLetters(deal),
    phase: "room",
    roomType: "crossword",
  };
}

describe("crossword numbering", () => {
  test("numbers only squares that start a word, like a printed grid", () => {
    const deal = crosswordDeal(2);
    const numbers = deal.grid.flatMap((cell) =>
      cell.number === undefined ? [] : [cell.number],
    );
    const spans = crosswordWordSpans(deal.grid);
    expect(numbers).toEqual([1, 2, 3]);
    expect(spans.map((span) => `${span.number}${span.direction[0]}`)).toEqual([
      "1a",
      "1d",
      "2d",
      "3a",
    ]);
    expect(spans.every((span) => span.cells.length >= 3)).toBe(true);
  });
});

describe("crossword content", () => {
  test("has one clue per word and different words across and down", () => {
    for (const entry of CROSSWORD_ENTRIES) {
      const across = entry.grid.flatMap((row) =>
        row.split("#").filter((word) => word.length > 1),
      );
      const columns = entry.grid[0]?.length ?? 0;
      const down = Array.from({ length: columns }, (_, column) =>
        entry.grid.map((row) => row[column]).join(""),
      ).flatMap((column) =>
        column.split("#").filter((word) => word.length > 1),
      );
      expect(entry.across).toHaveLength(across.length);
      expect(entry.down).toHaveLength(down.length);
      expect(across.some((word) => down.includes(word))).toBe(false);
    }
  });
});

describe("crossword clue split", () => {
  test("two players hold across and down, and the table whispers one clue", () => {
    const deal = crosswordDeal(2);
    const slices = Object.values(deal.privateSlices);
    expect(slices.map((slice) => slice.role).sort()).toEqual([
      "across holder",
      "down holder",
    ]);
    expect(/^\d+ Down \(\d+\): /.test(deal.whisper ?? "")).toBe(true);
    expect(JSON.stringify(deal)).not.toContain("open square");
  });

  test("every party size deals each numbered clue exactly once", () => {
    for (const size of [2, 3, 4]) {
      const lines = dealtClueLines(crosswordDeal(size));
      expect(lines).toHaveLength(4);
      expect(new Set(lines).size).toBe(4);
      expect(
        lines.every((line) => /^\d+ (Across|Down) \(\d+\): /.test(line)),
      ).toBe(true);
    }
  });

  test("four players each get a clue and no assembler is needed", () => {
    const roles = Object.values(crosswordDeal(4).privateSlices).map(
      (slice) => slice.role,
    );
    expect(roles).toHaveLength(4);
    expect(roles).not.toContain("assembler");
  });

  test("a redeal after players leave keeps every clue", () => {
    const deal = crosswordDeal(4);
    const before = new Set(dealtClueLines(deal));
    const shrunk = redistribute(deal, party.slice(0, 2), 2);
    expect(new Set(dealtClueLines(shrunk))).toEqual(before);
    expect(Object.keys(shrunk.privateSlices)).toHaveLength(2);
    expect(shrunk.answer).toBe(deal.answer);
  });
});

describe("shared grid", () => {
  test("accepts single letters and ignores bad squares and hint-locked ones", () => {
    const deal = crosswordDeal(2);
    const hinted = spendHint(crosswordState(deal), deal.answer);
    const lockedIndex = hinted.answerCells.findIndex((cell) => cell.revealed);
    const next = applyCellUpdates(hinted, [
      { index: lockedIndex, letter: "Q" },
      { index: 1, letter: "b" },
      { index: 2, letter: "12" },
      { index: 500, letter: "A" },
    ]);
    expect(next.gridLetters[lockedIndex]).toBe("");
    expect(next.gridLetters[1]).toBe("B");
    expect(next.gridLetters[2]).toBe("");
    expect(applyCellUpdates(next, [{ index: 1, letter: "B" }])).toBe(next);
  });

  test("reads the grid as an answer only once every square is filled", () => {
    const deal = crosswordDeal(2);
    const state = crosswordState(deal);
    expect(crosswordGridGuess(state)).toBeNull();
    const full = applyCellUpdates(
      state,
      [...deal.answer].map((letter, index) => ({ index, letter })),
    );
    expect(crosswordGridGuess(full)).toBe(deal.answer);
  });

  test("hints skip squares the group already got right", () => {
    const deal = crosswordDeal(2);
    const typedFirst = applyCellUpdates(crosswordState(deal), [
      { index: 0, letter: deal.answer[0] ?? "" },
    ]);
    const hinted = spendHint(typedFirst, deal.answer);
    expect(hinted.answerCells[0]?.revealed).toBe(false);
    expect(hinted.answerCells[1]?.revealed).toBe(true);
  });
});
