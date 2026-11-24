import type {
  ListAudioResponse,
  StaticImageAsset,
  ThreeDAsset,
  ThreeDPrototype,
} from "@resync-game-framework/api";
import { CROSSWORD_CRYPT_ART_TAGS } from "../crossword-crypt/data/art";
import { CROSSWORD_CRYPT_AUDIO_IDS } from "../crossword-crypt/data/audio";
import {
  ASHEN_GATE_AUDIO,
  ASHEN_GATE_AUDIO_TAG,
} from "../descent/data/layers/ashen_gate/audio";
import { ASHEN_GATE_TEXTURES } from "../descent/data/layers/ashen_gate/environmentArt";
import { ASHEN_GATE_3D_ASSETS } from "../descent/data/layers/ashen_gate/threeDAssets";

/** Identifiers for games that consume generated workshop assets. */
export type AssetGameId =
  | "towers-of-coreborn"
  | "descent"
  | "crossword-crypt"
  | "three-d-sandbox";

/** Display badge describing one game an asset belongs to. */
export interface AssetGameTag {
  accent: string;
  id: AssetGameId;
  label: string;
}

export const TOWERS_OF_COREBORN_TAG: AssetGameTag = {
  accent: "#79c99e",
  id: "towers-of-coreborn",
  label: "Towers of Coreborn",
};

export const DESCENT_TAG: AssetGameTag = {
  accent: "#e0603a",
  id: "descent",
  label: "Descent",
};

export const CROSSWORD_CRYPT_TAG: AssetGameTag = {
  accent: "#d69b42",
  id: "crossword-crypt",
  label: "Crossword Crypt",
};

export const THREE_D_SANDBOX_TAG: AssetGameTag = {
  accent: "#73b7ff",
  id: "three-d-sandbox",
  label: "3D Sandbox",
};

const DESCENT_3D_NAMES = new Set<string>(
  ASHEN_GATE_3D_ASSETS.map((entry) => entry.name),
);
const DESCENT_TEXTURE_TAGS = ASHEN_GATE_TEXTURES.map((entry) =>
  entry.tag.toLowerCase(),
);
const CROSSWORD_ART_PREFIXES = Object.values(CROSSWORD_CRYPT_ART_TAGS).map(
  (tag) => tag.toLowerCase(),
);
const CROSSWORD_AUDIO_VALUES = new Set<string>(
  Object.values(CROSSWORD_CRYPT_AUDIO_IDS),
);
const DESCENT_AUDIO_DIRECTIONS = new Set<string>(
  ASHEN_GATE_AUDIO.map((entry) => entry.direction.toLowerCase()),
);

type AudioClip = ListAudioResponse["clips"][number];

/**
 * Resolves which games use a static image based on bundled ids and canonical
 * prompt tags.
 * @param image - Static image asset from the workshop library
 * @returns Matching game tags, deduplicated
 */
export function staticImageGameTags(image: StaticImageAsset): AssetGameTag[] {
  const tags: AssetGameTag[] = [];
  const prompt = image.prompt.toLowerCase();
  const title = image.title.toLowerCase();

  const isDescent =
    image.id.startsWith("descent-resource-") ||
    DESCENT_TEXTURE_TAGS.some((tag) => prompt.startsWith(tag)) ||
    prompt.includes("descent") ||
    title.includes("descent");
  if (isDescent) {
    tags.push(DESCENT_TAG);
  }

  const isCrossword =
    CROSSWORD_ART_PREFIXES.some((tag) => prompt.startsWith(tag)) ||
    prompt.includes("crossword crypt") ||
    title.includes("crossword crypt");
  if (isCrossword) {
    tags.push(CROSSWORD_CRYPT_TAG);
  }

  if (
    prompt.includes("coreborn") ||
    prompt.includes("towers of coreborn") ||
    title.includes("coreborn")
  ) {
    tags.push(TOWERS_OF_COREBORN_TAG);
  }

  return tags;
}

/**
 * Resolves which games use an audio clip based on canonical tags, cues, and
 * prompt text.
 * @param clip - Stored audio clip
 * @returns Matching game tags, deduplicated
 */
export function audioGameTags(clip: AudioClip): AssetGameTag[] {
  const tags: AssetGameTag[] = [];
  const prompt = clip.prompt.toLowerCase();
  const title = clip.title.toLowerCase();
  const cue = clip.cue.toLowerCase();

  const isDescent =
    prompt.includes(ASHEN_GATE_AUDIO_TAG) ||
    prompt.includes("descent") ||
    title.includes("descent") ||
    DESCENT_AUDIO_DIRECTIONS.has(prompt);
  if (isDescent) {
    tags.push(DESCENT_TAG);
  }

  const isCrossword =
    CROSSWORD_AUDIO_VALUES.has(cue) ||
    CROSSWORD_AUDIO_VALUES.has(title) ||
    prompt.includes("crossword crypt") ||
    title.includes("crossword crypt");
  if (isCrossword) {
    tags.push(CROSSWORD_CRYPT_TAG);
  }

  if (
    prompt.includes("coreborn") ||
    prompt.includes("towers of coreborn") ||
    title.includes("coreborn")
  ) {
    tags.push(TOWERS_OF_COREBORN_TAG);
  }

  return tags;
}

/**
 * Resolves which games use a 3D model based on the Ashen Gate roster and
 * saved 3D Sandbox world slots.
 * @param asset - 3D model asset
 * @param prototypes - Saved 3D world prototypes
 * @returns Matching game tags, deduplicated
 */
export function threeDAssetGameTags(
  asset: ThreeDAsset,
  prototypes: readonly ThreeDPrototype[],
): AssetGameTag[] {
  const tags: AssetGameTag[] = [];
  if (DESCENT_3D_NAMES.has(asset.name) || asset.name.startsWith("Descent ")) {
    tags.push(DESCENT_TAG);
  }
  const usedInWorld = prototypes.some((prototype) =>
    prototype.slots.some((slot) => slot.assetId === asset.id),
  );
  if (usedInWorld) {
    tags.push(THREE_D_SANDBOX_TAG);
  }
  return tags;
}
