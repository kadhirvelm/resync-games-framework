import { createTool } from "@mastra/core/tools";
import { SPRITE_FACINGS } from "@towers-of-coreborn/api";
import { throwIfAborted } from "src/mastra/agents/generationCancelled";
import { z } from "zod";
import {
  buildSpriteSheetImagePrompts,
  type SpriteSheetImagePrompts,
} from "./buildSpriteSheetImagePrompts";

/** Tool the sprite-sheet agent calls after designing the character. */
export const SUBMIT_SPRITE_SHEET_TOOL_ID = "submit-sprite-sheet";

const submitSpriteSheetSchema = z.object({
  attackEffect: z
    .string()
    .trim()
    .min(4)
    .max(200)
    .describe(
      'The one effect drawn on attack frames, e.g. "a compact violet fireball with ember particles". Use "no effect" for a plain strike.',
    ),
  attackMove: z
    .string()
    .trim()
    .min(4)
    .max(200)
    .describe('The attack motion, e.g. "an overhead hammer smash".'),
  costumeAndPalette: z
    .string()
    .trim()
    .min(10)
    .max(600)
    .describe("Outfit, materials, and a limited palette of named colors."),
  defendMove: z
    .string()
    .trim()
    .min(4)
    .max(200)
    .describe('The guard motion, e.g. "raises a riveted tower shield".'),
  description: z
    .string()
    .trim()
    .min(20)
    .max(800)
    .describe("Who the character is. No image instructions."),
  facing: z
    .enum(SPRITE_FACINGS)
    .describe(
      "right for a party member, who stands on the left. left for an enemy, who stands on the right.",
    ),
  name: z.string().trim().min(2).max(80),
  prop: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe('Carried weapon or tool, or "none".'),
  silhouette: z
    .string()
    .trim()
    .min(10)
    .max(600)
    .describe("Body shape and proportions that must read at small sizes."),
});

/** Accepted sprite-sheet design. */
export type SpriteSheetDraft = z.infer<typeof submitSpriteSheetSchema>;

/** Per-query state filled by the submit tool. */
export interface SpriteSheetGenerationState {
  draft?: SpriteSheetDraft;
  prompts?: SpriteSheetImagePrompts;
}

/**
 * Builds the request-scoped design submission tool. It returns the exact
 * anchor and sheet prompts so the painted row order always matches the order
 * the splitter expects.
 * @param state - State that receives the accepted design and prompts
 * @param signal - Stops submission when generation is cancelled
 * @returns A Mastra tool keyed by {@link SUBMIT_SPRITE_SHEET_TOOL_ID}
 */
export function createSpriteSheetTools(
  state: SpriteSheetGenerationState,
  signal: AbortSignal,
) {
  return {
    [SUBMIT_SPRITE_SHEET_TOOL_ID]: createTool({
      description:
        "Submit the character design before painting. Returns anchorPrompt and sheetPrompt; pass them unchanged to generate-image, anchor first.",
      execute: async (input: SpriteSheetDraft) => {
        throwIfAborted(signal);
        const prompts = buildSpriteSheetImagePrompts(input);
        state.draft = input;
        state.prompts = prompts;
        return { accepted: true as const, ...prompts };
      },
      id: SUBMIT_SPRITE_SHEET_TOOL_ID,
      inputSchema: submitSpriteSheetSchema,
      outputSchema: z.object({
        accepted: z.literal(true),
        anchorPrompt: z.string(),
        sheetPrompt: z.string(),
      }),
    }),
  };
}
