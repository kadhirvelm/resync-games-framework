import { InternalServerErrorException } from "@nestjs/common";
import type {
  StaticImageAspectRatio,
  StaticImageSize,
} from "@resync-game-framework/api";
import type { GeneratedImage } from "src/mastra/tools/generateImageTool.service";
import { z } from "zod";

const MIN_DESCRIPTION_LENGTH = 20;
const aspectRatioSchema = z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]);
const imageSizeSchema = z.enum(["1K", "2K"]);

const staticImageResultSchema = z.object({
  aspectRatio: aspectRatioSchema,
  imageSize: imageSizeSchema,
  images: z.tuple([
    z.object({
      filePath: z.string().trim().min(1),
      name: z.string().trim().min(1).max(100),
      notes: z.string().trim().min(MIN_DESCRIPTION_LENGTH).max(800),
    }),
  ]),
});

/** Validated output from one generate-image call. */
export interface StaticImageResult {
  aspectRatio: StaticImageAspectRatio;
  image: GeneratedImage;
  imageSize: StaticImageSize;
}

const FAILURE_MESSAGE =
  "Static image generation failed: generate-image must return exactly one supported image with a title and description of at least 20 characters.";

/**
 * Validates the image tool result before it can be persisted.
 * @param rawResult - Value returned by generate-image
 * @returns One image plus its requested dimensions
 * @throws InternalServerErrorException when the result is incomplete
 */
export function readStaticImageResult(rawResult: unknown): StaticImageResult {
  const parsed = staticImageResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new InternalServerErrorException(FAILURE_MESSAGE);
  }
  const image = parsed.data.images[0];
  return {
    aspectRatio: parsed.data.aspectRatio,
    image: {
      filePath: image.filePath,
      name: image.name,
      notes: image.notes,
    },
    imageSize: parsed.data.imageSize,
  };
}
