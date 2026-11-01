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
  BATTLE_BACKGROUND_FILE_NAME,
  BATTLE_BACKGROUND_MANIFEST_FILE_NAME,
  MIN_BATTLE_BACKGROUND_HEIGHT_PX,
  MIN_BATTLE_BACKGROUND_WIDTH_PX,
} from "./battleBackgroundSpec";
import { BATTLE_BACKGROUND_STORAGE } from "./battleBackgroundStorage";

/**
 * Stores the room painting returned by the generate-image tool.
 */
@Injectable()
export class BattleBackgroundToolService {
  /**
   * Copies a generate-image result into the battle-background folder and writes its manifest.
   * The temp file from the image tool is removed after the copy, including when saving fails.
   * @param params - The painting and the user's original room idea
   * @returns The saved background id
   * @throws InternalServerErrorException when the painting is too small
   */
  public async saveGeneratedBackground(params: {
    id: string;
    image: GeneratedImage;
    sourcePrompt: string;
  }): Promise<{ id: string }> {
    const id = params.id;
    const directory = BATTLE_BACKGROUND_STORAGE.filePath(id);

    try {
      await writeAssetDirectoryAtomically(directory, async (pending) => {
        await this.persistImage(params.image.filePath, pending);
        await writeFile(
          join(pending, BATTLE_BACKGROUND_MANIFEST_FILE_NAME),
          JSON.stringify(
            {
              createdAt: new Date().toISOString(),
              description: params.image.notes,
              id,
              prompt: params.sourcePrompt,
              title: params.image.name,
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

  /**
   * Re-encodes the model image as WebP in the asset directory.
   * @param filePath - Temp file from the generate-image tool
   * @param directory - Destination asset directory
   */
  private async persistImage(
    filePath: string,
    directory: string,
  ): Promise<void> {
    const metadata = await sharp(filePath).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (
      width < MIN_BATTLE_BACKGROUND_WIDTH_PX ||
      height < MIN_BATTLE_BACKGROUND_HEIGHT_PX
    ) {
      throw new InternalServerErrorException(
        `Generated background was ${width}x${height}.`,
      );
    }
    const webp = await encodeGeneratedImageAsWebp(filePath);
    await writeFile(join(directory, BATTLE_BACKGROUND_FILE_NAME), webp);
  }
}
