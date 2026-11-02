import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import sharp from "sharp";
import { deleteImageFiles } from "src/mastra/tools/generateImageTool.service";
import { encodeGeneratedImageAsWebp } from "../shared/encodeGeneratedImageAsWebp";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import {
  normalizeSpriteSheet,
  removeSpriteBackground,
} from "./normalizeSpriteSheet";
import type { SpriteSheetImages } from "./readSpriteSheetImages";
import {
  MIN_SPRITE_SHEET_EDGE_PX,
  SPRITE_SHEET_ANCHOR_FILE_NAME,
  SPRITE_SHEET_ANIMATIONS,
  SPRITE_SHEET_FRAMES_PER_ANIMATION,
  SPRITE_SHEET_MANIFEST_FILE_NAME,
  SPRITE_SHEET_SOURCE_FILE_NAME,
  spriteAnimationFileName,
} from "./spriteSheetSpec";
import { SPRITE_SHEET_STORAGE } from "./spriteSheetStorage";
import type { SpriteSheetDraft } from "./spriteSheetTools";

/**
 * Splits and stores the images returned by the generate-image tool.
 */
@Injectable()
export class SpriteSheetToolService {
  /**
   * Normalizes the sheet into one strip per animation and writes the folder.
   * The temp files from the image tool are removed afterwards, including when saving fails.
   * @param params - Accepted design, painted images, and the user's original request
   * @returns The saved sprite sheet id
   * @throws InternalServerErrorException when the sheet is too small or a row is empty
   */
  public async saveGeneratedSpriteSheet(params: {
    draft: SpriteSheetDraft;
    id: string;
    images: SpriteSheetImages;
    sourcePrompt: string;
  }): Promise<{ id: string }> {
    const id = params.id;
    const directory = SPRITE_SHEET_STORAGE.filePath(id);

    try {
      await writeAssetDirectoryAtomically(directory, async (pending) => {
        const { anchor, sheet } = params.images;
        await assertSheetSize(sheet.filePath);
        const normalized = await normalizeSheet(sheet.filePath);

        await Promise.all([
          writeFile(
            join(pending, SPRITE_SHEET_SOURCE_FILE_NAME),
            await encodeGeneratedImageAsWebp(sheet.filePath),
          ),
          writeFile(
            join(pending, SPRITE_SHEET_ANCHOR_FILE_NAME),
            await removeSpriteBackground(anchor.filePath),
          ),
          ...normalized.animations.map((animation, index) =>
            writeFile(
              join(pending, spriteAnimationFileName(animationKind(index))),
              animation.strip,
            ),
          ),
        ]);
        await writeFile(
          join(pending, SPRITE_SHEET_MANIFEST_FILE_NAME),
          JSON.stringify(
            {
              animations: SPRITE_SHEET_ANIMATIONS.map((animation, index) => ({
                description: animation.description,
                fps: animation.fps,
                frameCount:
                  normalized.animations[index]?.frameCount ??
                  SPRITE_SHEET_FRAMES_PER_ANIMATION,
                kind: animation.kind,
                label: animation.label,
                loop: animation.loop,
              })),
              attackEffect: params.draft.attackEffect,
              attackMove: params.draft.attackMove,
              createdAt: new Date().toISOString(),
              defendMove: params.draft.defendMove,
              description: params.draft.description,
              facing: params.draft.facing,
              frameHeight: normalized.frameHeight,
              frameWidth: normalized.frameWidth,
              id,
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
      await deleteImageFiles([
        params.images.anchor.filePath,
        params.images.sheet.filePath,
      ]);
    }
  }
}

/**
 * @param filePath - Sheet painted by the model
 * @throws InternalServerErrorException when the sheet's shorter edge is below the minimum
 */
async function assertSheetSize(filePath: string): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (Math.min(width, height) < MIN_SPRITE_SHEET_EDGE_PX) {
    throw new InternalServerErrorException(
      `Generated sprite sheet was ${width}x${height}, below ${MIN_SPRITE_SHEET_EDGE_PX}px.`,
    );
  }
}

/**
 * @param filePath - Sheet painted by the model
 * @returns Normalized strips, one per animation row
 * @throws InternalServerErrorException when a row has no visible character
 */
async function normalizeSheet(filePath: string) {
  try {
    return await normalizeSpriteSheet(filePath, {
      columns: SPRITE_SHEET_FRAMES_PER_ANIMATION,
      rows: SPRITE_SHEET_ANIMATIONS.length,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new InternalServerErrorException(
      `Sprite sheet could not be split into animations: ${reason}`,
    );
  }
}

/**
 * @param index - Sheet row
 * @returns The animation painted on that row
 */
function animationKind(index: number) {
  const animation = SPRITE_SHEET_ANIMATIONS[index];
  if (animation === undefined) {
    throw new InternalServerErrorException(
      `Sprite sheet row ${index + 1} has no animation.`,
    );
  }
  return animation.kind;
}
