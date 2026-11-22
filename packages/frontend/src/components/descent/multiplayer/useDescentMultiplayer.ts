"use client";

import {
  createInitialDescentRoomState,
  DESCENT_GAME_ID,
  DESCENT_MAX_PLAYERS,
  type DescentAckResult,
  DescentEventsDefinition,
  type DescentMapId,
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
import { readDescentCampaignOutcome } from "./campaignOutcome";
import {
  applyDescentLockstepBatch,
  createDescentLockstepSession,
  type DescentLockstepSession,
} from "./lockstep";
import { syncDescentRoomInUrl } from "./roomLocation";

const AUTO_JOIN_RETRY_LIMIT = 5;
const AUTO_JOIN_RETRY_DELAY_MS = 300;

/** Optional configuration for Descent multiplayer room lifecycle. */
export interface UseDescentMultiplayerOptions {
  /** Room code from the page URL to rejoin automatically once connected. */
  initialRoomCode?: string | null;
}

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
  /** Room code currently being rejoined automatically from the page URL. */
  rejoiningRoomId: string | null;
  room: MultiplayerRoomState<DescentRoomState> | null;
  sendCommand: (command: Command) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: SimSpeed) => void;
  sim: DescentSim | null;
  snapshot: SimSnapshot | null;
  startMatch: (mapId?: DescentMapId) => Promise<void>;
  /** Requests a host-owned campaign transition for the current mission. */
  startCampaignAction: (action: "start" | "retry" | "advance") => Promise<void>;
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
  mapId: DescentMapId,
): ActiveDescentSession {
  return {
    ...createDescentLockstepSession({ mapId, matchId, players, seed }),
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
 * Detects the transient fast-refresh race where the previous tab's socket has
 * not finished disconnecting on the server before the refreshed tab rejoins.
 * @param code - Room command error code
 * @param message - Room command error message
 * @returns Whether retrying the join shortly is safe
 */
function isAlreadyConnectedError(code: string, message: string): boolean {
  return (
    code === "INVALID_REQUEST" &&
    message.toLowerCase().includes("already connected")
  );
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
 * @param options - Optional initial room code from the page URL
 * @returns Room controls, match commands, and live simulation snapshot
 */
export function useDescentMultiplayer(
  player: GameRoomPlayerInput,
  options?: UseDescentMultiplayerOptions,
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
  const [pendingRoomCode, setPendingRoomCode] = useState<string | null>(
    () => options?.initialRoomCode ?? null,
  );
  const [session, setSession] = useState<ActiveDescentSession | null>(null);
  const pendingRoomCodeRef = useRef(pendingRoomCode);
  pendingRoomCodeRef.current = pendingRoomCode;
  const autoJoinInFlightRef = useRef(false);
  const sessionRef = useRef<ActiveDescentSession | null>(null);
  sessionRef.current = session;
  const roomRef = useRef(room);
  roomRef.current = room;
  const statusRef = useRef(status);
  statusRef.current = status;
  const mountedRef = useRef(true);

  const gameState = room?.gameState;
  const matchId = gameState?.phase === "playing" ? gameState.matchId : null;
  const mapId: DescentMapId = gameState?.mapId ?? "ashen_crucible";
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

  // Keep the active room code in the URL so refreshing returns to this room.
  useEffect(() => {
    if (room?.id) {
      syncDescentRoomInUrl(room.id);
    }
  }, [room?.id]);

  // Automatically rejoin a room code present in the URL once connected.
  useEffect(() => {
    const targetRoomCode = pendingRoomCode;
    if (
      targetRoomCode === null ||
      room !== null ||
      status !== "connected" ||
      autoJoinInFlightRef.current
    ) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    autoJoinInFlightRef.current = true;

    const attemptJoin = async (attempt: number): Promise<void> => {
      const result = await rawJoinRoom(targetRoomCode);
      if (
        cancelled ||
        !mountedRef.current ||
        pendingRoomCodeRef.current !== targetRoomCode
      ) {
        autoJoinInFlightRef.current = false;
        return;
      }

      if (result.ok) {
        autoJoinInFlightRef.current = false;
        setPendingRoomCode(null);
        return;
      }

      if (
        attempt < AUTO_JOIN_RETRY_LIMIT &&
        isAlreadyConnectedError(result.error.code, result.error.message)
      ) {
        retryTimer = globalThis.setTimeout(() => {
          void attemptJoin(attempt + 1);
        }, AUTO_JOIN_RETRY_DELAY_MS);
        return;
      }

      autoJoinInFlightRef.current = false;
      setPendingRoomCode(null);
      syncDescentRoomInUrl(null);
    };

    void attemptJoin(0);
    return () => {
      cancelled = true;
      autoJoinInFlightRef.current = false;
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
    };
  }, [pendingRoomCode, rawJoinRoom, room, status]);

  // Create or tear down the deterministic sim when a match begins or ends.
  useEffect(() => {
    const roomId = room?.id;
    if (!roomId || matchId === null || seed === null || roster === null) {
      commitSession(null);
      return;
    }
    if (sessionRef.current?.matchId === matchId) return;

    commitSession(createActiveSession(roomId, matchId, roster, seed, mapId));
    setMatchError(null);
  }, [commitSession, mapId, matchId, room?.id, roster, seed]);

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
            active.mapId,
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

  const terminalOutcome = readDescentCampaignOutcome(
    snapshot,
    session?.matchId ?? null,
    matchId,
  );
  const reportedOutcome = gameState?.campaign?.outcomes[player.id];

  // Outcomes come from deterministic replay, never a victory button. Retry lost
  // acknowledgements until room state confirms the report, including reconnects.
  useEffect(() => {
    if (
      !room?.id ||
      !matchId ||
      !gameState?.campaign ||
      !isParticipant ||
      !terminalOutcome ||
      reportedOutcome === terminalOutcome ||
      status !== "joined"
    )
      return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    /** Reports this client's replay outcome and retries transient failures. */
    const report = async (): Promise<void> => {
      const result = await client.sendGameCommand<GameRoomCommandResult>(
        DescentEventsDefinition.clientToServer.descentReportOutcome,
        { matchId, outcome: terminalOutcome, roomId: room.id },
      );
      if (cancelled) return;
      if (!result.ok) setMatchError(result.error.message);
      retryTimer = globalThis.setTimeout(() => void report(), 1500);
    };
    void report();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) globalThis.clearTimeout(retryTimer);
    };
  }, [
    client,
    gameState?.campaign,
    isParticipant,
    matchId,
    reportedOutcome,
    room?.id,
    status,
    terminalOutcome,
  ]);

  const createRoom = useCallback(async () => {
    setMatchError(null);
    setPendingRoomCode(null);
    await rawCreateRoom();
  }, [rawCreateRoom]);

  const joinRoom = useCallback(
    async (roomCode: string) => {
      setMatchError(null);
      setPendingRoomCode(null);
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
    setPendingRoomCode(null);
    syncDescentRoomInUrl(null);
    commitSession(null);
    return true;
  }, [commitSession, rawLeaveRoom]);

  const startMatch = useCallback(
    async (selectedMapId?: DescentMapId) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      setMatchError(null);
      const result = await client.sendGameCommand<GameRoomCommandResult>(
        DescentEventsDefinition.clientToServer.descentStartMatch,
        {
          campaignAction:
            selectedMapId === "ashen_campaign_1" ? "start" : undefined,
          mapId: selectedMapId ?? currentRoom.gameState.mapId,
          roomId: currentRoom.id,
        },
      );
      if (!result.ok) setMatchError(result.error.message);
    },
    [client],
  );

  /** Requests a campaign transition fenced to the latest match identity. */
  const startCampaignAction = useCallback(
    async (campaignAction: "start" | "retry" | "advance"): Promise<void> => {
      const currentRoom = roomRef.current;
      if (!currentRoom) return;
      setMatchError(null);
      const result = await client.sendGameCommand<GameRoomCommandResult>(
        DescentEventsDefinition.clientToServer.descentStartMatch,
        {
          campaignAction,
          matchId: currentRoom.gameState.matchId,
          roomId: currentRoom.id,
        },
      );
      if (!result.ok) setMatchError(result.error.message);
    },
    [client],
  );

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
    rejoiningRoomId: room === null ? pendingRoomCode : null,
    room,
    sendCommand,
    setPaused,
    setSpeed,
    sim: session?.sim ?? null,
    snapshot,
    startCampaignAction,
    startMatch,
    status,
  };
}
