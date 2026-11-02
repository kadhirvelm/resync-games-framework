import type {
  WebsocketEvents,
  WebsocketEventsDefinition,
} from "../genericTypes/websocket";

/** A value that can safely cross the multiplayer JSON transport. */
export type GameRoomValue =
  | boolean
  | null
  | number
  | string
  | GameRoomValue[]
  | { [key: string]: GameRoomValue };

/** Public identity supplied by a player when entering a room. */
export interface GameRoomPlayerInput {
  /** Stable browser or account id used to recognize reconnecting players. */
  id: string;
  /** Player-facing name shown in lobby and game UI. */
  name: string;
}

/** A player currently connected to a multiplayer room. */
export interface GameRoomPlayer extends GameRoomPlayerInput {
  /** ISO timestamp for the player's first join to this room. */
  joinedAt: string;
}

/**
 * The authoritative snapshot shared by every client in a multiplayer room.
 * Games own `gameState`; the framework owns membership and revisions.
 */
export interface GameRoomState<State = GameRoomValue> {
  /** Short room code players use to join. */
  id: string;
  /** Stable id of the game implementation that owns this state shape. */
  gameId: string;
  /** Current host. Ownership moves to the oldest remaining player on leave. */
  hostPlayerId: string;
  /** Maximum number of simultaneous players. */
  maxPlayers: number;
  /** Connected players in join order. */
  players: GameRoomPlayer[];
  /** Game-defined, JSON-safe state synchronized as one snapshot. */
  gameState: State;
  /** Monotonic version used to reject conflicting state writes. */
  revision: number;
  /** ISO timestamp for room creation. */
  createdAt: string;
  /** ISO timestamp for the most recent membership or state change. */
  updatedAt: string;
}

/** Payload for creating and immediately joining a multiplayer room. */
export interface CreateGameRoomPayload {
  gameId: string;
  player: GameRoomPlayerInput;
  initialState: GameRoomValue;
  maxPlayers?: number;
}

/** Payload for joining an existing room by code. */
export interface JoinGameRoomPayload {
  gameId: string;
  player: GameRoomPlayerInput;
  roomId: string;
}

/** Payload for leaving the caller's membership in a room. */
export interface LeaveGameRoomPayload {
  roomId: string;
}

/** Payload for replacing a room's game-owned state snapshot. */
export interface UpdateGameRoomStatePayload {
  expectedRevision: number;
  gameState: GameRoomValue;
  roomId: string;
}

/** Stable errors callers can handle without parsing messages. */
export type GameRoomErrorCode =
  | "GAME_MISMATCH"
  | "INVALID_REQUEST"
  | "NOT_A_MEMBER"
  | "REVISION_CONFLICT"
  | "ROOM_FULL"
  | "ROOM_NOT_FOUND";

/** A failed multiplayer room command. */
export interface GameRoomCommandError {
  code: GameRoomErrorCode;
  message: string;
}

/** Acknowledgement returned by every room command. */
export type GameRoomCommandResult =
  | {
      ok: true;
      /** `null` means the final player left and the room was deleted. */
      room: GameRoomState | null;
    }
  | {
      error: GameRoomCommandError;
      ok: false;
      /** Latest snapshot, included when it helps a client recover. */
      room?: GameRoomState;
    };

/** Typed events for the reusable multiplayer room gateway. */
export interface RoomWebsocketEvents extends WebsocketEvents {
  /** Commands sent from a game client to the room gateway. */
  clientToServer: {
    /** Create a room and join it as host. */
    createRoom: {
      payload: CreateGameRoomPayload;
      response: GameRoomCommandResult;
    };
    /** Join a room by its short code. */
    joinRoom: {
      payload: JoinGameRoomPayload;
      response: GameRoomCommandResult;
    };
    /** Leave the caller's room membership. */
    leaveRoom: {
      payload: LeaveGameRoomPayload;
      response: GameRoomCommandResult;
    };
    /** Replace the game-owned portion of a room snapshot. */
    updateRoomState: {
      payload: UpdateGameRoomStatePayload;
      response: GameRoomCommandResult;
    };
  };
  /** Events broadcast by the room gateway. */
  serverToClient: {
    /** Broadcast after any membership or game state change. */
    roomStateChanged: {
      response: GameRoomState;
    };
  };
}

/** Shared event names used by the backend gateway and frontend client. */
export const RoomEventsDefinition: WebsocketEventsDefinition<RoomWebsocketEvents> =
  {
    clientToServer: {
      createRoom: "createRoom",
      joinRoom: "joinRoom",
      leaveRoom: "leaveRoom",
      updateRoomState: "updateRoomState",
    },
    serverToClient: {
      roomStateChanged: "roomStateChanged",
    },
  };
