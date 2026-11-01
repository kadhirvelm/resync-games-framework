import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import sharp from "sharp";
import { deleteImageFiles } from "src/mastra/tools/generateImageTool.service";
import { encodeGeneratedImageAsWebp } from "../shared/encodeGeneratedImageAsWebp";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import {
  CARD_CHARACTER_CANVAS_BACKGROUND,
  CARD_CHARACTER_CANVAS_PX,
  CARD_CHARACTER_MANIFEST_FILE_NAME,
  type CardCharacterLevelNumber,
  cardCharacterLevelFileName,
  isCardCharacterLevelNumber,
} from "./cardCharacterSpec";
import { CARD_CHARACTER_STORAGE } from "./cardCharacterStorage";
import type { CardCharacterImageSet } from "./readCardCharacterImageSet";

const MIN_PORTRAIT_EDGE_PX = 64;

interface SavedLevel {
  description: string;
  fileName: string;
  level: CardCharacterLevelNumber;
  title: string;
}

/**
 * Stores the four portraits returned by the generate-image tool.
 */
@Injectable()
export class CardCharacterToolService {
  /**
   * Copies a generate-image result into a card-character set and writes its manifest.
   * Temp files from the image tool are removed after the copy, including when saving fails.
   * @param params - Portraits from the tool and the user's original prompt
   * @returns The saved set id
   * @throws InternalServerErrorException when a portrait is unusable
   */
  public async saveGeneratedPortraits(params: {
    portraits: CardCharacterImageSet;
    setId: string;
    sourcePrompt: string;
  }): Promise<{ setId: string }> {
    const setId = params.setId;
    const setDirectory = CARD_CHARACTER_STORAGE.filePath(setId);
    const tempPaths = params.portraits.images.map((image) => image.filePath);

    try {
      await writeAssetDirectoryAtomically(setDirectory, async (pending) => {
        const levels = await this.persistPortraits(params.portraits, pending);
        await this.writeManifest({
          levels,
          setDirectory: pending,
          setId,
          sourcePrompt: params.sourcePrompt,
          theme: params.portraits.theme,
        });
      });
      return { setId };
    } finally {
      await deleteImageFiles(tempPaths);
    }
  }

  /**
   * @param portraits - Four generated portraits, weakest first
   * @param setDirectory - Destination directory
   * @returns Saved level metadata in level order
   */
  private async persistPortraits(
    portraits: CardCharacterImageSet,
    setDirectory: string,
  ): Promise<SavedLevel[]> {
    const saved: SavedLevel[] = [];

    for (const [index, portrait] of portraits.images.entries()) {
      const levelNumber = index + 1;
      if (!isCardCharacterLevelNumber(levelNumber)) {
        throw new InternalServerErrorException(
          "Card character generation requires levels 1, 2, 3, and 4.",
        );
      }
      saved.push(
        await this.persistPortrait({
          description: portrait.notes,
          filePath: portrait.filePath,
          level: levelNumber,
          setDirectory,
          title: portrait.name,
        }),
      );
    }

    return saved;
  }

  /**
   * Fits one model image onto the shared canvas and writes it as WebP.
   * The image is scaled to fit without cropping and padded with white.
   * @param params - Source file, stage, and destination
   * @returns Saved portrait metadata
   * @throws InternalServerErrorException when the source image is below the minimum edge
   */
  private async persistPortrait(params: {
    description: string;
    filePath: string;
    level: CardCharacterLevelNumber;
    setDirectory: string;
    title: string;
  }): Promise<SavedLevel> {
    const metadata = await sharp(params.filePath).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (width < MIN_PORTRAIT_EDGE_PX || height < MIN_PORTRAIT_EDGE_PX) {
      throw new InternalServerErrorException(
        `Generated portrait was ${width}x${height}, below ${MIN_PORTRAIT_EDGE_PX}px.`,
      );
    }

    const fitted = await encodeGeneratedImageAsWebp(
      await sharp(params.filePath)
        .resize({
          background: CARD_CHARACTER_CANVAS_BACKGROUND,
          fit: "contain",
          height: CARD_CHARACTER_CANVAS_PX.height,
          width: CARD_CHARACTER_CANVAS_PX.width,
        })
        .toBuffer(),
    );

    const fileName = cardCharacterLevelFileName(params.level);
    await writeFile(join(params.setDirectory, fileName), fitted);

    return {
      description: params.description,
      fileName,
      level: params.level,
      title: params.title,
    };
  }

  /**
   * @param params - Completed portraits and the prompt that produced them
   */
  private async writeManifest(params: {
    levels: SavedLevel[];
    setDirectory: string;
    setId: string;
    sourcePrompt: string;
    theme: string;
  }): Promise<void> {
    const manifest = {
      createdAt: new Date().toISOString(),
      levels: params.levels.map((level) => ({
        description: level.description,
        fileName: level.fileName,
        level: level.level,
        title: level.title,
      })),
      prompt: params.sourcePrompt,
      setId: params.setId,
      theme: params.theme,
    };

    await writeFile(
      join(params.setDirectory, CARD_CHARACTER_MANIFEST_FILE_NAME),
      JSON.stringify(manifest, null, 2),
    );
  }
}
