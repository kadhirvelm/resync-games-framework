import type { Service, ServiceDefinition } from "../genericTypes/service";
import type {
  AssetGenerationPayload,
  CancelAssetGenerationPayload,
  CancelAssetGenerationResponse,
  CardCharacterLevelNumber,
} from "./assetClasses";

/**
 * Asset kinds a dungeon package can ask another agent to create.
 * The counts are fixed: 2 rooms, 3 characters, 4 cards and 1 sprite sheet
 * for each character, and 2 enemies.
 */
export const DUNGEON_SLOT_KINDS = [
  "battle-background",
  "card-character",
  "enemy",
  "playable-card",
  "sprite-sheet",
] as const;

/** One agent a dungeon slot sends its prompt to. */
export type DungeonSlotKind = (typeof DUNGEON_SLOT_KINDS)[number];

/** Workshop tab id for each dungeon slot kind. */
export const DUNGEON_SLOT_ASSET_CLASS_ID = {
  "battle-background": "battle-backgrounds",
  "card-character": "card-characters",
  enemy: "enemies",
  "playable-card": "playable-cards",
  "sprite-sheet": "sprite-sheets",
} as const satisfies Record<DungeonSlotKind, string>;

/** Workshop tab that lists dungeon packages. */
export const DUNGEON_ASSET_CLASS_ID = "dungeons";

/** Whether a slot is waiting, running, filled, or failed. */
export const DUNGEON_SLOT_STATUSES = [
  "planned",
  "generating",
  "ready",
  "failed",
] as const;

/** Lifecycle of one prompt in a dungeon package. */
export type DungeonSlotStatus = (typeof DUNGEON_SLOT_STATUSES)[number];

/**
 * A short view of the asset linked to a slot.
 * Present on API responses when that asset can still be read.
 */
export interface DungeonSlotPreview {
  /** Absolute image URL */
  imageUrl: string;
  /** Secondary line, such as health or aether cost */
  subtitle: string;
  /** Display name of the linked asset */
  title: string;
}

/** Fields shared by every prompt in a dungeon package. */
interface DungeonSlotBase {
  /** Stored asset id, once this slot has been generated or attached */
  assetId?: string;
  /** Why the latest attempt failed */
  error?: string;
  /** Client id of the run filling this slot */
  generationId?: string;
  id: string;
  /** Filled by the API when the linked asset can be read. Not stored in the package file. */
  preview?: DungeonSlotPreview;
  /** Prompt sent to that slot's agent */
  prompt: string;
  status: DungeonSlotStatus;
  /** Short label shown on the blueprint */
  title: string;
}

/** Prompt for one battle room. */
export interface DungeonBackgroundSlot extends DungeonSlotBase {
  kind: "battle-background";
}

/** Prompt for one four-level character portrait set. */
export interface DungeonCharacterSlot extends DungeonSlotBase {
  kind: "card-character";
}

/** Prompt for one dungeon enemy. */
export interface DungeonEnemySlot extends DungeonSlotBase {
  kind: "enemy";
}

/** Prompt for one card in a character's ordered progression. */
export interface DungeonCardSlot extends DungeonSlotBase {
  /** Character slot this card belongs to */
  characterSlotId: string;
  kind: "playable-card";
  /** Card level from 1 through 4 */
  level: CardCharacterLevelNumber;
}

/**
 * Prompt for the animated battle sprite of one character. The character
 * fights as this sprite: idle between turns, attack, defend, and hurt.
 */
export interface DungeonSpriteSlot extends DungeonSlotBase {
  /** Character slot this sprite animates */
  characterSlotId: string;
  kind: "sprite-sheet";
}

/**
 * One prompt in a dungeon package.
 * The `kind` discriminator makes card and sprite ownership fields required.
 */
export type DungeonSlot =
  | DungeonBackgroundSlot
  | DungeonCharacterSlot
  | DungeonEnemySlot
  | DungeonCardSlot
  | DungeonSpriteSlot;

/**
 * A dungeon package: the prompts for its rooms, characters, cards, and enemies,
 * plus any assets already linked to those prompts.
 */
export interface DungeonBlueprint {
  createdAt: string;
  id: string;
  /** Absolute URL of the package JSON file */
  jsonUrl: string;
  /** The broad idea this package was planned from */
  prompt: string;
  slots: DungeonSlot[];
  /** The planner's short description of the setup */
  summary: string;
}

/** A slot generation that is still running on the backend. */
export interface DungeonInFlightJob {
  dungeonId: string;
  generationId: string;
  /** Agent that owns this run */
  kind: DungeonSlotKind;
  prompt: string;
  slotId: string;
  /** ISO time the run was recorded */
  startedAt: string;
}

/** Body of `POST /dungeons/generateSlot`. */
export interface GenerateDungeonSlotPayload {
  dungeonId: string;
  /** Client id used to stop this slot */
  generationId: string;
  slotId: string;
}

/** Body of `POST /dungeons/associate`. */
export interface AssociateDungeonAssetPayload {
  assetId: string;
  dungeonId: string;
  slotId: string;
}

/**
 * Dungeon packages. `generate` writes prompts. `generateSlot` runs one of
 * those prompts. `associate` links an asset that already exists.
 */
export interface DungeonServiceApi extends Service {
  associate: {
    payload: AssociateDungeonAssetPayload;
    response: DungeonBlueprint;
  };
  cancel: {
    payload: CancelAssetGenerationPayload;
    response: CancelAssetGenerationResponse;
  };
  generate: {
    payload: AssetGenerationPayload;
    response: DungeonBlueprint;
  };
  generateSlot: {
    payload: GenerateDungeonSlotPayload;
    response: DungeonBlueprint;
  };
  inflight: {
    payload: null;
    response: { jobs: DungeonInFlightJob[] };
  };
  list: {
    payload: null;
    response: { dungeons: DungeonBlueprint[] };
  };
}

export const DungeonServiceDefinition: ServiceDefinition<DungeonServiceApi> = {
  controller: "dungeons",
  endpoints: {
    associate: "associate",
    cancel: "cancel",
    generate: "generate",
    generateSlot: "generateSlot",
    inflight: "inflight",
    list: "list",
  },
};
