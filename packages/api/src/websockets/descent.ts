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
export type DescentMapId =
  | "ashen_crucible"
  | "ashen_crucible_tutorial"
  | DescentCampaignMissionId;

/** Supported Ashen Crucible campaign scenarios, not unfinished deeper layers. */
export type DescentCampaignMissionId =
  | "ashen_campaign_1"
  | "ashen_campaign_2"
  | "ashen_campaign_3";

/**
 * Shared scenarios for the existing Ashen Crucible sim, ending at Cinderjaw.
 * `waveStatScale` multiplies wave combat stats; `waveTimeScale` multiplies wave
 * timing intervals (values below one mean faster waves). This is configuration,
 * not a backend simulation: all peers must apply the same selected scenario.
 */
export const DESCENT_CAMPAIGN_MISSIONS = [
  {
    briefing: "Establish your Hold in the Ashen Crucible and defeat Cinderjaw.",
    id: "ashen_campaign_1",
    title: "Establish the Hold",
    waveStatScale: 1,
    waveTimeScale: 1,
  },
  {
    briefing:
      "Rebuild in the Ashen Crucible against stronger, faster waves and defeat Cinderjaw.",
    id: "ashen_campaign_2",
    title: "Under Siege",
    waveStatScale: 1.25,
    waveTimeScale: 0.9,
  },
  {
    briefing:
      "Withstand the fiercest Ashen Crucible siege together and defeat Cinderjaw.",
    id: "ashen_campaign_3",
    title: "Crucible United",
    waveStatScale: 1.5,
    waveTimeScale: 0.8,
  },
] as const satisfies readonly {
  id: DescentCampaignMissionId;
  title: string;
  briefing: string;
  waveStatScale: number;
  waveTimeScale: number;
}[];

/** Peer-reported terminal simulation result; the backend does not verify sim execution. */
export type DescentOutcome = "victory" | "defeat";

/**
 * Room-scoped Redis campaign progress, lost when the room is deleted (including final leave).
 * Outcomes are immutable reports by the locked roster, not an anti-cheat mechanism.
 * Victory requires every locked participant, even if one disconnects; any defeat allows retry.
 */
export interface DescentCampaignState {
  missionIndex: number;
  completedMissionIds: DescentCampaignMissionId[];
  outcomes: Record<string, DescentOutcome>;
  status: "active" | "victory" | "defeat" | "completed";
}

/** All valid Descent multiplayer map identifiers. */
export const DESCENT_MAP_IDS: readonly DescentMapId[] = [
  "ashen_crucible",
  "ashen_crucible_tutorial",
  ...DESCENT_CAMPAIGN_MISSIONS.map((mission) => mission.id),
] as const;

/**
 * Checks whether an unknown wire value is a supported Descent multiplayer map.
 * @param value - Candidate map id
 * @returns Whether `value` is a valid `DescentMapId`
 */
export function isDescentMapId(value: unknown): value is DescentMapId {
  return (
    typeof value === "string" &&
    (DESCENT_MAP_IDS as readonly string[]).includes(value)
  );
}

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
  campaign?: DescentCampaignState;
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
  /** Explicit host-only campaign transition; ordinary starts cannot replace a campaign. */
  campaignAction?: "start" | "retry" | "advance";
  /** Required for retry/advance and when replacing an existing match; null is valid in the initial lobby. */
  matchId?: string | null;
  /** Optional map/mode selection; defaults to `ashen_crucible`. */
  mapId?: DescentMapId;
  roomId: string;
}

/** Payload for attesting a terminal outcome for the current campaign match. */
export interface DescentReportOutcomePayload {
  roomId: string;
  matchId: string;
  outcome: DescentOutcome;
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
    descentReportOutcome: {
      payload: DescentReportOutcomePayload;
      response: GameRoomCommandResult;
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
      descentReportOutcome: "descentReportOutcome",
      descentSetPaused: "descentSetPaused",
      descentSetSpeed: "descentSetSpeed",
      descentStartMatch: "descentStartMatch",
      descentSync: "descentSync",
    },
    serverToClient: {
      descentTick: "descentTick",
    },
  };
