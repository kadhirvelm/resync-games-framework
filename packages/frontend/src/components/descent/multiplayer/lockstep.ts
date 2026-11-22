import type {
  DescentStampedCommand,
  DescentTickPayload,
} from "@resync-game-framework/api";
import type { AshenCruciblePlayer } from "../data/layers/ashen_crucible";
import { createMultiplayerDescentSim } from "../logic/ashenGateSlice";
import type { DescentSim } from "../logic/sim";
import { isSimSpeed } from "../logic/sim/constants";
import type { Command } from "../logic/types";

/** Clock and command fields shared by tick broadcasts and sync responses. */
export type DescentLockstepBatch = Pick<
  DescentTickPayload,
  "commands" | "paused" | "speed" | "targetTick"
>;

/** Mutable deterministic replay state for one multiplayer match. */
export interface DescentLockstepSession {
  /** Commands already received, including commands scheduled for a later tick. */
  appliedSeqs: Set<number>;
  /** Whether a terminal sim pause stopped replay before the server target. */
  halted: boolean;
  matchId: string;
  pendingByTick: Map<number, DescentStampedCommand[]>;
  players: readonly AshenCruciblePlayer[];
  seed: number;
  /** Last pause state requested by the server, distinct from a terminal pause. */
  serverPaused: boolean;
  sim: DescentSim;
}

/** Result of applying one authoritative batch. */
export type DescentLockstepApplyResult = "applied" | "resync-required";

/** Construction options for one deterministic multiplayer replay session. */
export interface CreateDescentLockstepSessionOptions {
  matchId: string;
  players: readonly AshenCruciblePlayer[];
  seed: number;
  /** Test/custom sim override; production creates the Ashen Crucible sim. */
  sim?: DescentSim;
}

/**
 * Creates a fresh deterministic lockstep session at tick zero.
 * @param options - Match identity, locked roster, seed, and optional sim
 * @returns A ready replay session
 */
export function createDescentLockstepSession(
  options: CreateDescentLockstepSessionOptions,
): DescentLockstepSession {
  return {
    appliedSeqs: new Set<number>(),
    halted: false,
    matchId: options.matchId,
    pendingByTick: new Map<number, DescentStampedCommand[]>(),
    players: options.players,
    seed: options.seed,
    serverPaused: false,
    sim:
      options.sim ??
      createMultiplayerDescentSim({
        players: options.players,
        seed: options.seed,
      }),
  };
}

/**
 * Applies authoritative commands at their original ticks and advances toward
 * the server clock. Empty spans are coalesced into one `sim.step` call, which
 * avoids a full snapshot/subscriber notification for every intermediate tick.
 * A command first observed after its scheduled tick requires a full replay;
 * it is never silently moved to a different tick on one client.
 * @param session - Session mutated in place
 * @param batch - Authoritative clock, pause, speed, and command batch
 * @returns `applied`, or `resync-required` when tick zero replay is necessary
 */
export function applyDescentLockstepBatch(
  session: DescentLockstepSession,
  batch: DescentLockstepBatch,
): DescentLockstepApplyResult {
  if (!validBatch(batch)) return "resync-required";

  const freshCommands = batch.commands.filter(
    (entry) => !session.appliedSeqs.has(entry.seq),
  );
  if (batch.targetTick < session.sim.tick) {
    return freshCommands.length === 0 ? "applied" : "resync-required";
  }
  if (
    freshCommands.some(
      (entry) => !validCommandStamp(entry) || entry.tick <= session.sim.tick,
    )
  ) {
    return "resync-required";
  }

  scheduleCommands(session, freshCommands);
  updateClockModifiers(session, batch);
  const result = advanceSession(session, batch.targetTick);
  if (batch.paused) session.sim.setPaused(true);
  return result;
}

/**
 * Checks the authoritative batch before touching deterministic state.
 * @param batch - Candidate tick or sync payload
 * @returns Whether clock and speed values are safe to replay
 */
