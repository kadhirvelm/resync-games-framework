import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import type {
  StaticImageAspectRatio,
  StaticImageSize,
} from "@resync-game-framework/api";
import sharp from "sharp";
import {
  deleteImageFiles,
  type GeneratedImage,
} from "src/mastra/tools/generateImageTool.service";
import { encodeGeneratedImageAsWebp } from "../shared/encodeGeneratedImageAsWebp";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import {
  MIN_STATIC_IMAGE_EDGE_PX,
  STATIC_IMAGE_FILE_NAME,
  STATIC_IMAGE_MANIFEST_FILE_NAME,
} from "./staticImageSpec";
import { STATIC_IMAGE_STORAGE } from "./staticImageStorage";

/** Stores images returned by the shared image-generation tool. */
@Injectable()
export class StaticImageToolService {
  /**
   * Publishes one image and its metadata atomically.
   * @param params - Generated image, dimensions, run id, and original request
   * @returns The stable stored id
   */
  public async saveGeneratedImage(params: {
    aspectRatio: StaticImageAspectRatio;
    id: string;
    image: GeneratedImage;
    imageSize: StaticImageSize;
    sourcePrompt: string;
  }): Promise<{ id: string }> {
    const directory = STATIC_IMAGE_STORAGE.filePath(params.id);
    try {
      await writeAssetDirectoryAtomically(directory, async (pending) => {
        await persistImage(params.image.filePath, pending);
        await writeFile(
          join(pending, STATIC_IMAGE_MANIFEST_FILE_NAME),
          JSON.stringify(
            {
              aspectRatio: params.aspectRatio,
              createdAt: new Date().toISOString(),
              description: params.image.notes,
              id: params.id,
              imageSize: params.imageSize,
              prompt: params.sourcePrompt,
              title: params.image.name,
            },
            null,
            2,
          ),
        );
      });
      return { id: params.id };
    } finally {
      await deleteImageFiles([params.image.filePath]);
    }
  }
}

/**
 * Re-encodes a provider image as WebP while preserving alpha.
 * @param filePath - Temporary provider output
 * @param directory - Pending atomic-publication directory
 */
async function persistImage(
  filePath: string,
  directory: string,
): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_STATIC_IMAGE_EDGE_PX || height < MIN_STATIC_IMAGE_EDGE_PX) {
    throw new InternalServerErrorException(
      `Generated static image was ${width}x${height}, below ${MIN_STATIC_IMAGE_EDGE_PX}px on one edge.`,
    );
  }
  const webp = await encodeGeneratedImageAsWebp(filePath);
  await writeFile(join(directory, STATIC_IMAGE_FILE_NAME), webp);
}
