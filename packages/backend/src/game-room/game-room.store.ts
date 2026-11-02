import { randomInt } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  CreateGameRoomPayload,
  GameRoomCommandResult,
  GameRoomErrorCode,
  GameRoomPlayer,
  GameRoomPlayerInput,
  GameRoomState,
  GameRoomValue,
  JoinGameRoomPayload,
} from "@towers-of-coreborn/api";
import { RedisService } from "../infra/redis/redis.service";

const DEFAULT_MAX_PLAYERS = 4;
const MAX_PLAYERS = 16;
const MAX_GAME_STATE_BYTES = 64 * 1024;
const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_ID_LENGTH = 6;
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const RECONNECT_GRACE_SECONDS = 60;
const ROOM_LOCK_DURATION_MS = 5_000;

interface StoredGameRoomPlayer extends GameRoomPlayer {
  socketId: string;
}

interface StoredGameRoom extends Omit<GameRoomState, "players"> {
  players: StoredGameRoomPlayer[];
}

interface ValidatedCreateRoom {
  gameId: string;
  initialState: GameRoomValue;
  maxPlayers: number;
  player: GameRoomPlayerInput;
}

interface ValidationSuccess<T> {
  ok: true;
  value: T;
}

interface ValidationFailure {
  error: string;
  ok: false;
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Stores authoritative multiplayer room snapshots and socket memberships in
 * Redis so every backend instance observes the same state.
 */
@Injectable()
export class GameRoomStore {
  /**
   * Creates the distributed room store.
   * @param redisService - Shared Redis data and locking service
   */
  public constructor(private readonly redisService: RedisService) {}

  /**
   * Creates a room and records the creating socket as its first player.
   * @param payload - Game id, host identity, capacity, and initial game state
   * @param socketId - Socket.IO connection that owns the membership
   * @returns The created room or a validation failure
   */
  public async createRoom(
    payload: CreateGameRoomPayload,
    socketId: string,
  ): Promise<GameRoomCommandResult> {
    if (!payload || typeof payload !== "object") {
      return failure("INVALID_REQUEST", "A room configuration is required.");
    }
    const validated = validateCreateRoomPayload(payload);
    if (!validated.ok) {
      return failure("INVALID_REQUEST", validated.error);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const roomId = createRoomId();
      const createdRoom = await this.redisService.withLock(
        [roomLockKey(roomId)],
        ROOM_LOCK_DURATION_MS,
        async () => {
          const existing = await this.readStoredRoom(roomId);
          if (existing) {
            return null;
          }

          const now = new Date().toISOString();
          const room: StoredGameRoom = {
            createdAt: now,
            gameId: validated.value.gameId,
            gameState: validated.value.initialState,
            hostPlayerId: validated.value.player.id,
            id: roomId,
            maxPlayers: validated.value.maxPlayers,
            players: [
              {
                ...validated.value.player,
                joinedAt: now,
                socketId,
              },
            ],
            revision: 0,
            updatedAt: now,
          };

          await this.saveRoom(room);
          await this.addSocketMembership(socketId, roomId);
          return room;
        },
      );

      if (createdRoom) {
        return success(toPublicRoom(createdRoom));
      }
    }

    return failure(
      "INVALID_REQUEST",
      "Could not allocate a room code. Please try again.",
    );
  }

  /**
   * Adds a socket to an existing compatible room or refreshes its reconnecting
   * player membership.
   * @param payload - Room code, expected game id, and public player identity
   * @param socketId - Socket.IO connection joining the room
   * @returns The updated room or a stable room error
   */
  public async joinRoom(
    payload: JoinGameRoomPayload,
    socketId: string,
  ): Promise<GameRoomCommandResult> {
    if (!payload || typeof payload !== "object") {
      return failure(
        "INVALID_REQUEST",
        "Room and player details are required.",
      );
    }
    const roomId = normalizeRoomId(payload.roomId);
    const player = validatePlayer(payload.player);
    const gameId = normalizeGameId(payload.gameId);
    if (!roomId || !player.ok || !gameId) {
      return failure(
        "INVALID_REQUEST",
        player.ok ? "The room or game id is invalid." : player.error,
      );
    }

    return this.redisService.withLock(
      [roomLockKey(roomId)],
      ROOM_LOCK_DURATION_MS,
      async () => {
        const room = await this.readStoredRoom(roomId);
        if (!room) {
          return failure(
            "ROOM_NOT_FOUND",
            "That multiplayer room was not found.",
          );
        }
        if (room.gameId !== gameId) {
          return failure(
            "GAME_MISMATCH",
            "That room belongs to a different game.",
          );
        }

        const socketPlayer = room.players.find(
          (candidate) => candidate.socketId === socketId,
        );
        if (socketPlayer && socketPlayer.id !== player.value.id) {
          return failure(
            "INVALID_REQUEST",
            "This connection already joined the room as another player.",
          );
        }

        const roomWasEmpty = room.players.length === 0;
        const existingPlayer = room.players.find(
          (candidate) => candidate.id === player.value.id,
        );
        if (existingPlayer && existingPlayer.socketId !== socketId) {
          return failure(
            "INVALID_REQUEST",
            "That player is already connected to this room.",
          );
        }
        if (!existingPlayer && room.players.length >= room.maxPlayers) {
          return failure("ROOM_FULL", "That multiplayer room is full.");
        }

        if (existingPlayer) {
          const previousSocketId = existingPlayer.socketId;
          existingPlayer.name = player.value.name;
          existingPlayer.socketId = socketId;
          await this.removeSocketMembership(previousSocketId, roomId);
        } else {
          room.players.push({
            ...player.value,
            joinedAt: new Date().toISOString(),
            socketId,
          });
        }
        if (roomWasEmpty) {
          room.hostPlayerId = player.value.id;
        }

        touchRoom(room);
        await this.saveRoom(room);
        await this.addSocketMembership(socketId, roomId);
        return success(toPublicRoom(room));
      },
    );
  }

