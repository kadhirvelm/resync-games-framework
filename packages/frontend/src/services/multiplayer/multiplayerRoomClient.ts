import type {
  CreateGameRoomPayload,
  GameRoomCommandError,
  GameRoomCommandResult,
  GameRoomState,
  GameRoomValue,
  JoinGameRoomPayload,
  LeaveGameRoomPayload,
  UpdateGameRoomStatePayload,
} from "@resync-game-framework/api";
import { RoomEventsDefinition } from "@resync-game-framework/api";
import { io, type Socket } from "socket.io-client";

const COMMAND_TIMEOUT_MS = 8_000;

interface RoomServerEvents {
  roomStateChanged: (room: GameRoomState) => void;
}

interface RoomClientEvents {
  createRoom: (
    payload: CreateGameRoomPayload,
    acknowledge: (result: GameRoomCommandResult) => void,
  ) => void;
  joinRoom: (
    payload: JoinGameRoomPayload,
    acknowledge: (result: GameRoomCommandResult) => void,
  ) => void;
  leaveRoom: (
    payload: LeaveGameRoomPayload,
    acknowledge: (result: GameRoomCommandResult) => void,
  ) => void;
  updateRoomState: (
    payload: UpdateGameRoomStatePayload,
    acknowledge: (result: GameRoomCommandResult) => void,
  ) => void;
}

/** A room snapshot whose game-owned state has the caller's concrete type. */
export type MultiplayerRoomState<State> = Omit<GameRoomState, "gameState"> & {
  gameState: State;
};

/** A typed acknowledgement returned to a game using the multiplayer client. */
export type MultiplayerCommandResult<State> =
  | {
      ok: true;
      room: MultiplayerRoomState<State> | null;
    }
  | {
      error: GameRoomCommandError;
      ok: false;
      room?: MultiplayerRoomState<State>;
    };

/**
 * Typed Socket.IO client for the shared game-room gateway. Games normally use
 * `useMultiplayerRoom`; this class is available to non-React game runtimes.
 */
export class MultiplayerRoomClient<State> {
  private readonly connectionListeners = new Set<
    (connected: boolean) => void
  >();
  private readonly errorListeners = new Set<(message: string) => void>();
  private readonly roomListeners = new Set<
    (room: MultiplayerRoomState<State>) => void
  >();
  private readonly socket: Socket<RoomServerEvents, RoomClientEvents>;

  /**
   * Creates a lazy Socket.IO client for the configured backend origin.
   * @param apiUrl - Backend URL used by the existing frontend service layer
   */
  public constructor(apiUrl = process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "") {
    this.socket = io(apiUrl, {
      autoConnect: false,
      withCredentials: true,
    });
    this.socket.on("connect", this.handleConnect);
    this.socket.on("disconnect", this.handleDisconnect);
    this.socket.on("connect_error", this.handleConnectError);
    this.socket.on(
      RoomEventsDefinition.serverToClient.roomStateChanged,
      this.handleRoomStateChanged,
    );
  }

  /**
   * Opens the socket; Socket.IO also reconnects it after transient failures.
   * @returns Nothing; connection changes arrive through subscribers
   */
  public connect(): void {
    this.socket.connect();
  }

  /**
   * Closes the socket and releases all local listeners.
   * @returns Nothing after the disconnect is requested
   */
  public disconnect(): void {
    this.socket.off("connect", this.handleConnect);
    this.socket.off("disconnect", this.handleDisconnect);
    this.socket.off("connect_error", this.handleConnectError);
    this.socket.off(
      RoomEventsDefinition.serverToClient.roomStateChanged,
      this.handleRoomStateChanged,
    );
    this.socket.disconnect();
    this.connectionListeners.clear();
    this.errorListeners.clear();
    this.roomListeners.clear();
  }

  /**
   * Subscribes to connection changes.
   * @param listener - Called with `true` while the socket is connected
   * @returns A function that removes the listener
   */
  public onConnectionChange(
    listener: (connected: boolean) => void,
  ): () => void {
    this.connectionListeners.add(listener);
    listener(this.socket.connected);
    return () => this.connectionListeners.delete(listener);
  }

