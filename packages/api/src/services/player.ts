import type { Service, ServiceDefinition } from "../genericTypes/service";
import type { CardCharacterSetAsset, SpriteSheetAsset } from "./assetClasses";

/** Longest cultivator name, in characters. */
export const CULTIVATOR_NAME_MAX_LENGTH = 40;

/** Longest cultivator title, in characters. */
export const CULTIVATOR_TITLE_MAX_LENGTH = 60;

/** Longest appearance description, in characters. */
export const CULTIVATOR_APPEARANCE_MAX_LENGTH = 600;

/** Most cultivators one player can keep. */
export const MAX_CULTIVATORS_PER_PLAYER = 12;

/** Most climbs one player can have saved at once. */
export const MAX_SAVED_CLIMBS_PER_PLAYER = 30;

/** Lifecycle of one generated part of a cultivator. */
export const CULTIVATOR_ART_STATUSES = [
  "none",
  "painting",
  "ready",
  "failed",
] as const;

/** Whether a portrait or sprite is missing, painting, ready, or failed. */
export type CultivatorArtStatus = (typeof CULTIVATOR_ART_STATUSES)[number];

/** Generated parts of a cultivator. */
export const CULTIVATOR_ART_PARTS = ["portrait", "sprite"] as const;

/** One generated part of a cultivator. */
export type CultivatorArtPart = (typeof CULTIVATOR_ART_PARTS)[number];

/** State of one generated part. */
export interface CultivatorArtState<Asset> {
  /** The stored asset, when one is ready and can still be read */
  asset?: Asset;
  /** Why the last painting run failed */
  error?: string;
  status: CultivatorArtStatus;
}

/** A cultivator the player climbs as. */
export interface CultivatorRecord {
  /** The player's description the art is painted from */
  appearance: string;
  createdAt: string;
  id: string;
  name: string;
  /** Four portraits, one per cultivation realm, weakest first */
  portrait: CultivatorArtState<CardCharacterSetAsset>;
  /** Right-facing battle sprite */
  sprite: CultivatorArtState<SpriteSheetAsset>;
  title: string;
}

/** One saved climb in progress. */
export interface ClimbRecord {
  ascension: number;
  cultivatorId: string;
  /** Index of the room being prepared or fought */
  floorIndex: number;
  floorCount: number;
  id: string;
  /**
   * The game's saved climb: tower content and run state. The backend stores
   * it as-is; the game checks its shape when it reads it.
   */
  snapshot: unknown;
  towerId: string;
  towerTitle: string;
  /** When the climb was last saved, as an ISO timestamp */
  updatedAt: string;
}

/** Everything the game keeps on the server for one player. */
export interface PlayerState {
  /** Newest first */
  climbs: ClimbRecord[];
  /** Oldest first */
  cultivators: CultivatorRecord[];
}

/** Fields the player chooses for a cultivator. */
export interface CultivatorFields {
  appearance: string;
  name: string;
  title: string;
}

/** Body of `POST /player/save-climb`. */
export interface SaveClimbPayload {
  ascension: number;
  cultivatorId: string;
  floorCount: number;
  floorIndex: number;
  /** Client-made UUID, fixed for the whole climb */
  id: string;
  snapshot: unknown;
  towerId: string;
  towerTitle: string;
}

/**
 * Cultivators and saved climbs for the browser's player. The player is an
 * anonymous cookie; the first call sets it.
 */
export interface PlayerServiceApi extends Service {
  /** Adds a cultivator with no art yet */
  createCultivator: {
    payload: CultivatorFields;
    response: CultivatorRecord;
  };
  /** Ends a saved climb without settling it */
  deleteClimb: {
    payload: { climbId: string };
    response: { deleted: boolean };
  };
  /** Removes a cultivator and every climb it has saved */
  deleteCultivator: {
    payload: { cultivatorId: string };
    response: { deleted: boolean };
  };
  /** Removes every cultivator and climb this player has */
  erase: {
    payload: null;
    response: PlayerState;
  };
  /**
   * Starts painting a cultivator's portrait, sprite, or both. Returns at
   * once with those parts marked `painting`; read `state` to follow them.
   */
  paintCultivator: {
    payload: { cultivatorId: string; parts?: CultivatorArtPart[] };
    response: CultivatorRecord;
  };
  /** Creates or replaces one saved climb */
  saveClimb: {
    payload: SaveClimbPayload;
    response: { id: string; updatedAt: string };
  };
  /** Cultivators and saved climbs */
  state: {
    payload: null;
    response: PlayerState;
  };
  /** Stops a cultivator's painting runs */
  stopPainting: {
    payload: { cultivatorId: string };
    response: CultivatorRecord;
  };
  /** Changes a cultivator's name, title, or appearance */
  updateCultivator: {
    payload: Partial<CultivatorFields> & { cultivatorId: string };
    response: CultivatorRecord;
  };
}

export const PlayerServiceDefinition: ServiceDefinition<PlayerServiceApi> = {
  controller: "player",
  endpoints: {
    createCultivator: "createCultivator",
    deleteClimb: "deleteClimb",
    deleteCultivator: "deleteCultivator",
    erase: "erase",
    paintCultivator: "paintCultivator",
    saveClimb: "saveClimb",
    state: "state",
    stopPainting: "stopPainting",
    updateCultivator: "updateCultivator",
  },
};
