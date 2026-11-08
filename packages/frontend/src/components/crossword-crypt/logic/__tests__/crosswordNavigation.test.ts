import { describe, expect, test } from "bun:test";
import {
  type CrosswordCryptGridCell,
  crosswordWordSpans,
} from "@resync-game-framework/api";
import { moveInGrid, stepInWord, wordAt } from "../crosswordNavigation";

// C A T      squares 0 1 2
// O # U      squares 3 . 4
// W E B      squares 5 6 7
const grid: CrosswordCryptGridCell[] = [
  { answerIndex: 0, column: 0, number: 1, row: 0 },
  { answerIndex: 1, column: 1, row: 0 },
  { answerIndex: 2, column: 2, number: 2, row: 0 },
  { answerIndex: 3, column: 0, row: 1 },
  { answerIndex: 4, column: 2, row: 1 },
  { answerIndex: 5, column: 0, number: 3, row: 2 },
  { answerIndex: 6, column: 1, row: 2 },
  { answerIndex: 7, column: 2, row: 2 },
];
const spans = crosswordWordSpans(grid);

describe("wordAt", () => {
  test("prefers the typing direction and falls back to the other", () => {
    expect(wordAt(spans, 0, "down")).toMatchObject({
      direction: "down",
      number: 1,
    });
    expect(wordAt(spans, 1, "down")).toMatchObject({
      direction: "across",
      number: 1,
    });
    expect(wordAt(spans, 4, "across")).toMatchObject({
      direction: "down",
      number: 2,
    });
  });
});

describe("stepInWord", () => {
  test("moves along the word and stops at its ends", () => {
    const across = wordAt(spans, 5, "across");
    if (!across) throw new Error("missing word");
    expect(stepInWord(across, 5, 1)).toBe(6);
    expect(stepInWord(across, 7, 1)).toBe(7);
    expect(stepInWord(across, 5, -1)).toBe(5);
  });
});

describe("moveInGrid", () => {
  test("jumps over stone squares and stops at the edge", () => {
    expect(moveInGrid(grid, 1, 1, 0)).toBe(6);
    expect(moveInGrid(grid, 3, 0, 1)).toBe(4);
    expect(moveInGrid(grid, 2, 0, 1)).toBe(2);
  });
});
