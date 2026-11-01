import { InternalServerErrorException } from "@nestjs/common";
import type { GeneratedImage } from "src/mastra/tools/generateImageTool.service";
import { z } from "zod";
import { SPRITE_SHEET_IMAGE_CONFIG } from "./spriteSheetSpec";

const MIN_NOTES_LENGTH = 20;

const imageSchema = z.object({
  filePath: z.string().trim().min(1),
  name: z.string().trim().min(1).max(80),
  notes: z.string().trim().min(MIN_NOTES_LENGTH).max(800),
});

const spriteSheetImagesSchema = z.object({
  aspectRatio: z.literal(SPRITE_SHEET_IMAGE_CONFIG.aspectRatio),
  imageSize: z.literal(SPRITE_SHEET_IMAGE_CONFIG.imageSize),
  images: z.tuple([imageSchema, imageSchema]),
  usedFirstImageAsReference: z.literal(true),
});

/** The anchor and the sheet painted from it. */
export interface SpriteSheetImages {
  anchor: GeneratedImage;
  sheet: GeneratedImage;
}

const FAILURE_MESSAGE = `Sprite sheet generation failed: generate-image must return two ${SPRITE_SHEET_IMAGE_CONFIG.aspectRatio} ${SPRITE_SHEET_IMAGE_CONFIG.imageSize} images, the anchor then the sheet, with the sheet painted from the anchor.`;

/**
 * Checks that a generate-image result is an anchor followed by a sheet painted from it.
 * @param rawResult - Value returned by the generate-image tool
 * @returns The anchor and sheet files
 * @throws InternalServerErrorException when the result has the wrong shape
 */
export function readSpriteSheetImages(rawResult: unknown): SpriteSheetImages {
  const parsed = spriteSheetImagesSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new InternalServerErrorException(FAILURE_MESSAGE);
  }
  const [anchor, sheet] = parsed.data.images;
  return { anchor, sheet };
}
