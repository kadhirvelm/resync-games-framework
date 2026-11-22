import type { DescentStampedCommand } from "@resync-game-framework/api";
import { RedisService } from "src/infra/redis/redis.service";

/** Milliseconds a match owner may go without renewing before failover. */
export const DESCENT_OWNER_LEASE_MS = 5_000;
/** How long a recovered match remains available through its owner lease. */
const OWNER_LEASE_SECONDS = Math.ceil(DESCENT_OWNER_LEASE_MS / 1_000);
/** How often the active owner renews its fenced room lease. */
export const DESCENT_OWNER_RENEW_MS = 1_000;
/** Checkpoint lifetime for resumable match recovery. */
const CHECKPOINT_TTL_SECONDS = 24 * 60 * 60;
const CHECKPOINT_VERSION = 1;
const MUTATION_LOCK_MS = 5_000;
const OWNER_LOCK_MS = 1_000;

/** Authoritative state required to resume a Descent lockstep match. */
export interface DescentMatchState {
  commandLog: DescentStampedCommand[];
  matchId: string;
  nextSeq: number;
  paused: boolean;
  pendingCommands: DescentStampedCommand[];
  playerIds: string[];
  roomId: string;
  speed: number;
  targetTick: number;
}

/** A mutated checkpoint and the operation-specific result. */
export interface DescentMatchMutation<T> {
  match: DescentMatchState;
  result: T;
}

interface OwnerLease {
  expiresAt: number;
  matchId: string;
  ownerId: string;
}

/**
 * Redis-backed authoritative match checkpoints and fenced owner leases.
 * Every mutation uses the same room lock, so commands admitted on one replica
 * are visible to the replica currently producing ticks on another replica.
 */
export class DescentMatchStore {
  /**
   * Creates the checkpoint store.
   * @param redisService - Shared Redis data, lock, and expiry service
   */
  public constructor(private readonly redisService: RedisService) {}

  /**
   * Persists a new match checkpoint.
   * @param match - Initial match state
   */
  public async create(match: DescentMatchState): Promise<void> {
    await this.redisService.withLock(
      [matchLockKey(match.roomId)],
      MUTATION_LOCK_MS,
      async () => this.save(match),
    );
  }

  /**
   * Loads a checkpoint for one exact match id.
   * @param roomId - Room code
   * @param matchId - Expected match generation
   * @returns Recoverable state, or null when missing or superseded
   */
  public async load(
    roomId: string,
    matchId: string,
  ): Promise<DescentMatchState | null> {
    const serialized = await this.redisService.get(matchStorageKey(roomId));
    if (!serialized) return null;
    const match = JSON.parse(serialized) as DescentMatchState & {
      version?: number;
    };
    if (match.version !== CHECKPOINT_VERSION || match.matchId !== matchId) {
      return null;
    }
    return {
      commandLog: match.commandLog,
      matchId: match.matchId,
      nextSeq: match.nextSeq,
      paused: match.paused,
      pendingCommands: match.pendingCommands,
      playerIds: match.playerIds,
      roomId: match.roomId,
      speed: match.speed,
      targetTick: match.targetTick,
    };
  }

  /**
   * Runs and persists one atomic match mutation.
   * @param roomId - Room code
   * @param matchId - Expected match generation
   * @param apply - Mutation performed on the latest checkpoint
   * @returns Updated checkpoint and operation result, or null when not found
   */
  public async mutate<T>(
    roomId: string,
    matchId: string,
    apply: (match: DescentMatchState) => Promise<T> | T,
  ): Promise<DescentMatchMutation<T> | null> {
    return this.redisService.withLock(
      [matchLockKey(roomId)],
      MUTATION_LOCK_MS,
      async () => {
        const match = await this.load(roomId, matchId);
        if (!match) return null;
        const result = await apply(match);
        await this.save(match);
        return { match, result };
      },
    );
  }

