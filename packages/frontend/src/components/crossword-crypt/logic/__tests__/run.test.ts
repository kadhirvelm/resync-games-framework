import { describe, expect, test } from "bun:test";
import {
  applyGuess,
  type CrosswordCryptPlayer,
  type CrosswordCryptPublicState,
  dealRoom,
  hiddenAnswerCells,
  INITIAL_CROSSWORD_CRYPT_STATE,
  redistribute,
  spendHint,
} from "@resync-game-framework/api";

const players: CrosswordCryptPlayer[] = [
  { difficulty: "easy", id: "one", name: "One" },
  { difficulty: "standard", id: "two", name: "Two" },
  { difficulty: "standard", id: "three", name: "Three" },
];

describe("Crossword Crypt run rules", () => {
  test("deals stably and diverges across a set of seeds", () => {
    expect(dealRoom("same", players, 1)).toEqual(dealRoom("same", players, 1));
    const ids = new Set(
      ["one", "two", "three", "four"].map(
        (seed) => dealRoom(seed, players, 1).entryId,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  test("keeps the complete answer out of every private view", () => {
    const deal = dealRoom("private", players, 0);
    for (const slice of Object.values(deal.privateSlices)) {
      expect(JSON.stringify(slice)).not.toContain(deal.answer);
    }
  });

  test("uses two distinct private slices and a table whisper for two players", () => {
    const deal = dealRoom("duo", players.slice(0, 2), 2);
    const slices = Object.values(deal.privateSlices);
    expect(slices).toHaveLength(2);
    expect(slices[0]?.content).not.toEqual(slices[1]?.content);
    expect(deal.whisper).not.toBeNull();
  });

  test("burns one torch per miss and reaches zero on the fifth", () => {
    let state: CrosswordCryptPublicState = {
      ...INITIAL_CROSSWORD_CRYPT_STATE,
      phase: "room",
    };
    for (let attempt = 0; attempt < 5; attempt += 1)
      state = applyGuess(state, false);
    expect(state.torches).toBe(0);
    expect(applyGuess(INITIAL_CROSSWORD_CRYPT_STATE, true).torches).toBe(5);
  });

  test("reveals one new letter per hint and never repeats it", () => {
    const state = {
      ...INITIAL_CROSSWORD_CRYPT_STATE,
      answerCells: hiddenAnswerCells("MOON"),
    };
    const first = spendHint(state, "MOON");
    const second = spendHint(first, "MOON");
    expect(first.answerCells.filter((cell) => cell.revealed)).toHaveLength(1);
    expect(second.answerCells.filter((cell) => cell.revealed)).toHaveLength(2);
  });

  test("rotates assignments without changing the answer", () => {
    const deal = dealRoom("swap", players, 0);
    const swapped = redistribute(deal, players, 2);
    expect(swapped.answer).toBe(deal.answer);
    const ownersBefore = Object.fromEntries(
      Object.values(deal.privateSlices).map((slice) => [
        slice.playerId,
        slice.role,
      ]),
    );
    const ownersAfter = Object.fromEntries(
      Object.values(swapped.privateSlices).map((slice) => [
        slice.playerId,
        slice.role,
      ]),
    );
    expect(ownersAfter).not.toEqual(ownersBefore);
  });
});
