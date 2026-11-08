import { describe, expect, mock, test } from "bun:test";
import {
  type CrosswordCryptCommandResult,
  CrosswordCryptEventsDefinition,
  INITIAL_CROSSWORD_CRYPT_STATE,
  RoomEventsDefinition,
} from "@resync-game-framework/api";
import type { TypedSocketClient } from "src/websockets/types";
import { CrosswordCryptGateway } from "../crossword-crypt.gateway";
import type { CrosswordCryptStore } from "../crossword-crypt.store";

/** Builds one successful command result with two socket-targeted slices. */
function result(): CrosswordCryptCommandResult & {
  deliveries: Record<string, unknown>;
} {
  return {
    deliveries: {
      "socket-a": { content: ["A private clue"], playerId: "a" },
      "socket-b": { content: ["Another clue"], playerId: "b" },
    },
    ok: true,
    room: {
      createdAt: "2026-01-01T00:00:00.000Z",
      gameId: "crossword-crypt",
      gameState: INITIAL_CROSSWORD_CRYPT_STATE,
      hostPlayerId: "a",
      id: "ABC234",
      maxPlayers: 4,
      players: [],
      revision: 1,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

describe("CrosswordCryptGateway", () => {
  test("broadcasts only public state and targets each private slice", async () => {
    const start = mock(async () => result());
    const gateway = new CrosswordCryptGateway({
      start,
    } as unknown as CrosswordCryptStore);
    const emissions: Array<{
      channel: string;
      event: string;
      payload: unknown;
    }> = [];
    gateway.server = {
      to: (channel: string) => ({
        emit: (event: string, payload: unknown) =>
          emissions.push({ channel, event, payload }),
      }),
    } as never;

    await gateway.crosswordCryptStart({ roomId: "ABC234" }, {
      id: "socket-a",
    } as TypedSocketClient);

    expect(
      emissions.find(
        (item) =>
          item.event === RoomEventsDefinition.serverToClient.roomStateChanged,
      )?.channel,
    ).toBe("ABC234");
    const sliceEvents = emissions.filter(
      (item) =>
        item.event ===
        CrosswordCryptEventsDefinition.serverToClient.crosswordCryptSlice,
    );
    expect(sliceEvents.map((item) => item.channel).sort()).toEqual([
      "socket-a",
      "socket-b",
    ]);
    expect(JSON.stringify(emissions[0]?.payload)).not.toContain("private clue");
  });

  test("never adds a client-supplied key to the public snapshot", async () => {
    const guess = mock(async () => result());
    const gateway = new CrosswordCryptGateway({
      guess,
    } as unknown as CrosswordCryptStore);
    gateway.server = { to: () => ({ emit: () => undefined }) } as never;
    const forged = {
      answerKey: "FORGED",
      guess: "guess",
      roomId: "ABC234",
      roomToken: "token",
    };
    await gateway.crosswordCryptGuess(forged, {
      id: "socket-a",
    } as TypedSocketClient);
    expect(guess.mock.calls[0]).toEqual([forged, "socket-a"]);
    const snapshot = result();
    if (!snapshot.ok) throw new Error("Expected a successful test fixture.");
    expect(JSON.stringify(snapshot.room.gameState)).not.toContain("answerKey");
  });
});
