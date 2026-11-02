import {
  type PlayableCardKind,
  PRODUCT_NOW_GAMES_FOLDER_ID,
  PRODUCT_NOW_TOWER_LORE_DOCUMENT_ID,
} from "@resync-game-framework/api";
import type { ImageGenerationConfig } from "src/model/types/modelRequestTypes";

export {
  isPlayableCardChainKind,
  isPlayableCardKind,
  PLAYABLE_CARD_CHAIN_KINDS,
  PLAYABLE_CARD_KINDS,
} from "@resync-game-framework/api";

/**
 * ProductNow document "Lore" in the Card game thing folder.
 * Generation searches this document and ignores other search hits.
 */
export const LORE_DOCUMENT_ID = PRODUCT_NOW_TOWER_LORE_DOCUMENT_ID;

/**
 * ProductNow folder that holds the Lore document and the Towers of Coreborn design doc.
 */
export const CARD_GAME_FOLDER_ID = PRODUCT_NOW_GAMES_FOLDER_ID;

/** Portrait ratio the generate-image tool must use for card art. */
export const PLAYABLE_CARD_IMAGE_CONFIG: ImageGenerationConfig = {
  aspectRatio: "3:4",
  imageSize: "1K",
};

export const PLAYABLE_CARD_IMAGE_FILE_NAME = "card.webp";

export const PLAYABLE_CARD_MANIFEST_FILE_NAME = "manifest.json";

/** Lore searches the agent may make before it has to submit the card. */
export const MAX_PLAYABLE_CARD_RESEARCH_TURNS = 6;

/**
 * Steps for one card-generator run: the ProductNow lore consult, Lore
 * searches, submission, the image tool, and a closing reply.
 */
export const PLAYABLE_CARD_AGENT_MAX_STEPS =
  MAX_PLAYABLE_CARD_RESEARCH_TURNS + 5;

export const PLAYABLE_CARD_AETHER_COST = { max: 4, min: 1 } as const;

export const PLAYABLE_CARD_EFFECT_AMOUNTS: Record<
  PlayableCardKind,
  { max: number; min: number }
> = {
  aether: { max: 3, min: 1 },
  attack: { max: 16, min: 4 },
  combo: { max: 20, min: 6 },
  defend: { max: 16, min: 4 },
  draw: { max: 2, min: 1 },
};

/** Words that would smuggle a status effect into rules text. */
export const PLAYABLE_CARD_STATUS_WORDS = [
  "bleed",
  "buff",
  "burn",
  "debuff",
  "poison",
  "stun",
  "vulnerable",
] as const;