  /**
   * Removes the player represented by a socket and transfers host ownership
   * when necessary.
   * @param requestedRoomId - Room code to leave
   * @param socketId - Socket.IO connection leaving the room
   * @returns The remaining room, or `null` when it became empty
   */
  public async leaveRoom(
    requestedRoomId: unknown,
    socketId: string,
  ): Promise<GameRoomCommandResult> {
    const roomId = normalizeRoomId(requestedRoomId);
    if (!roomId) {
      return failure("INVALID_REQUEST", "The room id is invalid.");
    }

    return this.removeSocketFromRoom(roomId, socketId, false);
  }

  /**
   * Removes one socket under the room lock, optionally retaining an empty room
   * briefly so its final player can reconnect after a network interruption.
   * @param roomId - Normalized room code
   * @param socketId - Socket.IO connection to remove
   * @param preserveEmptyRoom - Whether to keep an empty reconnectable room
   * @returns The remaining room, or `null` after an explicit final leave
   */
  private async removeSocketFromRoom(
    roomId: string,
    socketId: string,
    preserveEmptyRoom: boolean,
  ): Promise<GameRoomCommandResult> {
    return this.redisService.withLock(
      [roomLockKey(roomId)],
      ROOM_LOCK_DURATION_MS,
      async () => {
        const room = await this.readStoredRoom(roomId);
        if (!room) {
          return failure(
            "ROOM_NOT_FOUND",
            "That multiplayer room was not found.",
          );
        }

        const playerIndex = room.players.findIndex(
          (candidate) => candidate.socketId === socketId,
        );
        if (playerIndex < 0) {
          return failure(
            "NOT_A_MEMBER",
            "This connection is not a member of that room.",
          );
        }

        const [leavingPlayer] = room.players.splice(playerIndex, 1);
        await this.removeSocketMembership(socketId, roomId);
        if (room.players.length === 0) {
          if (!preserveEmptyRoom) {
            await this.redisService.del(roomStorageKey(roomId));
            return success(null);
          }

          touchRoom(room);
          await this.saveRoom(room, RECONNECT_GRACE_SECONDS);
          return success(toPublicRoom(room));
        }

        if (leavingPlayer?.id === room.hostPlayerId) {
          room.hostPlayerId = room.players[0]?.id ?? room.hostPlayerId;
        }
        touchRoom(room);
        await this.saveRoom(room);
        return success(toPublicRoom(room));
      },
    );
  }

  /**
   * Replaces the game-owned state when the caller is a member and has the
   * latest room revision.
   * @param requestedRoomId - Room code to update
   * @param gameState - Complete next game state snapshot
   * @param expectedRevision - Revision the game rendered before its update
   * @param socketId - Socket.IO connection making the update
   * @returns The updated room or a conflict containing the latest snapshot
   */
  public async updateRoomState(
    requestedRoomId: unknown,
    gameState: unknown,
    expectedRevision: unknown,
    socketId: string,
  ): Promise<GameRoomCommandResult> {
    const roomId = normalizeRoomId(requestedRoomId);
    const serializedState = validateGameState(gameState);
    if (
      !roomId ||
      !serializedState.ok ||
      typeof expectedRevision !== "number" ||
      !Number.isInteger(expectedRevision)
    ) {
      return failure(
        "INVALID_REQUEST",
        serializedState.ok
          ? "The room id or expected revision is invalid."
          : serializedState.error,
      );
    }

    return this.redisService.withLock(
      [roomLockKey(roomId)],
      ROOM_LOCK_DURATION_MS,
      async () => {
        const room = await this.readStoredRoom(roomId);
        if (!room) {
          return failure(
            "ROOM_NOT_FOUND",
            "That multiplayer room was not found.",
          );
        }
        if (!room.players.some((player) => player.socketId === socketId)) {
          return failure(
            "NOT_A_MEMBER",
            "Join the room before updating its game state.",
          );
        }
        if (room.revision !== expectedRevision) {
          return failure(
            "REVISION_CONFLICT",
            "The room changed before this update. Apply it again to the latest state.",
            toPublicRoom(room),
          );
        }

        room.gameState = serializedState.value;
        touchRoom(room);
        await this.saveRoom(room);
        await this.addSocketMembership(socketId, roomId);
        return success(toPublicRoom(room));
      },
    );
  }

