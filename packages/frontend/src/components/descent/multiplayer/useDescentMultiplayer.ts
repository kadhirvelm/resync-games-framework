"use client";

import {
  createInitialDescentRoomState,
  DESCENT_GAME_ID,
  DESCENT_MAX_PLAYERS,
  type DescentAckResult,
  DescentEventsDefinition,
  type DescentRoomState,
  type DescentSyncResult,
  type DescentTickPayload,
  type GameRoomCommandResult,
  type GameRoomPlayerInput,
  type GameRoomValue,
} from "@resync-game-framework/api";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type MultiplayerRoomState,
  type MultiplayerRoomStatus,
  useMultiplayerRoom,
} from "@/services/multiplayer";
import type { AshenCruciblePlayer } from "../data/layers/ashen_crucible";
import type { DescentSim } from "../logic/sim";
import type { SimSpeed } from "../logic/sim/constants";
import type { Command, SimSnapshot } from "../logic/types";
import {
  applyDescentLockstepBatch,
  createDescentLockstepSession,
  type DescentLockstepSession,
} from "./lockstep";

/** React/network lifecycle around one deterministic replay session. */
interface ActiveDescentSession extends DescentLockstepSession {
  queuedTicks: Map<number, DescentTickPayload>;
  roomId: string;
  syncInFlight: boolean;
  synchronizing: boolean;
}

/** State and actions for a Descent co-op multiplayer room and live match. */
export interface UseDescentMultiplayerResult {
  createRoom: () => Promise<void>;
  error: string | null;
  isHost: boolean;
  /** Whether the local player belongs to the locked match roster. */
  isParticipant: boolean;
  joinRoom: (roomCode: string) => Promise<void>;
  /** Returns whether leaving succeeded and the session was discarded. */
  leaveRoom: () => Promise<boolean>;
  matchError: string | null;
  room: MultiplayerRoomState<DescentRoomState> | null;
  sendCommand: (command: Command) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: SimSpeed) => void;
  sim: DescentSim | null;
  snapshot: SimSnapshot | null;
  startMatch: () => Promise<void>;
  status: MultiplayerRoomStatus;
}

/**
 * Creates a replay session with its reconnect and transport bookkeeping.
 * @param roomId - Joined room code
 * @param matchId - Authoritative match id
 * @param players - Locked match roster
 * @param seed - Deterministic map/sim seed
 * @returns A session that waits for its initial sync before applying ticks
 */
function createActiveSession(
  roomId: string,
  matchId: string,
  players: readonly AshenCruciblePlayer[],
  seed: number,
): ActiveDescentSession {
  return {
    ...createDescentLockstepSession({ matchId, players, seed }),
    queuedTicks: new Map<number, DescentTickPayload>(),
    roomId,
    synchronizing: true,
    syncInFlight: false,
  };
}

/**
 * Converts game-command and transport errors into render-safe text.
 * @param error - String game error or structured transport error
 * @returns Player-readable error message
 */
function gameErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "The multiplayer server could not complete that action.";
}

/**
 * Buffers a tick while sync is in flight. Empty clock updates at the same tick
 * coalesce, while command payloads are retained for deterministic replay.
 * @param session - Session waiting for sync
 * @param payload - Tick received during the sync window
 */
function queueTick(
  session: ActiveDescentSession,
  payload: DescentTickPayload,
): void {
  const previous = session.queuedTicks.get(payload.targetTick);
  session.queuedTicks.set(payload.targetTick, {
    ...payload,
    commands:
      previous === undefined
        ? payload.commands
        : [...previous.commands, ...payload.commands],
  });
}

/**
 * Manages a Descent co-op room and replays the authoritative lockstep command
 * stream locally. Reconnects wait for room rejoin plus a full command-log sync,
 * preventing missed commands from being applied on client-specific ticks.
 * @param player - Stable local player identity
 * @returns Room controls, match commands, and live simulation snapshot
 */
