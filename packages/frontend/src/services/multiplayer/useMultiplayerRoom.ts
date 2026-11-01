"use client";

import type { GameRoomPlayerInput } from "@towers-of-coreborn/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type MultiplayerCommandResult,
  MultiplayerRoomClient,
  type MultiplayerRoomState,
} from "./multiplayerRoomClient";

/** Connection and room lifecycle visible to multiplayer UI. */
export type MultiplayerRoomStatus =
  | "connected"
  | "connecting"
  | "error"
  | "joined"
  | "reconnecting";

/** Configuration shared by every use of the multiplayer room hook. */
export interface UseMultiplayerRoomOptions<State> {
  /** Backend origin; defaults to the frontend's standard API URL. */
  apiUrl?: string;
  /** Stable id from the game experience catalog or route. */
  gameId: string;
  /** State used only when this client creates a new room. */
  initialState: State;
  /** Capacity used only when this client creates a new room. */
  maxPlayers?: number;
  /** Stable player id and current display name. */
  player: GameRoomPlayerInput;
}

/** State and commands returned to a multiplayer game component. */
export interface UseMultiplayerRoomResult<State> {
  /** Creates and joins a new room. */
  createRoom: () => Promise<MultiplayerCommandResult<State>>;
  /** Latest connection or command error, cleared by the next command. */
  error: string | null;
  /** Whether the current player owns lobby/game host responsibilities. */
  isHost: boolean;
  /** Joins a room by code. */
  joinRoom: (roomId: string) => Promise<MultiplayerCommandResult<State>>;
  /** Leaves the current room. */
  leaveRoom: () => Promise<MultiplayerCommandResult<State> | null>;
  /** Latest authoritative room snapshot. */
  room: MultiplayerRoomState<State> | null;
  /** Current socket and room lifecycle. */
  status: MultiplayerRoomStatus;
  /** Replaces the game-owned state using the current room revision. */
  updateGameState: (
    gameState: State,
  ) => Promise<MultiplayerCommandResult<State> | null>;
}

/**
 * Connects a React game to the shared multiplayer gateway. The hook owns
 * reconnect/rejoin behavior, room snapshots, optimistic revisions, and errors.
 * @param options - Stable game id, player identity, initial state, and capacity
 * @returns Current room plus create, join, leave, and state update commands
 */
export function useMultiplayerRoom<State>(
  options: UseMultiplayerRoomOptions<State>,
): UseMultiplayerRoomResult<State> {
  const [client] = useState(
    () => new MultiplayerRoomClient<State>(options.apiUrl),
  );
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<MultiplayerRoomState<State> | null>(null);
  const [status, setStatus] = useState<MultiplayerRoomStatus>("connecting");
  const roomRef = useRef<MultiplayerRoomState<State> | null>(null);
  const joinedRoomIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const applyResult = useCallback(
    (result: MultiplayerCommandResult<State>): void => {
      if (!result.ok) {
        setError(result.error.message);
        if (result.room) {
          roomRef.current = result.room;
          setRoom(result.room);
        }
        return;
      }

      setError(null);
      roomRef.current = result.room;
      joinedRoomIdRef.current = result.room?.id ?? null;
      setRoom(result.room);
      setStatus(result.room ? "joined" : "connected");
    },
    [],
  );

  const clearCurrentRoom = useCallback((): void => {
    roomRef.current = null;
    joinedRoomIdRef.current = null;
    setRoom(null);
    setStatus("connected");
  }, []);

  useEffect(() => {
    const removeConnectionListener = client.onConnectionChange((connected) => {
      if (!connected) {
        setStatus(joinedRoomIdRef.current ? "reconnecting" : "connecting");
        return;
      }

      const joinedRoomId = joinedRoomIdRef.current;
      if (!joinedRoomId) {
        setError(null);
        setStatus("connected");
        return;
      }

      void client
        .joinRoom({
          gameId: optionsRef.current.gameId,
          player: optionsRef.current.player,
          roomId: joinedRoomId,
        })
        .then(applyResult);
    });
    const removeErrorListener = client.onError((message) => {
      setError(message);
      setStatus(joinedRoomIdRef.current ? "reconnecting" : "error");
    });
    const removeRoomListener = client.onRoomState((nextRoom) => {
      if (nextRoom.gameId !== optionsRef.current.gameId) {
        return;
      }
      if (joinedRoomIdRef.current && nextRoom.id !== joinedRoomIdRef.current) {
        return;
      }
      roomRef.current = nextRoom;
      joinedRoomIdRef.current = nextRoom.id;
      setRoom(nextRoom);
      setError(null);
      setStatus("joined");
    });

    client.connect();
    return () => {
      removeConnectionListener();
      removeErrorListener();
      removeRoomListener();
      client.disconnect();
    };
  }, [applyResult, client]);

  const createRoom = useCallback(async () => {
    setError(null);
    const currentRoom = roomRef.current;
    if (currentRoom) {
      const leaveResult = await client.leaveRoom({ roomId: currentRoom.id });
      if (!leaveResult.ok) {
        applyResult(leaveResult);
        return leaveResult;
      }
      clearCurrentRoom();
    }

    const result = await client.createRoom({
      gameId: options.gameId,
      initialState: options.initialState,
      maxPlayers: options.maxPlayers,
      player: options.player,
    });
    applyResult(result);
    return result;
  }, [applyResult, clearCurrentRoom, client, options]);

  const joinRoom = useCallback(
    async (roomId: string) => {
      setError(null);
      const currentRoom = roomRef.current;
      if (currentRoom && currentRoom.id !== roomId.trim().toUpperCase()) {
        const leaveResult = await client.leaveRoom({
          roomId: currentRoom.id,
        });
        if (!leaveResult.ok) {
          applyResult(leaveResult);
          return leaveResult;
        }
        clearCurrentRoom();
      }

      const result = await client.joinRoom({
        gameId: options.gameId,
        player: options.player,
        roomId,
      });
      applyResult(result);
      return result;
    },
    [applyResult, clearCurrentRoom, client, options.gameId, options.player],
  );

  const leaveRoom = useCallback(async () => {
    const currentRoom = roomRef.current;
    if (!currentRoom) {
      return null;
    }

    setError(null);
    const result = await client.leaveRoom({ roomId: currentRoom.id });
    if (result.ok) {
      clearCurrentRoom();
    } else {
      applyResult(result);
    }
    return result;
  }, [applyResult, clearCurrentRoom, client]);

  const updateGameState = useCallback(
    async (gameState: State) => {
      const currentRoom = roomRef.current;
      if (!currentRoom) {
        setError("Join a multiplayer room before updating game state.");
        return null;
      }

      setError(null);
      const result = await client.updateRoomState({
        expectedRevision: currentRoom.revision,
        gameState,
        roomId: currentRoom.id,
      });
      applyResult(result);
      return result;
    },
    [applyResult, client],
  );

  return {
    createRoom,
    error,
    isHost: room?.hostPlayerId === options.player.id,
    joinRoom,
    leaveRoom,
    room,
    status,
    updateGameState,
  };
}