  /**
   * Removes a disconnected socket from every room it joined.
   * @param socketId - Disconnected Socket.IO connection
   * @returns Remaining snapshots that callers should broadcast
   */
  public async disconnect(socketId: string): Promise<GameRoomState[]> {
    const roomIds = await this.redisService.smembers(
      socketMembershipKey(socketId),
    );
    const changedRooms: GameRoomState[] = [];

    for (const roomId of roomIds) {
      const result = await this.removeSocketFromRoom(roomId, socketId, true);
      if (result.ok && result.room && result.room.players.length > 0) {
        changedRooms.push(result.room);
      }
    }

    return changedRooms;
  }

  /**
   * Reads and parses one internal room record.
   * @param roomId - Normalized room code
   * @returns Internal room including socket ids, or `null` when absent
   */
  private async readStoredRoom(roomId: string): Promise<StoredGameRoom | null> {
    const serialized = await this.redisService.get(roomStorageKey(roomId));
    if (!serialized) {
      return null;
    }
    return JSON.parse(serialized) as StoredGameRoom;
  }

  /**
   * Persists a room and refreshes its abandoned-room cleanup window.
   * @param room - Internal room snapshot to serialize
   * @param ttlSeconds - Seconds before Redis removes an abandoned room
   * @returns Completion after Redis accepts the snapshot
   */
  private async saveRoom(
    room: StoredGameRoom,
    ttlSeconds = ROOM_TTL_SECONDS,
  ): Promise<void> {
    await this.redisService.set(
      roomStorageKey(room.id),
      JSON.stringify(room),
      ttlSeconds,
    );
  }

  /**
   * Adds a reverse socket-to-room membership used during disconnect cleanup.
   * @param socketId - Socket.IO connection id
   * @param roomId - Normalized room code
   * @returns Completion after the reverse membership is stored
   */
  private async addSocketMembership(
    socketId: string,
    roomId: string,
  ): Promise<void> {
    const key = socketMembershipKey(socketId);
    await this.redisService.sadd(key, roomId);
    await this.redisService.expire(key, ROOM_TTL_SECONDS);
  }

