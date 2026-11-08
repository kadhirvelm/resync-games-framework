import { describe, expect, test } from "bun:test";
import {
  type CrosswordCryptPublicState,
  INITIAL_CROSSWORD_CRYPT_STATE,
} from "@resync-game-framework/api";
import {
  answerLengthLabel,
  guessFeedback,
  isPuzzlePhase,
  playerInitials,
  roleLabel,
  roomProgressLabel,
  startStatus,
} from "../presentation";

/**
 * @param overrides - Public fields to change
 * @returns A public state for one moment in a run
 */
function stateWith(
  overrides: Partial<CrosswordCryptPublicState>,
): CrosswordCryptPublicState {
  return { ...INITIAL_CROSSWORD_CRYPT_STATE, ...overrides };
}

describe("roomProgressLabel", () => {
  test("names the room and its place in the chain", () => {
    expect(
      roomProgressLabel(
        stateWith({ phase: "room", roomIndex: 0, roomType: "riddle" }),
      ),
    ).toBe("Riddle Door · Room 1 of 4");
    expect(
      roomProgressLabel(
        stateWith({ phase: "room", roomIndex: 2, roomType: "crossword" }),
      ),
    ).toBe("Split Crossword · Room 3 of 4");
  });

  test("covers the lobby, between rooms, the vault, and both endings", () => {
    expect(roomProgressLabel(stateWith({ phase: "lobby" }))).toBe(
      "Waiting to start",
    );
    expect(roomProgressLabel(stateWith({ phase: "relic", roomIndex: 1 }))).toBe(
      "Room 2 cleared",
    );
    expect(roomProgressLabel(stateWith({ phase: "vault" }))).toBe(
      "The Vault · final room",
    );
    expect(roomProgressLabel(stateWith({ phase: "escaped" }))).toBe("Escaped!");
    expect(roomProgressLabel(stateWith({ phase: "sealed" }))).toBe(
      "Sealed in the crypt",
    );
  });
});

describe("startStatus", () => {
  test("waits for a second player", () => {
    expect(startStatus(1)).toEqual({
      canStart: false,
      message: "Waiting for 1 more player",
    });
    expect(startStatus(0).message).toBe("Waiting for 2 more players");
  });

  test("allows two to four players", () => {
    expect(startStatus(2)).toEqual({
      canStart: true,
      message: "2 players ready",
    });
  });
});

describe("guessFeedback", () => {
  test("is empty before a guess and distinguishes hit, saved miss, and miss", () => {
    expect(guessFeedback(null)).toBeNull();
    expect(
      guessFeedback({ correct: true, protectedBySteadyFlame: false })?.tone,
    ).toBe("success");
    expect(
      guessFeedback({ correct: false, protectedBySteadyFlame: true })?.tone,
    ).toBe("saved");
    expect(
      guessFeedback({ correct: false, protectedBySteadyFlame: false })?.tone,
    ).toBe("miss");
  });
});

describe("small labels", () => {
  test("format lengths, roles, initials, and puzzle phases", () => {
    expect(
      answerLengthLabel([
        { index: 0, revealed: false },
        { index: 1, revealed: false },
      ]),
    ).toBe("2 letters");
    expect(answerLengthLabel([{ index: 0, revealed: false }])).toBe("1 letter");
    expect(roleLabel("across holder")).toBe("Across holder");
    expect(playerInitials("Ada Lovelace")).toBe("AL");
    expect(playerInitials("bo")).toBe("B");
    expect(playerInitials("  ")).toBe("?");
    expect(isPuzzlePhase("room")).toBe(true);
    expect(isPuzzlePhase("vault")).toBe(true);
    expect(isPuzzlePhase("relic")).toBe(false);
  });
});