  /**
   * Subscribes to connection and command failures.
   * @param listener - Called with a user-readable error message
   * @returns A function that removes the listener
   */
  public onError(listener: (message: string) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Subscribes to authoritative room snapshots.
   * @param listener - Called after room membership or game state changes
   * @returns A function that removes the listener
   */
  public onRoomState(
    listener: (room: MultiplayerRoomState<State>) => void,
  ): () => void {
    this.roomListeners.add(listener);
    return () => this.roomListeners.delete(listener);
  }

  /**
   * Subscribes to one game-specific event on the room's existing socket.
   * @param event - Stable server event name
   * @param listener - Typed private-event receiver
   * @returns A function that removes the listener
   */
  public onGameEvent<Payload>(
    event: string,
    listener: (payload: Payload) => void,
  ): () => void {
    const socket = this.socket as unknown as {
      on: (name: string, receive: (payload: Payload) => void) => void;
      off: (name: string, receive: (payload: Payload) => void) => void;
    };
    socket.on(event, listener);
    return () => socket.off(event, listener);
  }

  /**
   * Sends one acknowledged game-specific command over the membership socket.
   * @param event - Stable client command name
   * @param payload - JSON-safe command payload
   * @returns Typed acknowledgement or a bounded timeout failure
   */
  public sendGameCommand<Result>(
    event: string,
    payload: unknown,
  ): Promise<Result> {
    return new Promise((resolve) => {
      const commandSocket = this.socket.timeout(
        COMMAND_TIMEOUT_MS,
      ) as unknown as {
        emitWithAck: (name: string, value: unknown) => Promise<Result>;
      };
      void commandSocket
        .emitWithAck(event, payload)
        .then(resolve)
        .catch(() => {
          resolve({
            error: {
              code: "TIMEOUT",
              message: "The game server did not respond in time.",
            },
            ok: false,
          } as Result);
        });
    });
  }

  /**
   * Creates a room and joins it as host.
   * @param payload - Game, player, capacity, and initial state
   * @returns Acknowledgement containing the created room
   */
  public createRoom(
    payload: Omit<CreateGameRoomPayload, "initialState"> & {
      initialState: State;
    },
  ): Promise<MultiplayerCommandResult<State>> {
    return this.sendCommand(RoomEventsDefinition.clientToServer.createRoom, {
      ...payload,
      initialState: payload.initialState as GameRoomValue,
    });
  }

  /**
   * Joins an existing room by its short code.
   * @param payload - Game, player, and room code
   * @returns Acknowledgement containing the joined room
   */
  public joinRoom(
    payload: JoinGameRoomPayload,
  ): Promise<MultiplayerCommandResult<State>> {
    return this.sendCommand(
      RoomEventsDefinition.clientToServer.joinRoom,
      payload,
    );
  }

  /**
   * Leaves the current room membership without closing the socket.
   * @param payload - Room code to leave
   * @returns Acknowledgement containing any remaining room snapshot
   */
  public leaveRoom(
    payload: LeaveGameRoomPayload,
  ): Promise<MultiplayerCommandResult<State>> {
    return this.sendCommand(
      RoomEventsDefinition.clientToServer.leaveRoom,
      payload,
    );
  }

  /**
   * Replaces the room's game state at an expected revision.
   * @param payload - Room code, next state, and rendered revision
   * @returns Updated room or a recoverable conflict
   */
  public updateRoomState(
    payload: Omit<UpdateGameRoomStatePayload, "gameState"> & {
      gameState: State;
    },
  ): Promise<MultiplayerCommandResult<State>> {
    return this.sendCommand(
      RoomEventsDefinition.clientToServer.updateRoomState,
      {
        ...payload,
        gameState: payload.gameState as GameRoomValue,
      },
    );
  }

  /**
   * Emits one acknowledged command and applies a bounded response timeout.
   * @param event - Shared room command name
   * @param payload - Command payload sent to the gateway
   * @returns Typed command acknowledgement
   */
  private sendCommand(
    event: keyof RoomClientEvents,
    payload: unknown,
  ): Promise<MultiplayerCommandResult<State>> {
    return new Promise((resolve) => {
      let completed = false;
      const timeout = globalThis.setTimeout(() => {
        completed = true;
        const message = "The multiplayer server did not respond in time.";
        this.notifyError(message);
        resolve({
          error: { code: "INVALID_REQUEST", message },
          ok: false,
        });
      }, COMMAND_TIMEOUT_MS);

      const commandSocket = this.socket as unknown as {
        emit: (
          name: string,
          value: unknown,
          acknowledge: (result: GameRoomCommandResult) => void,
        ) => void;
      };
      commandSocket.emit(event, payload, (result) => {
        if (completed) {
          return;
        }
        completed = true;
        globalThis.clearTimeout(timeout);
        const typedResult = result as MultiplayerCommandResult<State>;
        resolve(typedResult);
      });
    });
  }

  /** @returns Nothing after connected subscribers are notified. */
  private readonly handleConnect = (): void => {
    for (const listener of this.connectionListeners) {
      listener(true);
    }
  };

  /** @returns Nothing after disconnected subscribers are notified. */
  private readonly handleDisconnect = (): void => {
    for (const listener of this.connectionListeners) {
      listener(false);
    }
  };

  /**
   * Converts Socket.IO connection errors into the shared error channel.
   * @param error - Socket.IO connection failure
   * @returns Nothing after error subscribers are notified
   */
  private readonly handleConnectError = (error: Error): void => {
    this.notifyError(error.message || "Could not connect to multiplayer.");
  };

  /**
   * Fans an authoritative room snapshot out to every local subscriber.
   * @param room - Public room received from the gateway
   * @returns Nothing after room subscribers are notified
   */
  private readonly handleRoomStateChanged = (room: GameRoomState): void => {
    const typedRoom = room as MultiplayerRoomState<State>;
    for (const listener of this.roomListeners) {
      listener(typedRoom);
    }
  };

  /**
   * Sends one error message to every local subscriber.
   * @param message - User-readable transport error
   * @returns Nothing after error subscribers are notified
   */
  private notifyError(message: string): void {
    for (const listener of this.errorListeners) {
      listener(message);
    }
  }
}