function validBatch(batch: DescentLockstepBatch): boolean {
  return (
    Number.isSafeInteger(batch.targetTick) &&
    batch.targetTick >= 0 &&
    isSimSpeed(batch.speed) &&
    typeof batch.paused === "boolean" &&
    Array.isArray(batch.commands)
  );
}

/**
 * Checks a command envelope from the server.
 * @param entry - Stamped command candidate
 * @returns Whether its sequence and tick are positive safe integers
 */
function validCommandStamp(entry: DescentStampedCommand): boolean {
  return (
    Number.isSafeInteger(entry.seq) &&
    entry.seq > 0 &&
    Number.isSafeInteger(entry.tick) &&
    entry.tick > 0 &&
    typeof entry.playerId === "string"
  );
}

/**
 * Adds newly received commands to the tick schedule and deduplication set.
 * @param session - Session being updated
 * @param commands - Commands not previously received
 */
function scheduleCommands(
  session: DescentLockstepSession,
  commands: readonly DescentStampedCommand[],
): void {
  for (const entry of commands) {
    session.appliedSeqs.add(entry.seq);
    const bucket = session.pendingByTick.get(entry.tick);
    if (bucket === undefined) {
      session.pendingByTick.set(entry.tick, [entry]);
      continue;
    }
    bucket.push(entry);
  }
}

/**
 * Applies speed and server pause transitions without clearing a sim-owned
 * terminal pause. A paused client may still need to catch up to the last tick
 * the server authorized before pausing.
 * @param session - Session being updated
 * @param batch - Authoritative pause and speed values
 */
function updateClockModifiers(
  session: DescentLockstepSession,
  batch: DescentLockstepBatch,
): void {
  session.sim.setSpeed(batch.speed);
  const mustCatchUp = session.sim.tick < batch.targetTick;
  const shouldResume =
    !session.halted &&
    session.sim.paused &&
    ((!batch.paused && session.serverPaused) ||
      (batch.paused && session.serverPaused && mustCatchUp));
  if (shouldResume) session.sim.setPaused(false);
  session.serverPaused = batch.paused;
}

/**
 * Advances empty spans in large steps and command ticks individually.
 * @param session - Session with a populated command schedule
 * @param targetTick - Highest server-authorized tick
 * @returns Whether all commands remained on their authoritative ticks
 */
function advanceSession(
  session: DescentLockstepSession,
  targetTick: number,
): DescentLockstepApplyResult {
  while (session.sim.tick < targetTick && !session.halted) {
    const nextCommandTick = nextScheduledTick(session);
    if (nextCommandTick <= session.sim.tick) return "resync-required";

    const beforeCommand = Math.min(targetTick, nextCommandTick - 1);
    if (beforeCommand > session.sim.tick) {
      stepSession(session, beforeCommand - session.sim.tick);
      continue;
    }

    if (nextCommandTick !== session.sim.tick + 1) {
      stepSession(session, targetTick - session.sim.tick);
      continue;
    }

    const due = session.pendingByTick.get(nextCommandTick) ?? [];
    session.pendingByTick.delete(nextCommandTick);
    due.sort((left, right) => left.seq - right.seq);
    for (const entry of due) {
      session.sim.enqueue({
        ...(entry.command as unknown as Command),
        actorId: entry.playerId,
      });
    }
    stepSession(session, 1);
  }
  return "applied";
}

/**
 * Finds the earliest pending command tick.
 * @param session - Session whose schedule should be inspected
 * @returns Earliest tick, or positive infinity when no commands are pending
 */
function nextScheduledTick(session: DescentLockstepSession): number {
  let earliest = Number.POSITIVE_INFINITY;
  for (const tick of session.pendingByTick.keys()) {
    earliest = Math.min(earliest, tick);
  }
  return earliest;
}

/**
 * Advances one coalesced span and records a terminal sim pause.
 * @param session - Session to advance
 * @param count - Number of ticks requested
 */
function stepSession(session: DescentLockstepSession, count: number): void {
  if (count <= 0) return;
  session.sim.step(count);
  if (session.sim.paused) session.halted = true;
}