export function useDescentMultiplayer(
  player: GameRoomPlayerInput,
): UseDescentMultiplayerResult {
  const initialState = useMemo(() => createInitialDescentRoomState(), []);
  const {
    client,
    createRoom: rawCreateRoom,
    error,
    isHost,
    joinRoom: rawJoinRoom,
    leaveRoom: rawLeaveRoom,
    room,
    status,
  } = useMultiplayerRoom<DescentRoomState>({
    gameId: DESCENT_GAME_ID,
    initialState,
    maxPlayers: DESCENT_MAX_PLAYERS,
    player,
  });

  const [matchError, setMatchError] = useState<string | null>(null);
  const [session, setSession] = useState<ActiveDescentSession | null>(null);
  const sessionRef = useRef<ActiveDescentSession | null>(null);
  sessionRef.current = session;
  const roomRef = useRef(room);
  roomRef.current = room;
  const statusRef = useRef(status);
  statusRef.current = status;
  const mountedRef = useRef(true);

  const gameState = room?.gameState;
  const matchId = gameState?.phase === "playing" ? gameState.matchId : null;
  const seed = gameState?.phase === "playing" ? gameState.seed : null;
  const roster = gameState?.phase === "playing" ? gameState.roster : null;
  const isParticipant =
    gameState?.phase !== "playing" ||
    gameState.roster.some((entry) => entry.id === player.id);

  /** Commits a replacement replay session to both React and socket callbacks. */
  const commitSession = useCallback((next: ActiveDescentSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  // Create or tear down the deterministic sim when a match begins or ends.
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId || matchId === null || seed === null || roster === null) {
      commitSession(null);
      return;
    }
    if (sessionRef.current?.matchId === matchId) return;

    commitSession(createActiveSession(roomId, matchId, roster, seed));
    setMatchError(null);
  }, [commitSession, matchId, room?.id, roster, seed]);

  /**
   * Synchronizes one session after match start, reconnect, or a detected gap.
   * A full replay constructs a fresh sim so every command runs at its original
   * tick; ticks arriving during the request are drained afterward in order.
   */
  const synchronize = useCallback(
    async (active: ActiveDescentSession): Promise<void> => {
      if (
        active.syncInFlight ||
        !active.synchronizing ||
        statusRef.current !== "joined"
      ) {
        return;
      }
      active.syncInFlight = true;
      const response = await client.sendGameCommand<DescentSyncResult>(
        DescentEventsDefinition.clientToServer.descentSync,
        { fromTick: 0, matchId: active.matchId, roomId: active.roomId },
      );
      if (!mountedRef.current || sessionRef.current !== active) return;
      active.syncInFlight = false;
      if (statusRef.current !== "joined") {
        active.synchronizing = true;
        return;
      }

      if (!response.ok) {
        setMatchError(gameErrorMessage(response.error));
        globalThis.setTimeout(() => {
          if (
            mountedRef.current &&
            sessionRef.current === active &&
            statusRef.current === "joined"
          ) {
            void synchronizeRef.current?.(active);
          }
        }, 500);
        return;
      }
      if (response.matchId !== active.matchId) {
        active.queuedTicks.clear();
        active.synchronizing = false;
        setMatchError(
          "This match is no longer running. The host can restart it, or you can leave the room.",
        );
        return;
      }

      const canReuseFreshSim =
        active.sim.tick === 0 && active.appliedSeqs.size === 0;
      const next = canReuseFreshSim
        ? active
        : createActiveSession(
            active.roomId,
            active.matchId,
            active.players,
            active.seed,
          );
      if (next !== active) next.queuedTicks = active.queuedTicks;

      let result = applyDescentLockstepBatch(next, response);
      const queued = [...next.queuedTicks.values()].sort(
        (left, right) => left.targetTick - right.targetTick,
      );
      for (const tick of queued) {
        if (result === "resync-required") break;
        result = applyDescentLockstepBatch(next, tick);
      }
      if (result === "resync-required") {
        setMatchError("Could not replay the match command history.");
        return;
      }

      next.queuedTicks.clear();
      next.syncInFlight = false;
      next.synchronizing = false;
      if (next !== active) commitSession(next);
      setMatchError(null);
    },
    [client, commitSession],
  );
  const synchronizeRef = useRef(synchronize);
  synchronizeRef.current = synchronize;

  // Buffer ticks during sync and detect commands that require full replay.
  useEffect(() => {
    if (!room?.id || !matchId) return;
    return client.onGameEvent<DescentTickPayload>(
      DescentEventsDefinition.serverToClient.descentTick,
      (payload) => {
        const active = sessionRef.current;
        if (active === null || payload.matchId !== active.matchId) return;
        if (active.synchronizing) {
          queueTick(active, payload);
          return;
        }
        const result = applyDescentLockstepBatch(active, payload);
        if (result === "applied") return;
        active.synchronizing = true;
        void synchronizeRef.current?.(active);
      },
    );
  }, [client, matchId, room?.id]);

  // Sync only after the shared room hook has completed its Socket.IO rejoin.
  useEffect(() => {
    const active = sessionRef.current;
    if (!active || !room?.id || !matchId) return;
    if (status !== "joined") {
      active.synchronizing = true;
      return;
    }
    if (active.synchronizing) void synchronize(active);
  }, [matchId, room?.id, status, synchronize]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current = null;
    };
  }, []);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (session === null) return () => {};
      return session.sim.subscribe(listener);
    },
    [session],
  );
  const getSnapshot = useCallback(
    (): SimSnapshot | null => session?.sim.snapshot() ?? null,
    [session],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const createRoom = useCallback(async () => {
    setMatchError(null);
    await rawCreateRoom();
  }, [rawCreateRoom]);

  const joinRoom = useCallback(
    async (roomCode: string) => {
      setMatchError(null);
      await rawJoinRoom(roomCode);
    },
    [rawJoinRoom],
  );

  const leaveRoom = useCallback(async (): Promise<boolean> => {
    setMatchError(null);
    const result = await rawLeaveRoom();
    if (result !== null && !result.ok) {
      setMatchError(gameErrorMessage(result.error));
      return false;
    }
    commitSession(null);
    return true;
  }, [commitSession, rawLeaveRoom]);

  const startMatch = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;
    setMatchError(null);
    const result = await client.sendGameCommand<GameRoomCommandResult>(
      DescentEventsDefinition.clientToServer.descentStartMatch,
      { roomId: currentRoom.id },
    );
    if (!result.ok) setMatchError(result.error.message);
  }, [client]);

  const sendCommand = useCallback(
    (command: Command) => {
      const currentRoom = roomRef.current;
      const activeMatchId =
        currentRoom?.gameState.phase === "playing"
          ? currentRoom.gameState.matchId
          : null;
      if (!currentRoom || !activeMatchId) return;
      if (!isParticipant) {
        setMatchError("Spectators can watch but cannot issue match commands.");
        return;
      }
      void client
        .sendGameCommand<DescentAckResult>(
          DescentEventsDefinition.clientToServer.descentCommand,
          {
            command: command as unknown as GameRoomValue,
            matchId: activeMatchId,
            roomId: currentRoom.id,
          },
        )
        .then((ack) => {
          if (!ack.ok) setMatchError(gameErrorMessage(ack.error));
        });
    },
    [client, isParticipant],
  );

  const setPaused = useCallback(
    (paused: boolean) => {
      const active = sessionRef.current;
      if (!active) return;
      if (!isParticipant) {
        setMatchError("Spectators cannot change the match clock.");
        return;
      }
      void client
        .sendGameCommand<DescentAckResult>(
          DescentEventsDefinition.clientToServer.descentSetPaused,
          { matchId: active.matchId, paused, roomId: active.roomId },
        )
        .then((ack) => {
          if (!ack.ok) setMatchError(gameErrorMessage(ack.error));
        });
    },
    [client, isParticipant],
  );

  const setSpeed = useCallback(
    (speed: SimSpeed) => {
      const active = sessionRef.current;
      if (!active) return;
      if (!isParticipant) {
        setMatchError("Spectators cannot change the match clock.");
        return;
      }
      void client
        .sendGameCommand<DescentAckResult>(
          DescentEventsDefinition.clientToServer.descentSetSpeed,
          { matchId: active.matchId, roomId: active.roomId, speed },
        )
        .then((ack) => {
          if (!ack.ok) setMatchError(gameErrorMessage(ack.error));
        });
    },
    [client, isParticipant],
  );

  return {
    createRoom,
    error,
    isHost,
    isParticipant,
    joinRoom,
    leaveRoom,
    matchError,
    room,
    sendCommand,
    setPaused,
    setSpeed,
    sim: session?.sim ?? null,
    snapshot,
    startMatch,
    status,
  };
}
