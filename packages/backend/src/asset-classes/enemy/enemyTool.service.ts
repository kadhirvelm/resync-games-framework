import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import sharp from "sharp";
import {
  deleteImageFiles,
  type GeneratedImage,
} from "src/mastra/tools/generateImageTool.service";
import { encodeGeneratedImageAsWebp } from "../shared/encodeGeneratedImageAsWebp";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import {
  ENEMY_FILE_NAME,
  ENEMY_MANIFEST_FILE_NAME,
  MIN_ENEMY_EDGE_PX,
} from "./enemySpec";
import { ENEMY_STORAGE } from "./enemyStorage";
import type { EnemyDraft } from "./enemyTools";

/**
 * Stores the portrait returned by the generate-image tool.
 */
@Injectable()
export class EnemyToolService {
  /**
   * Copies a generate-image result into the enemy folder and writes its manifest.
   * The temp file from the image tool is removed after the copy, including when saving fails.
   * @param params - The portrait and the user's original creature idea
   * @returns The saved enemy id
   * @throws InternalServerErrorException when the portrait is too small
   */
  public async saveGeneratedEnemy(params: {
    draft: EnemyDraft;
    id: string;
    image: GeneratedImage;
    sourcePrompt: string;
  }): Promise<{ id: string }> {
    const id = params.id;
    const directory = ENEMY_STORAGE.filePath(id);

    try {
      await writeAssetDirectoryAtomically(directory, async (pending) => {
        await persistPortrait(params.image.filePath, pending);
        await writeFile(
          join(pending, ENEMY_MANIFEST_FILE_NAME),
          JSON.stringify(
            {
              createdAt: new Date().toISOString(),
              description: params.draft.description,
              id,
              maxHitPoints: params.draft.maxHitPoints,
              pattern: params.draft.pattern,
              prompt: params.sourcePrompt,
              title: params.draft.name,
            },
            null,
            2,
          ),
        );
      });
      return { id };
    } finally {
      await deleteImageFiles([params.image.filePath]);
    }
  }
}

/**
 * Re-encodes the model image as WebP in the asset directory.
 * @param filePath - Temp file from the generate-image tool
 * @param directory - Destination asset directory
 * @throws InternalServerErrorException when the portrait is below the minimum edge
 */
async function persistPortrait(
  filePath: string,
  directory: string,
): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_ENEMY_EDGE_PX || height < MIN_ENEMY_EDGE_PX) {
    throw new InternalServerErrorException(
      `Generated enemy portrait was ${width}x${height}, below ${MIN_ENEMY_EDGE_PX}px.`,
    );
  }

  const webp = await encodeGeneratedImageAsWebp(filePath);
  await writeFile(join(directory, ENEMY_FILE_NAME), webp);
}
