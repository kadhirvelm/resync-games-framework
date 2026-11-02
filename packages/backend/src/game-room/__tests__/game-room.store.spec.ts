import { beforeEach, describe, expect, test } from "bun:test";
import type {
  CreateGameRoomPayload,
  GameRoomCommandResult,
  GameRoomState,
} from "@resync-game-framework/api";
import { MockRedisService } from "../../infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "../../infra/redis/redis.service";
import { GameRoomStore } from "../game-room.store";

const host = { id: "player-host", name: "Host" };
const guest = { id: "player-guest", name: "Guest" };

/**
 * Returns a valid room creation payload with overridable fields.
 * @param overrides - Creation fields to replace
 * @returns Valid room command payload
 */
function createPayload(
  overrides: Partial<CreateGameRoomPayload> = {},
): CreateGameRoomPayload {
  return {
    gameId: "test-game",
    initialState: { turn: 0 },
    maxPlayers: 2,
    player: host,
    ...overrides,
  };
}

/**
 * Extracts the room from a successful command for concise assertions.
 * @param result - Room command acknowledgement
 * @returns Non-null room or throws when the command failed
 */
function successfulRoom(result: GameRoomCommandResult): GameRoomState {
  if (!result.ok || !result.room) {
    throw new Error("Expected a successful room command");
  }
  return result.room;
}

describe("GameRoomStore", () => {
  let redis: MockRedisService;
  let store: GameRoomStore;

  beforeEach(() => {
    redis = new MockRedisService();
    store = new GameRoomStore(redis as unknown as RedisService);
  });

  test("creates a host-owned room with a shareable code", async () => {
    const room = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );

    expect(room.id).toHaveLength(6);
    expect(room.gameId).toBe("test-game");
    expect(room.hostPlayerId).toBe(host.id);
    expect(room.players).toEqual([{ ...host, joinedAt: room.createdAt }]);
    expect(room.gameState).toEqual({ turn: 0 });
    expect(room.revision).toBe(0);
  });

  test("returns a stable error for malformed wire payloads", async () => {
    const malformed = await store.createRoom(
      undefined as unknown as CreateGameRoomPayload,
      "socket-host",
    );

    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.error.code).toBe("INVALID_REQUEST");
    }
  });

  test("joins players, enforces capacity, and rejects other games", async () => {
    const created = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );
    const joined = successfulRoom(
      await store.joinRoom(
        { gameId: "test-game", player: guest, roomId: created.id },
        "socket-guest",
      ),
    );

    expect(joined.players.map((player) => player.id)).toEqual([
      host.id,
      guest.id,
    ]);
    expect(joined.revision).toBe(1);

    const full = await store.joinRoom(
      {
        gameId: "test-game",
        player: { id: "third", name: "Third" },
        roomId: created.id,
      },
      "socket-third",
    );
    expect(full.ok).toBe(false);
    if (!full.ok) {
      expect(full.error.code).toBe("ROOM_FULL");
    }

    const mismatch = await store.joinRoom(
      { gameId: "other-game", player: guest, roomId: created.id },
      "socket-other",
    );
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe("GAME_MISMATCH");
    }
  });

  test("does not let another live socket impersonate a room player", async () => {
    const created = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );

    const duplicate = await store.joinRoom(
      { gameId: created.gameId, player: host, roomId: created.id },
      "socket-impostor",
    );

    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("INVALID_REQUEST");
    }
  });

  test("updates snapshots and returns the latest room on a stale revision", async () => {
    const created = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );
    const updated = successfulRoom(
      await store.updateRoomState(
        created.id,
        { turn: 1 },
        created.revision,
        "socket-host",
      ),
    );

    expect(updated.gameState).toEqual({ turn: 1 });
    expect(updated.revision).toBe(1);

    const conflict = await store.updateRoomState(
      created.id,
      { turn: 2 },
      created.revision,
      "socket-host",
    );
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe("REVISION_CONFLICT");
      expect(conflict.room?.gameState).toEqual({ turn: 1 });
    }
  });

  test("transfers host ownership and deletes the room after the final leave", async () => {
    const created = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );
    await store.joinRoom(
      { gameId: "test-game", player: guest, roomId: created.id },
      "socket-guest",
    );

    const afterHostLeaves = successfulRoom(
      await store.leaveRoom(created.id, "socket-host"),
    );
    expect(afterHostLeaves.hostPlayerId).toBe(guest.id);
    expect(afterHostLeaves.players.map((player) => player.id)).toEqual([
      guest.id,
    ]);

    const empty = await store.leaveRoom(created.id, "socket-guest");
    expect(empty).toEqual({ ok: true, room: null });

    const missing = await store.joinRoom(
      { gameId: "test-game", player: guest, roomId: created.id },
      "socket-returning",
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("ROOM_NOT_FOUND");
    }
  });

  test("cleans disconnected sockets from all joined rooms", async () => {
    const first = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );
    const second = successfulRoom(
      await store.createRoom(
        createPayload({ gameId: "second-game" }),
        "socket-host",
      ),
    );
    await store.joinRoom(
      { gameId: first.gameId, player: guest, roomId: first.id },
      "socket-guest",
    );
    await store.joinRoom(
      { gameId: second.gameId, player: guest, roomId: second.id },
      "socket-guest",
    );

    const changedRooms = await store.disconnect("socket-host");

    expect(changedRooms).toHaveLength(2);
    expect(changedRooms.every((room) => room.hostPlayerId === guest.id)).toBe(
      true,
    );
  });

  test("keeps an empty room briefly so its player can reconnect", async () => {
    const created = successfulRoom(
      await store.createRoom(createPayload(), "socket-host"),
    );

    const changedRooms = await store.disconnect("socket-host");
    const rejoined = successfulRoom(
      await store.joinRoom(
        { gameId: created.gameId, player: host, roomId: created.id },
        "socket-reconnected",
      ),
    );

    expect(changedRooms).toEqual([]);
    expect(rejoined.hostPlayerId).toBe(host.id);
    expect(rejoined.players.map((player) => player.id)).toEqual([host.id]);
    expect(rejoined.gameState).toEqual(created.gameState);
  });
});
