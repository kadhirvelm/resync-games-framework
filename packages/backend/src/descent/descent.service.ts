import { randomBytes, randomUUID } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import {
  DESCENT_GAME_ID,
  DESCENT_MAX_PLAYERS,
  type DescentAckResult,
  type DescentCommandPayload,
  type DescentRoomPlayer,
  type DescentRoomState,
  type DescentSetPausedPayload,
  type DescentSetSpeedPayload,
  type DescentStampedCommand,
  type DescentStartMatchPayload,
  type DescentSyncPayload,
  type DescentSyncResult,
  type DescentTickPayload,
  descentPlayerColor,
  type GameRoomCommandResult,
  type GameRoomValue,
} from "@resync-game-framework/api";
import { GameRoomStore } from "src/game-room/game-room.store";
import { RedisService } from "src/infra/redis/redis.service";
import { isDescentWireCommand } from "./descent.commands";
import {
  DESCENT_OWNER_RENEW_MS,
  type DescentMatchState,
  DescentMatchStore,
} from "./descent.matchStore";

/** Milliseconds between authoritative lockstep tick broadcasts. */
const TICK_BROADCAST_MS = 100;
/** Valid simulation speeds matching `SIM_SPEEDS` in Descent. */
const VALID_SPEEDS = new Set([1, 2, 4]);
/** How often an active match verifies its Redis room still has members. */
const MEMBERSHIP_CHECK_MS = 60 * 1_000;
/** Empty rooms remain replayable through the shared reconnect grace window. */
const EMPTY_MATCH_GRACE_MS = 2 * 60 * 1_000;
/** Largest serialized command accepted from one client. */
const MAX_COMMAND_BYTES = 16 * 1024;
/** Commands awaiting the next broadcast, across all four players. */
const MAX_PENDING_COMMANDS = 256;
/** Retained authoritative history needed for deterministic reconnect replay. */
const MAX_COMMAND_LOG = 50_000;

interface ActiveDescentMatch extends DescentMatchState {
  advancing: boolean;
  checkingMembership: boolean;
  emptySince: number | null;
  nextMembershipCheckAt: number;
  nextOwnerCheckAt: number;
  ownsMatch: boolean;
  timer: ReturnType<typeof setInterval> | null;
}

type TickBroadcaster = (payload: DescentTickPayload) => void;

/**
 * Coordinates authoritative lockstep matches for Descent co-op rooms.
 * Checkpoints and owner leases are shared through Redis, so another backend
 * instance can admit commands or recover the tick producer without duplicating it.
 */
@Injectable()
export class DescentService implements OnModuleDestroy {
  private readonly matches = new Map<string, ActiveDescentMatch>();
  private readonly matchStore: DescentMatchStore;
  private readonly ownerId = randomUUID();
  private broadcaster: TickBroadcaster | null = null;

  /**
   * Creates the match coordinator around shared room and Redis services.
   * @param gameRoomStore - Distributed room membership and lobby store
   * @param redisService - Redis checkpoints and distributed owner leases
   */
  public constructor(
    private readonly gameRoomStore: GameRoomStore,
    redisService: RedisService,
  ) {
    this.matchStore = new DescentMatchStore(redisService);
  }

