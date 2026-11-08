import { describe, expect, test } from "bun:test";
import {
  type CrosswordCryptCommandResult,
  type CrosswordCryptDeal,
  type CrosswordCryptGuessPayload,
  type CrosswordCryptPublicState,
  type GameRoomState,
  INITIAL_CROSSWORD_CRYPT_STATE,
} from "@resync-game-framework/api";
import type {
  GameRoomServerDecision,
  GameRoomServerMember,
  GameRoomServerResult,
  GameRoomStore,
} from "../../game-room/game-room.store";
import type { RedisService } from "../../infra/redis/redis.service";
import { CrosswordCryptStore } from "../crossword-crypt.store";

/** Creates a real game store around deterministic in-memory room and Redis fakes. */
function createStore() {
  const values = new Map<string, string>();
  let room: GameRoomState = {
    createdAt: "2026-01-01T00:00:00.000Z",
    gameId: "crossword-crypt",
    gameState: INITIAL_CROSSWORD_CRYPT_STATE as never,
    hostPlayerId: "one",
    id: "ABC234",
    maxPlayers: 4,
    players: [
      { id: "one", joinedAt: "2026-01-01T00:00:00.000Z", name: "One" },
      { id: "two", joinedAt: "2026-01-01T00:00:00.000Z", name: "Two" },
    ],
    revision: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const members: GameRoomServerMember[] = room.players.map((player) => ({
    ...player,
    socketId: `socket-${player.id}`,
  }));
  const gameRoomStore = {
    mutateServerRoom: async <T>(
      _roomId: unknown,
      _gameId: string,
      _socketId: string,
      apply: (
        snapshot: GameRoomState,
        playerId: string,
        seated: readonly GameRoomServerMember[],
      ) => Promise<GameRoomServerDecision<T>>,
    ): Promise<GameRoomServerResult<T>> => {
      const decision = await apply(room, "one", members);
      if (!decision.ok) {
        return {
          result: {
            error: { code: decision.code, message: decision.message },
            ok: false,
            room,
          },
        };
      }
      room = {
        ...room,
        gameState: decision.gameState,
        revision: room.revision + 1,
      };
      return {
        members,
        playerId: "one",
        result: { ok: true, room },
        value: decision.value,
      };
    },
  } as GameRoomStore;
  const redis = {
    get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => {
      values.set(key, value);
      return "OK";
    },
  } as unknown as RedisService;
  return {
    getRoom: () => room,
    /** Reads the server-only deal, which a real client can never see. */
    secretDeal: () =>
      (
        JSON.parse(
          values.get("crossword-crypt:room:ABC234:secret") ?? "{}",
        ) as {
          deal: CrosswordCryptDeal;
        }
      ).deal,
    store: new CrosswordCryptStore(gameRoomStore, redis),
  };
}

/**
 * @param result - Store acknowledgement
 * @returns The public state, or throws when the command failed
 */
function stateOf(
  result: CrosswordCryptCommandResult,
): CrosswordCryptPublicState {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}`);
  return result.room.gameState;
}

/**
 * Starts runs until the first room is a crossword (seeds are random).
 * @param fixture - Store fixture
 * @returns The crossword room's public state
 */
async function startCrossword(fixture: ReturnType<typeof createStore>) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const state = stateOf(
      await fixture.store.start({ roomId: "ABC234" }, "socket-one"),
    );
    if (state.roomType === "crossword") return state;
  }
  throw new Error("No crossword room was dealt in 60 starts");
}

describe("CrosswordCryptStore", () => {
  test("ignores a forged client answer key and burns a torch for a miss", async () => {
    const fixture = createStore();
    const started = await fixture.store.start(
      { roomId: "ABC234" },
      "socket-one",
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    if (started.room.gameState.roomType === "crossword") {
      await fixture.store.fillCells(
        {
          cells: started.room.gameState.gridLetters.map((_, index) => ({
            index,
            letter: "Z",
          })),
          roomId: "ABC234",
          roomToken: started.room.gameState.roomToken ?? "",
        },
        "socket-one",
      );
    }

    const result = await fixture.store.guess(
      {
        answerKey: "DEFINITELYWRONG",
        guess: "DEFINITELYWRONG",
        roomId: "ABC234",
        roomToken: started.room.gameState.roomToken ?? "",
      } as CrosswordCryptGuessPayload,
      "socket-one",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.room.gameState.torches).toBe(4);
    expect(JSON.stringify(fixture.getRoom().gameState)).not.toContain(
      '"answerKey"',
    );
    expect(JSON.stringify(fixture.getRoom().gameState)).not.toContain(
      '"answer":',
    );
  });

  test("keeps the public snapshot comfortably below the room limit", async () => {
    const fixture = createStore();
    const result = await fixture.store.start(
      { roomId: "ABC234" },
      "socket-one",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      Buffer.byteLength(JSON.stringify(result.room.gameState)),
    ).toBeLessThan(64 * 1024);
  });

  test("stores typed squares and checks the shared crossword grid", async () => {
    const fixture = createStore();
    const room = await startCrossword(fixture);
    const roomToken = room.roomToken ?? "";
    const answer = fixture.secretDeal().answer;
    expect(room.gridLetters).toEqual(answer.split("").map(() => ""));
    expect(JSON.stringify(room)).not.toContain(answer);

    const typed = stateOf(
      await fixture.store.fillCells(
        {
          cells: [
            { index: 0, letter: "q" },
            { index: 99, letter: "A" },
            { index: 1, letter: "AB" },
          ],
          roomId: "ABC234",
          roomToken,
        },
        "socket-one",
      ),
    );
    expect(typed.gridLetters[0]).toBe("Q");
    expect(typed.gridLetters[1]).toBe("");

    const incomplete = await fixture.store.guess(
      { guess: "", roomId: "ABC234", roomToken },
      "socket-one",
    );
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.error.code).toBe("INCOMPLETE_GRID");

    stateOf(
      await fixture.store.fillCells(
        {
          cells: [...answer].map((letter, index) => ({ index, letter })),
          roomId: "ABC234",
          roomToken,
        },
        "socket-one",
      ),
    );
    const solved = stateOf(
      await fixture.store.guess(
        { guess: "ignored for crosswords", roomId: "ABC234", roomToken },
        "socket-one",
      ),
    );
    expect(solved.lastGuess?.correct).toBe(true);
    expect(solved.phase).toBe("relic");
    expect(solved.torches).toBe(5);
  });

  test("refuses to fill squares outside a crossword room", async () => {
    const fixture = createStore();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const state = stateOf(
        await fixture.store.start({ roomId: "ABC234" }, "socket-one"),
      );
      if (state.roomType === "crossword") continue;
      const result = await fixture.store.fillCells(
        {
          cells: [{ index: 0, letter: "A" }],
          roomId: "ABC234",
          roomToken: state.roomToken ?? "",
        },
        "socket-one",
      );
      expect(result.ok).toBe(false);
      return;
    }
    throw new Error("Only crossword rooms were dealt in 60 starts");
  });
});
