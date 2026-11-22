import type {
  WebsocketEvents,
  WebsocketEventsDefinition,
} from "../genericTypes/websocket";
import type { GameRoomCommandResult, GameRoomValue } from "./game";

/** Stable multiplayer game id for Descent co-op rooms. */
export const DESCENT_GAME_ID = "descent";

/** Maximum players allowed in one Descent co-op room. */
export const DESCENT_MAX_PLAYERS = 4;

/**
 * Distinct, high-contrast player ring colors for up to 4 co-op players.
 * Chosen to stay clearly separable from each other and from Horde crimson (#e0523c).
 */
export const DESCENT_PLAYER_COLORS = [
  "#f2c14e",
  "#4db8ff",
  "#4be38a",
  "#c678ff",
] as const;

/** Human-readable color names matching `DESCENT_PLAYER_COLORS`. */
export const DESCENT_PLAYER_COLOR_NAMES = [
  "Gold",
  "Azure",
  "Emerald",
  "Violet",
] as const;

/** Playable multiplayer map identifier. */
export type DescentMapId = "ashen_crucible";

/** One player locked into a Descent multiplayer match roster. */
export interface DescentRoomPlayer {
  color: string;
  colorIndex: number;
  id: string;
  name: string;
  slotIndex: number;
}

/**
 * JSON-safe Descent room state stored inside `GameRoomState.gameState`.
 * Room membership, host, and revisions are owned by `GameRoomStore`.
 */
export interface DescentRoomState {
  mapId: DescentMapId;
  matchId: string | null;
  phase: "lobby" | "playing";
  roster: DescentRoomPlayer[];
  seed: number | null;
  startedAt: string | null;
}

/** Creates the initial lobby state when a player hosts a Descent room. */
export function createInitialDescentRoomState(): DescentRoomState {
  return {
    mapId: "ashen_crucible",
    matchId: null,
    phase: "lobby",
    roster: [],
    seed: null,
    startedAt: null,
  };
}

/**
 * Returns the assigned co-op ring color for a 0-based player slot.
 * @param slotIndex - Zero-based player index
 * @returns Hex color string
 */
export function descentPlayerColor(slotIndex: number): string {
  const index = Math.abs(Math.floor(slotIndex)) % DESCENT_PLAYER_COLORS.length;
  return DESCENT_PLAYER_COLORS[index] ?? DESCENT_PLAYER_COLORS[0];
}

/** One command stamped by the server with its authoritative player and tick. */
export interface DescentStampedCommand {
  command: GameRoomValue;
  playerId: string;
  seq: number;
  tick: number;
}

/** Payload for starting a Descent co-op match from the lobby. */
export interface DescentStartMatchPayload {
  roomId: string;
}

/** Payload for submitting one player command to an active Descent match. */
export interface DescentCommandPayload {
  command: GameRoomValue;
  /** Match the command was created for; stale-match commands are rejected. */
  matchId: string;
  roomId: string;
}

/** Payload for pausing or resuming an active Descent match. */
export interface DescentSetPausedPayload {
  /** Match the pause request was created for. */
  matchId: string;
  paused: boolean;
  roomId: string;
}

/** Payload for changing simulation speed in an active Descent match. */
export interface DescentSetSpeedPayload {
  /** Match the speed request was created for. */
  matchId: string;
  roomId: string;
  speed: number;
}

/** Payload for catching up missed commands from a tick onward. */
export interface DescentSyncPayload {
  fromTick: number;
  /** Match whose authoritative history should be returned. */
  matchId: string;
  roomId: string;
}

/** Simple acknowledgement returned by Descent match commands. */
export interface DescentAckResult {
  error?: string;
  ok: boolean;
}

/** Catch-up response returned by `descentSync`. */
export interface DescentSyncResult {
  commands: DescentStampedCommand[];
  error?: string;
  matchId: string | null;
  ok: boolean;
  paused: boolean;
  speed: number;
  targetTick: number;
}

/** Authoritative tick batch broadcast to every player in a Descent match. */
export interface DescentTickPayload {
  commands: DescentStampedCommand[];
  matchId: string;
  paused: boolean;
  roomId: string;
  speed: number;
  targetTick: number;
}

/** Typed WebSocket events for Descent co-op matches. */
export interface DescentWebsocketEvents extends WebsocketEvents {
  clientToServer: {
    descentCommand: {
      payload: DescentCommandPayload;
      response: DescentAckResult;
    };
    descentSetPaused: {
      payload: DescentSetPausedPayload;
      response: DescentAckResult;
    };
    descentSetSpeed: {
      payload: DescentSetSpeedPayload;
      response: DescentAckResult;
    };
    descentStartMatch: {
      payload: DescentStartMatchPayload;
      response: GameRoomCommandResult;
    };
    descentSync: {
      payload: DescentSyncPayload;
      response: DescentSyncResult;
    };
  };
  serverToClient: {
    descentTick: {
      response: DescentTickPayload;
    };
  };
}

/** Shared Socket.IO event names for Descent co-op matches. */
export const DescentEventsDefinition: WebsocketEventsDefinition<DescentWebsocketEvents> =
  {
    clientToServer: {
      descentCommand: "descentCommand",
      descentSetPaused: "descentSetPaused",
      descentSetSpeed: "descentSetSpeed",
      descentStartMatch: "descentStartMatch",
      descentSync: "descentSync",
    },
    serverToClient: {
      descentTick: "descentTick",
    },
  };
