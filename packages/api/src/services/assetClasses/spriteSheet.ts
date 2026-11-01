import type { ServiceDefinition } from "../../genericTypes/service";
import {
  ASSET_CLASS_ENDPOINTS,
  type AssetClassServiceApi,
} from "./assetClassService";

/**
 * Animations painted on every sprite sheet, in sheet row order.
 * Attack and defend match the battle actions; idle loops between turns, and
 * hurt plays when the character takes damage.
 */
export const SPRITE_ANIMATION_KINDS = [
  "idle",
  "attack",
  "defend",
  "hurt",
] as const;

/** One animation row on a sprite sheet. */
export type SpriteAnimationKind = (typeof SPRITE_ANIMATION_KINDS)[number];

/**
 * Screen direction the character faces in every frame.
 * Party members stand on the left and face right; enemies face left.
 * The opposite direction is a horizontal flip.
 */
export const SPRITE_FACINGS = ["left", "right"] as const;

/** Screen direction a sprite faces. */
export type SpriteFacing = (typeof SPRITE_FACINGS)[number];

/**
 * One animation cut from the generated sheet and normalized onto a fixed frame.
 * The strip holds `frameCount` frames side by side, each
 * `frameWidth` × `frameHeight` of the parent sheet.
 */
export interface SpriteAnimationAsset {
  /** What happens across the frames */
  description: string;
  /** Frames per second the animation is meant to play at */
  fps: number;
  frameCount: number;
  kind: SpriteAnimationKind;
  /** Short display name */
  label: string;
  /** Whether the animation repeats, like idle, or plays once */
  loop: boolean;
  /** Absolute URL of the transparent PNG strip */
  stripUrl: string;
}

/** One generated character sprite sheet, split into separate animations. */
export interface SpriteSheetAsset {
  /** Absolute URL of the transparent identity anchor frame */
  anchorUrl: string;
  /** Normalized animations, in sheet row order */
  animations: SpriteAnimationAsset[];
  createdAt: string;
  /** What the character is */
  description: string;
  facing: SpriteFacing;
  /** Height of every normalized frame, in pixels */
  frameHeight: number;
  /** Width of every normalized frame, in pixels */
  frameWidth: number;
  /** Stable folder id under `/static/sprite-sheets` */
  id: string;
  /** Original request from the user */
  prompt: string;
  /** Absolute URL of the sheet as the model painted it */
  sheetUrl: string;
  /** Short display name for the character */
  title: string;
}

export interface ListSpriteSheetsResponse {
  /** Newest first */
  spriteSheets: SpriteSheetAsset[];
}

/**
 * Sprite sheets: one prompt becomes an identity anchor and one sheet whose
 * rows are split into separate, normalized animations.
 */
export type SpriteSheetServiceApi = AssetClassServiceApi<
  SpriteSheetAsset,
  ListSpriteSheetsResponse
>;

export const SpriteSheetServiceDefinition: ServiceDefinition<SpriteSheetServiceApi> =
  {
    controller: "sprite-sheets",
    endpoints: ASSET_CLASS_ENDPOINTS,
  };
