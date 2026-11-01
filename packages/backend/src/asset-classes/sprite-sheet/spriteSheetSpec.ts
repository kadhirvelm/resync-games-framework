import type { SpriteAnimationKind } from "@towers-of-coreborn/api";
import type { ImageGenerationConfig } from "src/model/types/modelRequestTypes";

export const SPRITE_SHEET_MANIFEST_FILE_NAME = "manifest.json";
/** The sheet exactly as the model painted it, kept for review. */
export const SPRITE_SHEET_SOURCE_FILE_NAME = "sheet.webp";
/** Transparent identity anchor every animation was painted from. */
export const SPRITE_SHEET_ANCHOR_FILE_NAME = "anchor.png";

/**
 * Canvas for both images in the generate-image call: the anchor and the sheet.
 * 4:3 at 2K keeps each of the 24 cells close to square.
 */
export const SPRITE_SHEET_IMAGE_CONFIG: ImageGenerationConfig = {
  aspectRatio: "4:3",
  imageSize: "2K",
};

/** Frames in every animation row. */
export const SPRITE_SHEET_FRAMES_PER_ANIMATION = 6;

/**
 * Flat background the model paints behind the character. It is removed by
 * flood-filling from the sheet edges, so white highlights inside the
 * character's outline survive.
 */
export const SPRITE_SHEET_BACKGROUND_HEX = "#FFFFFF";

/** Shortest edge of a usable sheet, in pixels. Below this the cells are too small to read. */
export const MIN_SPRITE_SHEET_EDGE_PX = 768;

/**
 * Words the agent supplies so the fixed frame beats describe this character.
 * @property facingEdge - Screen edge the character faces, e.g. "right"
 * @property attackMove - The attack motion, e.g. "an overhead hammer smash"
 * @property attackEffect - The only effect allowed on the sheet, or "no effect"
 * @property defendMove - The guard motion, e.g. "raises a riveted tower shield"
 */
export interface SpriteAnimationBeatContext {
  attackEffect: string;
  attackMove: string;
  defendMove: string;
  facingEdge: string;
}

/** One row of the sheet: how it plays and what each frame shows. */
export interface SpriteAnimationSpec {
  /**
   * @param context - Character-specific words
   * @returns One line per frame, left to right
   */
  beats: (context: SpriteAnimationBeatContext) => string[];
  /** Short summary stored in the manifest */
  description: string;
  fps: number;
  kind: SpriteAnimationKind;
  label: string;
  loop: boolean;
}

/**
 * Sheet rows, top to bottom. The frame beats follow the attack and idle
 * sequences from the ai-game-spritesheets pipeline, cut to six frames.
 * Effects belong only to the attack row.
 */
export const SPRITE_SHEET_ANIMATIONS: readonly SpriteAnimationSpec[] = [
  {
    beats: () => [
      "neutral relaxed stance, feet planted",
      "slight inhale, shoulders and chest rise by a few pixels",
      "hair, cloth, and gear sway slightly",
      "slight exhale, shoulders lower",
      "hair, cloth, and gear sway back the other way",
      "settles to match frame 1 closely so the loop is seamless",
    ],
    description: "Subtle breathing loop between turns.",
    fps: 8,
    kind: "idle",
    label: "Idle",
    loop: true,
  },
  {
    beats: ({ attackEffect, attackMove, facingEdge }) => [
      "ready stance, feet planted, no active effect",
      `anticipation: winds up for ${attackMove}, weight shifts back`,
      `peak of the wind-up; ${attackEffect} begins to gather`,
      `release: ${attackMove} strikes toward the ${facingEdge} edge; ${attackEffect} at its brightest, still inside the cell`,
      `follow-through: ${attackEffect} trails and fades, slight recoil`,
      "recovers to the ready stance, no active effect",
    ],
    description: "One-shot attack with wind-up, release, and recovery.",
    fps: 12,
    kind: "attack",
    label: "Attack",
    loop: false,
  },
  {
    beats: ({ defendMove }) => [
      "ready stance, feet planted",
      `begins to brace: ${defendMove}`,
      "guard fully raised, weight low and grounded",
      "holds the guard and absorbs a small impact shudder",
      "holds the guard steady",
      "guard still raised, a pose that can be held",
    ],
    description: "One-shot guard that ends on a held block pose.",
    fps: 10,
    kind: "defend",
    label: "Defend",
    loop: false,
  },
  {
    beats: ({ facingEdge }) => [
      "ready stance, feet planted",
      `impact: head and torso snap back away from the ${facingEdge} edge`,
      "recoil peak: flinch with eyes squeezed shut",
      "staggers; one foot slides back but stays on the baseline",
      "regains balance",
      "returns to the ready stance",
    ],
    description: "One-shot flinch when the character takes damage.",
    fps: 10,
    kind: "hurt",
    label: "Hurt",
    loop: false,
  },
];

/**
 * @param kind - Animation row
 * @returns The PNG strip file name for that animation
 */
export function spriteAnimationFileName(kind: SpriteAnimationKind): string {
  return `${kind}.png`;
}
