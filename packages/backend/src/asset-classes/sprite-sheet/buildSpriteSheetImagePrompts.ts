import type { SpriteFacing } from "@resync-game-framework/api";
import {
  SPRITE_SHEET_ANIMATIONS,
  SPRITE_SHEET_BACKGROUND_HEX,
  SPRITE_SHEET_FRAMES_PER_ANIMATION,
} from "./spriteSheetSpec";

/** Character design the two image prompts are written from. */
export interface SpriteSheetDesign {
  /** Effect drawn only on attack frames, or "no effect" */
  attackEffect: string;
  /** The attack motion */
  attackMove: string;
  /** Outfit and limited palette */
  costumeAndPalette: string;
  /** The guard motion */
  defendMove: string;
  description: string;
  facing: SpriteFacing;
  name: string;
  /** Carried prop, or "none" */
  prop: string;
  /** Body shape and proportions that must read at small sizes */
  silhouette: string;
}

/** Prompts for the anchor and the sheet, in generate-image order. */
export interface SpriteSheetImagePrompts {
  anchorPrompt: string;
  sheetPrompt: string;
}

const STYLE_LINES = [
  "Polished SNES-era, high-resolution pixel-art game sprite: each sprite pixel reads as a clean square block.",
  "Chunky readable silhouette with a dark one-pixel outline around the whole character, crisp edges, limited palette, and small highlight pixels.",
  "Consistent top-left light source.",
] as const;

const BACKGROUND_LINES = [
  `Solid flat pure white ${SPRITE_SHEET_BACKGROUND_HEX} everywhere outside the character. It will be removed by a program.`,
  "No gradient, vignette, texture, floor, ground line, or cast shadow on the background.",
  "Keep the dark outline closed so the white background never touches the character's fill colors. Use cream or pale gray for highlights instead of pure white.",
  "No scenery, borders, UI, text, labels, logo, or watermark.",
] as const;

const AVOID_LINES = [
  "photorealism or painterly blending",
  "anti-aliased halos or soft glows that blend into the background",
  "extra characters",
  "runes, symbols, or text unless the design names them",
] as const;

/**
 * Builds the identity-anchor prompt and the animation-sheet prompt.
 * The anchor follows the south-anchor step of the ai-game-spritesheets
 * pipeline, turned to a side view for battle. The sheet follows its 10-frame
 * attack and idle sheets, laid out with one animation per row as in the
 * game-art-prompt-kit strict-grid profiles.
 * @param design - Character and motion words submitted by the agent
 * @returns Prompts to pass to generate-image, anchor first
 */
export function buildSpriteSheetImagePrompts(
  design: SpriteSheetDesign,
): SpriteSheetImagePrompts {
  return {
    anchorPrompt: buildAnchorPrompt(design),
    sheetPrompt: buildSheetPrompt(design),
  };
}

/**
 * @param facing - Screen direction
 * @returns How the character faces, stated relative to the image
 */
export function describeFacing(facing: SpriteFacing): string {
  const away = facing === "right" ? "left" : "right";
  return `the ${facing.toUpperCase()} EDGE OF THE IMAGE in a three-quarter side view: face, chest, and feet point ${facing}; back points ${away}. Never mirrored, never a front or back view`;
}

/**
 * @param design - Character design
 * @returns Prompt for one neutral idle frame used as the identity reference
 */
function buildAnchorPrompt(design: SpriteSheetDesign): string {
  return [
    "Intended use: one side-view idle sprite frame for a 2D turn-based battle game. This is the identity anchor every animation frame is painted from, so it is calm and neutral on purpose.",
    "",
    "Subject:",
    `- ${design.name}: ${design.description}`,
    `- Faces ${describeFacing(design.facing)}.`,
    `- Silhouette: ${design.silhouette}`,
    `- Costume and palette: ${design.costumeAndPalette}`,
    `- Prop: ${design.prop}`,
    "- Calm, readable neutral idle pose. Not an attack pose; hands and prop at rest.",
    "",
    "Frame rules:",
    "- One character only, centered horizontally.",
    "- Full body visible from the top of the head to the soles of the feet, with generous empty padding on every side.",
    "- Feet planted on one flat baseline in the lower part of the frame.",
    "- No glow, particles, projectile, aura, smoke, or weapon effect. Effects belong only to attack frames.",
    "",
    "Style:",
    ...STYLE_LINES.map((line) => `- ${line}`),
    "",
    "Background:",
    ...BACKGROUND_LINES.map((line) => `- ${line}`),
    "",
    "Avoid:",
    ...AVOID_LINES.map((line) => `- ${line}`),
  ].join("\n");
}

/**
 * @param design - Character design
 * @returns Prompt for the full animation sheet, painted from the anchor
 */
function buildSheetPrompt(design: SpriteSheetDesign): string {
  const rows = SPRITE_SHEET_ANIMATIONS.length;
  const columns = SPRITE_SHEET_FRAMES_PER_ANIMATION;
  const context = {
    attackEffect: design.attackEffect,
    attackMove: design.attackMove,
    defendMove: design.defendMove,
    facingEdge: design.facing,
  };
  const rowOrder = SPRITE_SHEET_ANIMATIONS.map(
    (animation, index) => `Row ${index + 1} ${animation.kind}`,
  ).join(", ");
  const rowSections = SPRITE_SHEET_ANIMATIONS.flatMap((animation, index) => [
    `Row ${index + 1} — ${animation.kind} (${animation.loop ? "seamless loop" : "plays once"}):`,
    ...animation
      .beats(context)
      .map((beat, frame) => `- Frame ${frame + 1}: ${beat}.`),
    "",
  ]);

  return [
    `Intended use: one ${columns}x${rows} animation spritesheet for ${design.name} in a 2D turn-based battle game. A program will slice it into separate animations, so the grid must be exact.`,
    "",
    "Reference image: the approved identity anchor for this character. Preserve the exact identity, outfit, palette, proportions, silhouette, prop placement, pixel-art treatment, and facing direction. Change only the pose in each frame.",
    "",
    "Canvas and layout:",
    `- ${rows} rows by ${columns} columns: ${rows * columns} equal invisible cells filling the whole canvas.`,
    "- Each row is one complete animation, read left to right.",
    `- Row order, top to bottom, exactly: ${rowOrder}.`,
    "- Exactly one full-body pose per cell, centered horizontally in its cell, with clear white space between neighboring poses.",
    "- Feet on the same baseline near the bottom of every cell. Same character scale in every cell.",
    "- Never crop the head, feet, prop, or effect. Nothing crosses into a neighboring cell.",
    `- The character faces ${describeFacing(design.facing)}. Same facing in every frame: no turning, no camera change.`,
    "",
    ...rowSections,
    "Effects:",
    `- Only the attack row may show ${design.attackEffect}. Idle, defend, and hurt frames have no glow, particles, projectile, or aura.`,
    "- Effects stay compact and inside their own cell, without hiding the body or feet.",
    "",
    "Style:",
    ...STYLE_LINES.map((line) => `- ${line}`),
    "- Identical pixel density and palette in every frame.",
    "",
    "Background:",
    ...BACKGROUND_LINES.map((line) => `- ${line}`),
    "",
    "Avoid:",
    ...AVOID_LINES.map((line) => `- ${line}`),
    "- visible grid lines, cell borders, frame numbers, row labels, or comic panels",
    "- merged cells, or recentering the character differently from frame to frame",
  ].join("\n");
}