  /**
   * Removes one reverse socket-to-room membership.
   * @param socketId - Socket.IO connection id
   * @param roomId - Normalized room code
   * @returns Completion after the reverse membership is removed
   */
  private async removeSocketMembership(
    socketId: string,
    roomId: string,
  ): Promise<void> {
    await this.redisService.srem(socketMembershipKey(socketId), roomId);
  }
}

/**
 * Builds a successful command acknowledgement.
 * @param room - Current room, or `null` when the room was deleted
 * @returns Successful wire response
 */
function success(room: GameRoomState | null): GameRoomCommandResult {
  return { ok: true, room };
}

/**
 * Builds a failed command acknowledgement with an optional recovery snapshot.
 * @param code - Stable machine-readable error
 * @param message - Player-readable explanation
 * @param room - Latest room when it helps recover from the failure
 * @returns Failed wire response
 */
function failure(
  code: GameRoomErrorCode,
  message: string,
  room?: GameRoomState,
): GameRoomCommandResult {
  const error = { code, message };
  if (room) {
    return { error, ok: false, room };
  }
  return { error, ok: false };
}

/**
 * Copies internal state without exposing Socket.IO connection ids.
 * @param room - Internal room record
 * @returns Public room snapshot safe to broadcast
 */
function toPublicRoom(room: StoredGameRoom): GameRoomState {
  return {
    ...room,
    players: room.players.map(({ socketId: _socketId, ...player }) => player),
  };
}

/**
 * Advances the room revision and change timestamp.
 * @param room - Internal room being mutated
 * @returns Nothing; the supplied room is updated in place
 */
function touchRoom(room: StoredGameRoom): void {
  room.revision += 1;
  room.updatedAt = new Date().toISOString();
}

/**
 * Validates and normalizes a room creation payload.
 * @param payload - Untrusted room creation command
 * @returns Normalized fields or a validation message
 */
function validateCreateRoomPayload(
  payload: CreateGameRoomPayload,
): ValidationResult<ValidatedCreateRoom> {
  const gameId = normalizeGameId(payload.gameId);
  const player = validatePlayer(payload.player);
  const initialState = validateGameState(payload.initialState);
  const maxPlayers = payload.maxPlayers ?? DEFAULT_MAX_PLAYERS;

  if (!gameId) {
    return { error: "The game id is invalid.", ok: false };
  }
  if (!player.ok) {
    return player;
  }
  if (!initialState.ok) {
    return initialState;
  }
  if (
    !Number.isInteger(maxPlayers) ||
    maxPlayers < 2 ||
    maxPlayers > MAX_PLAYERS
  ) {
    return {
      error: `Room capacity must be between 2 and ${MAX_PLAYERS}.`,
      ok: false,
    };
  }

  return {
    ok: true,
    value: {
      gameId,
      initialState: initialState.value,
      maxPlayers,
      player: player.value,
    },
  };
}

/**
 * Validates and trims one public player identity.
 * @param player - Untrusted player id and display name
 * @returns Normalized player or a validation message
 */
function validatePlayer(
  player: GameRoomPlayerInput,
): ValidationResult<GameRoomPlayerInput> {
  const id = typeof player?.id === "string" ? player.id.trim() : "";
  const name = typeof player?.name === "string" ? player.name.trim() : "";
  if (id.length < 1 || id.length > 128) {
    return {
      error: "Player ids must be between 1 and 128 characters.",
      ok: false,
    };
  }
  if (name.length < 1 || name.length > 40) {
    return {
      error: "Player names must be between 1 and 40 characters.",
      ok: false,
    };
  }
  return { ok: true, value: { id, name } };
}

/**
 * Serializes and bounds a game snapshot before it enters Redis.
 * @param gameState - Untrusted game-owned state
 * @returns JSON-safe cloned state or a validation message
 */
function validateGameState(
  gameState: unknown,
): ValidationResult<GameRoomValue> {
  try {
    const serialized = JSON.stringify(gameState);
    if (serialized === undefined) {
      return { error: "Game state must be JSON serializable.", ok: false };
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_GAME_STATE_BYTES) {
      return {
        error: `Game state cannot exceed ${MAX_GAME_STATE_BYTES} bytes.`,
        ok: false,
      };
    }
    return { ok: true, value: JSON.parse(serialized) as GameRoomValue };
  } catch {
    return { error: "Game state must be JSON serializable.", ok: false };
  }
}

/**
 * Normalizes a game id or rejects ids unsuitable for durable routing.
 * @param gameId - Untrusted game identifier
 * @returns Lowercase game id, or `null` when invalid
 */
function normalizeGameId(gameId: unknown): string | null {
  if (typeof gameId !== "string") {
    return null;
  }
  const normalized = gameId.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-_]{0,63}$/.test(normalized) ? normalized : null;
}

/**
 * Normalizes a human-entered room code.
 * @param roomId - Untrusted room code
 * @returns Uppercase room code, or `null` when invalid
 */
function normalizeRoomId(roomId: unknown): string | null {
  if (typeof roomId !== "string") {
    return null;
  }
  const normalized = roomId.trim().toUpperCase();
  return new RegExp(`^[A-Z2-9]{${ROOM_ID_LENGTH}}$`).test(normalized)
    ? normalized
    : null;
}

/**
 * Generates a short room code without visually ambiguous characters.
 * @returns Random six-character room code
 */
function createRoomId(): string {
  let roomId = "";
  for (let index = 0; index < ROOM_ID_LENGTH; index += 1) {
    roomId += ROOM_ID_ALPHABET[randomInt(ROOM_ID_ALPHABET.length)];
  }
  return roomId;
}

/**
 * Returns the Redis key containing one room snapshot.
 * @param roomId - Normalized room code
 * @returns Redis data key
 */
function roomStorageKey(roomId: string): string {
  return `game-room:${roomId}`;
}

/**
 * Returns the Redlock resource for one room mutation.
 * @param roomId - Normalized room code
 * @returns Distributed lock resource
 */
function roomLockKey(roomId: string): string {
  return `lock:game-room:${roomId}`;
}

/**
 * Returns the Redis set tracking rooms joined by one socket.
 * @param socketId - Socket.IO connection id
 * @returns Redis reverse-membership key
 */
function socketMembershipKey(socketId: string): string {
  return `game-room:socket:${socketId}`;
}