  /**
   * Registers the Socket.IO broadcaster owned by `DescentGateway`.
   * @param broadcaster - Callback that emits `descentTick` to one room
   */
  public setBroadcaster(broadcaster: TickBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /** Stops local clocks and releases every owner lease on shutdown. */
  public async onModuleDestroy(): Promise<void> {
    const active = [...this.matches.values()];
    for (const match of active) {
      if (match.timer !== null) clearInterval(match.timer);
    }
    this.matches.clear();
    await Promise.all(
      active.map((match) =>
        this.matchStore
          .releaseOwner(match.roomId, match.matchId, this.ownerId)
          .catch(() => undefined),
      ),
    );
  }

  /**
   * Locks the current room roster, assigns co-op colors and a deterministic
   * seed, persists a recoverable checkpoint, and starts the owner clock.
   * @param payload - Room code to start
   * @param socketId - Calling player's socket id (must be host)
   * @returns Room command result with the updated room snapshot
   */
  public async startMatch(
    payload: DescentStartMatchPayload,
    socketId: string,
  ): Promise<GameRoomCommandResult> {
    const mutation = await this.gameRoomStore.mutateServerRoom(
      payload?.roomId,
      DESCENT_GAME_ID,
      socketId,
      async (room, playerId) => {
        if (room.hostPlayerId !== playerId) {
          return {
            code: "INVALID_REQUEST",
            message: "Only the room host can start the Descent match.",
            ok: false,
          };
        }
        if (
          room.players.length < 1 ||
          room.players.length > DESCENT_MAX_PLAYERS
        ) {
          return {
            code: "INVALID_REQUEST",
            message: `Descent co-op supports 1 to ${DESCENT_MAX_PLAYERS} players.`,
            ok: false,
          };
        }

        const roster: DescentRoomPlayer[] = room.players.map(
          (player, index) => ({
            color: descentPlayerColor(index),
            colorIndex: index,
            id: player.id,
            name: player.name,
            slotIndex: index,
          }),
        );
        const matchId = randomUUID();
        const seed = randomBytes(4).readUInt32BE(0);
        const nextState: DescentRoomState = {
          mapId: "ashen_crucible",
          matchId,
          phase: "playing",
          roster,
          seed,
          startedAt: new Date().toISOString(),
        };

        return {
          gameState: nextState as unknown as GameRoomValue,
          ok: true,
          value: {
            matchId,
            playerIds: roster.map((player) => player.id),
            roomId: room.id,
          },
        };
      },
    );

    if (mutation.result.ok && mutation.value) {
      const match: DescentMatchState = {
        commandLog: [],
        matchId: mutation.value.matchId,
        nextSeq: 1,
        paused: false,
        pendingCommands: [],
        playerIds: mutation.value.playerIds,
        roomId: mutation.value.roomId,
        speed: 1,
        targetTick: 0,
      };
      await this.matchStore.create(match);
      this.startLocalClock(match);
    }
    return mutation.result;
  }

  /**
   * Atomically admits one player command into the shared pending queue.
   * @param payload - Room code, match id, and Descent command object
   * @param socketId - Calling player's socket id
   * @returns Simple acknowledgement
   */
  public async enqueueCommand(
    payload: DescentCommandPayload,
    socketId: string,
  ): Promise<DescentAckResult> {
    if (!isDescentWireCommand(payload?.command)) {
      return { error: "A valid command payload is required.", ok: false };
    }
    if (serializedCommandBytes(payload.command) > MAX_COMMAND_BYTES) {
      return { error: "The command payload is too large.", ok: false };
    }
    const membership = await this.gameRoomStore.findMember(
      payload.roomId,
      DESCENT_GAME_ID,
      socketId,
    );
    if (!membership) {
      return { error: "You are not a member of that Descent room.", ok: false };
    }
    const mutation = await this.matchStore.mutate(
      membership.roomId,
      payload.matchId,
      (match) => {
        if (!match.playerIds.includes(membership.member.id)) {
          return {
            error: "Spectators can watch but cannot issue match commands.",
            ok: false,
          };
        }
        if (match.pendingCommands.length >= MAX_PENDING_COMMANDS) {
          return {
            error: "The match command queue is full. Please try again shortly.",
            ok: false,
          };
        }
        if (
          match.commandLog.length + match.pendingCommands.length >=
          MAX_COMMAND_LOG
        ) {
          return {
            error:
              "The match command history is full. The host must restart the match.",
            ok: false,
          };
        }

        const stamped: DescentStampedCommand = {
          command: payload.command,
          playerId: membership.member.id,
          seq: match.nextSeq,
          tick: match.targetTick + 1,
        };
        match.nextSeq += 1;
        match.pendingCommands.push(stamped);
        return { ok: true };
      },
    );
    if (!mutation) {
      return { error: "No active Descent match in this room.", ok: false };
    }
    this.startLocalClock(mutation.match);
    return mutation.result;
  }

  /**
   * Updates and broadcasts the shared pause state atomically.
   * @param payload - Room code, match id, and desired paused flag
   * @param socketId - Calling player's socket id
   * @returns Simple acknowledgement
   */
  public async setPaused(
    payload: DescentSetPausedPayload,
    socketId: string,
  ): Promise<DescentAckResult> {
    if (typeof payload?.paused !== "boolean") {
      return { error: "A boolean pause value is required.", ok: false };
    }
    const membership = await this.gameRoomStore.findMember(
      payload?.roomId,
      DESCENT_GAME_ID,
      socketId,
    );
    if (!membership) {
      return { error: "You are not a member of that Descent room.", ok: false };
    }
    let changed = false;
    const mutation = await this.matchStore.mutate(
      membership.roomId,
      payload.matchId,
      (match) => {
        if (!match.playerIds.includes(membership.member.id)) {
          return {
            error: "Spectators cannot change the match clock.",
            ok: false,
          };
        }
        if (match.paused === payload.paused) return { ok: true };
        match.paused = payload.paused;
        changed = true;
        return { ok: true };
      },
    );
    if (!mutation) {
      return { error: "No active Descent match in this room.", ok: false };
    }
    this.startLocalClock(mutation.match);
    if (changed) this.emitTick(mutation.match, []);
    return mutation.result;
  }

  /**
   * Updates and broadcasts the shared simulation speed atomically.
   * @param payload - Room code, match id, and speed multiplier (1, 2, or 4)
   * @param socketId - Calling player's socket id
   * @returns Simple acknowledgement
   */
  public async setSpeed(
    payload: DescentSetSpeedPayload,
    socketId: string,
  ): Promise<DescentAckResult> {
    if (!VALID_SPEEDS.has(payload?.speed)) {
      return { error: "Invalid simulation speed.", ok: false };
    }
    const membership = await this.gameRoomStore.findMember(
      payload.roomId,
      DESCENT_GAME_ID,
      socketId,
    );
    if (!membership) {
      return { error: "You are not a member of that Descent room.", ok: false };
    }
    let changed = false;
    const mutation = await this.matchStore.mutate(
      membership.roomId,
      payload.matchId,
      (match) => {
        if (!match.playerIds.includes(membership.member.id)) {
          return {
            error: "Spectators cannot change the match clock.",
            ok: false,
          };
        }
        if (match.speed === payload.speed) return { ok: true };
        match.speed = payload.speed;
        changed = true;
        return { ok: true };
      },
    );
    if (!mutation) {
      return { error: "No active Descent match in this room.", ok: false };
    }
    this.startLocalClock(mutation.match);
    if (changed) this.emitTick(mutation.match, []);
    return mutation.result;
  }

  /**
   * Loads a recoverable checkpoint and starts the local owner/recovery loop.
   * @param payload - Room code, match id, and lowest tick needed
   * @param socketId - Calling player's socket id
   * @returns Missed commands and current match clock metadata
   */
  public async sync(
    payload: DescentSyncPayload,
    socketId: string,
  ): Promise<DescentSyncResult> {
    const membership = await this.gameRoomStore.findMember(
      payload?.roomId,
      DESCENT_GAME_ID,
      socketId,
    );
    if (!membership) {
      return {
        commands: [],
        error: "You are not a member of that Descent room.",
        matchId: null,
        ok: false,
        paused: false,
        speed: 1,
        targetTick: 0,
      };
    }
    const match = await this.matchStore.load(
      membership.roomId,
      payload.matchId,
    );
    if (!match) {
      return {
        commands: [],
        matchId: null,
        ok: true,
        paused: false,
        speed: 1,
        targetTick: 0,
      };
    }
    if (!Number.isSafeInteger(payload.fromTick) || payload.fromTick < 0) {
      return {
        commands: [],
        error: "A valid starting tick is required.",
        matchId: match.matchId,
        ok: false,
        paused: match.paused,
        speed: match.speed,
        targetTick: match.targetTick,
      };
    }

    this.startLocalClock(match);
    const commands = commandsFromTick(match.commandLog, payload.fromTick);
    return {
      commands,
      matchId: match.matchId,
      ok: true,
      paused: match.paused,
      speed: match.speed,
      targetTick: match.targetTick,
    };
  }

  /**
   * Stops a local timer and releases its owner lease without deleting the
   * persisted checkpoint, allowing another instance to recover it.
   * @param roomId - Normalized room code
   */
  public stopMatch(roomId: string): void {
    const existing = this.matches.get(roomId);
    if (!existing) return;
    if (existing.timer !== null) clearInterval(existing.timer);
    this.matches.delete(roomId);
    void this.matchStore
      .releaseOwner(roomId, existing.matchId, this.ownerId)
      .catch(() => undefined);
  }

  /**
   * Starts or reuses a local owner/recovery loop for one checkpoint.
   * @param match - Latest recoverable match state
   */
  private startLocalClock(match: DescentMatchState): void {
    const existing = this.matches.get(match.roomId);
    if (existing?.matchId === match.matchId) return;
    if (existing) this.stopMatch(match.roomId);

    const local: ActiveDescentMatch = {
      ...match,
      advancing: false,
      checkingMembership: false,
      emptySince: null,
      nextMembershipCheckAt: Date.now() + MEMBERSHIP_CHECK_MS,
      nextOwnerCheckAt: 0,
      ownsMatch: false,
      timer: null,
    };
    local.timer = setInterval(
      () => void this.advanceMatch(local),
      TICK_BROADCAST_MS,
    );
    this.matches.set(match.roomId, local);
  }

  /**
   * Renews the fenced lease and advances the latest shared checkpoint.
   * Overlapping local intervals are ignored while Redis work is in flight.
   * @param match - Local clock metadata
   */
  private async advanceMatch(match: ActiveDescentMatch): Promise<void> {
    if (match.advancing) return;
    match.advancing = true;
    try {
      const now = Date.now();
      if (now >= match.nextMembershipCheckAt) {
        void this.checkMatchMembership(match);
      }
      if (now >= match.nextOwnerCheckAt) {
        match.ownsMatch = await this.matchStore.claimOwner(
          match.roomId,
          match.matchId,
          this.ownerId,
        );
        match.nextOwnerCheckAt = now + DESCENT_OWNER_RENEW_MS;
      }
      if (!match.ownsMatch) return;

      const advanced = await this.matchStore.advance(
        match.roomId,
        match.matchId,
      );
      if (!advanced) {
        this.stopMatch(match.roomId);
        return;
      }
      if (this.matches.get(match.roomId) !== match) return;
      Object.assign(match, advanced.match);
      if (match.paused) return;
      this.emitTick(match, advanced.result);
    } catch {
      // Redis failures skip this broadcast; the next interval retries recovery.
    } finally {
      match.advancing = false;
    }
  }

  /**
   * Stops a local clock only after its Redis room has remained empty through
   * reconnect grace. Connected and paused matches are never reaped for input.
   * @param match - Local clock metadata
   */
  private async checkMatchMembership(match: ActiveDescentMatch): Promise<void> {
    if (match.checkingMembership) return;
    match.checkingMembership = true;
    match.nextMembershipCheckAt = Date.now() + MEMBERSHIP_CHECK_MS;
    try {
      const hasMembers = await this.gameRoomStore.hasConnectedMembers(
        match.roomId,
        DESCENT_GAME_ID,
      );
      if (this.matches.get(match.roomId) !== match) return;
      if (hasMembers) {
        match.emptySince = null;
        return;
      }
      match.emptySince ??= Date.now();
      if (Date.now() - match.emptySince >= EMPTY_MATCH_GRACE_MS) {
        this.stopMatch(match.roomId);
      }
    } catch {
      // Redis failures retain the match and retry on the next membership pass.
    } finally {
      match.checkingMembership = false;
    }
  }

  /**
   * Emits one authoritative tick payload to the room's Socket.IO channel.
   * @param match - Latest shared match state
   * @param commands - Commands stamped for this batch
   */
  private emitTick(
    match: DescentMatchState,
    commands: DescentStampedCommand[],
  ): void {
    this.broadcaster?.({
      commands,
      matchId: match.matchId,
      paused: match.paused,
      roomId: match.roomId,
      speed: match.speed,
      targetTick: match.targetTick,
    });
  }
}

/**
 * Measures a validated command's UTF-8 wire size.
 * @param command - Validated JSON-safe command
 * @returns Serialized size in bytes
 */
function serializedCommandBytes(command: GameRoomValue): number {
  return Buffer.byteLength(JSON.stringify(command), "utf8");
}

/**
 * Finds the retained command suffix for a reconnect using binary search.
 * @param log - Authoritative command log sorted by execution tick
 * @param fromTick - Lowest execution tick to include
 * @returns Commands at or after `fromTick`
 */
function commandsFromTick(
  log: readonly DescentStampedCommand[],
  fromTick: number,
): DescentStampedCommand[] {
  let low = 0;
  let high = log.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((log[middle]?.tick ?? 0) < fromTick) low = middle + 1;
    else high = middle;
  }
  return log.slice(low);
}