  /**
   * Advances the authoritative tick and flushes pending commands atomically.
   * Paused matches are read without rewriting their checkpoint.
   * @param roomId - Room code
   * @param matchId - Expected match generation
   * @returns New checkpoint and commands in this batch, or null when superseded
   */
  public async advance(
    roomId: string,
    matchId: string,
  ): Promise<DescentMatchMutation<DescentStampedCommand[]> | null> {
    return this.redisService.withLock(
      [matchLockKey(roomId)],
      MUTATION_LOCK_MS,
      async () => {
        const match = await this.load(roomId, matchId);
        if (!match) return null;
        if (match.paused) return { match, result: [] };

        const nextTick = match.targetTick + 2 * match.speed;
        const flushed = match.pendingCommands.splice(
          0,
          match.pendingCommands.length,
        );
        for (const entry of flushed) {
          entry.tick = Math.min(entry.tick, nextTick);
          match.commandLog.push(entry);
        }
        match.targetTick = nextTick;
        await this.save(match);
        return { match, result: flushed };
      },
    );
  }

  /**
   * Acquires or renews the fenced tick-producer lease for one match.
   * A different live owner is never stolen; expired owners can be replaced.
   * @param roomId - Room code
   * @param matchId - Expected match generation
   * @param ownerId - Unique backend instance id
   * @returns Whether this instance may produce ticks
   */
  public async claimOwner(
    roomId: string,
    matchId: string,
    ownerId: string,
  ): Promise<boolean> {
    return this.redisService.withLock(
      [ownerLockKey(roomId)],
      OWNER_LOCK_MS,
      async () => {
        const current = await this.readOwner(roomId);
        const now = Date.now();
        if (
          current?.matchId === matchId &&
          current.ownerId !== ownerId &&
          current.expiresAt > now
        ) {
          return false;
        }
        const lease: OwnerLease = {
          expiresAt: now + DESCENT_OWNER_LEASE_MS,
          matchId,
          ownerId,
        };
        await this.redisService.set(
          ownerStorageKey(roomId),
          JSON.stringify(lease),
          OWNER_LEASE_SECONDS,
        );
        return true;
      },
    );
  }

  /**
   * Releases the lease only if this instance still owns the expected match.
   * @param roomId - Room code
   * @param matchId - Expected match generation
   * @param ownerId - Unique backend instance id
   */
  public async releaseOwner(
    roomId: string,
    matchId: string,
    ownerId: string,
  ): Promise<void> {
    await this.redisService.withLock(
      [ownerLockKey(roomId)],
      OWNER_LOCK_MS,
      async () => {
        const current = await this.readOwner(roomId);
        if (current?.matchId !== matchId || current.ownerId !== ownerId) {
          return;
        }
        await this.redisService.del(ownerStorageKey(roomId));
      },
    );
  }

  /**
   * Serializes and stores one checkpoint with a recovery TTL.
   * @param match - Latest authoritative state
   */
  private async save(match: DescentMatchState): Promise<void> {
    await this.redisService.set(
      matchStorageKey(match.roomId),
      JSON.stringify({ ...match, version: CHECKPOINT_VERSION }),
      CHECKPOINT_TTL_SECONDS,
    );
  }

  /**
   * Reads the current owner lease, treating malformed data as expired.
   * @param roomId - Room code
   * @returns Parsed lease or null
   */
  private async readOwner(roomId: string): Promise<OwnerLease | null> {
    const serialized = await this.redisService.get(ownerStorageKey(roomId));
    if (!serialized) return null;
    try {
      return JSON.parse(serialized) as OwnerLease;
    } catch {
      return null;
    }
  }
}

/** Returns the Redis checkpoint key for one room. */
function matchStorageKey(roomId: string): string {
  return `descent:match:${roomId}`;
}

/** Returns the Redlock resource serializing match mutations. */
function matchLockKey(roomId: string): string {
  return `lock:descent:match:${roomId}`;
}

/** Returns the Redis key holding the fenced tick-producer lease. */
function ownerStorageKey(roomId: string): string {
  return `descent:owner:${roomId}`;
}

/** Returns the Redlock resource serializing owner transitions. */
function ownerLockKey(roomId: string): string {
  return `lock:descent:owner:${roomId}`;
}
