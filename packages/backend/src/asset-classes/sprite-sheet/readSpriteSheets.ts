import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  SPRITE_ANIMATION_KINDS,
  SPRITE_FACINGS,
  type SpriteSheetAsset,
} from "@resync-game-framework/api";
import { z } from "zod";
import {
  SPRITE_SHEET_ANCHOR_FILE_NAME,
  SPRITE_SHEET_MANIFEST_FILE_NAME,
  SPRITE_SHEET_SOURCE_FILE_NAME,
  spriteAnimationFileName,
} from "./spriteSheetSpec";

const manifestSchema = z.object({
  animations: z
    .array(
      z.object({
        description: z.string(),
        fps: z.number().positive(),
        frameCount: z.number().int().min(1),
        kind: z.enum(SPRITE_ANIMATION_KINDS),
        label: z.string().min(1),
        loop: z.boolean(),
      }),
    )
    .min(1),
  createdAt: z.string().min(1),
  description: z.string().min(1),
  facing: z.enum(SPRITE_FACINGS),
  frameHeight: z.number().int().min(1),
  frameWidth: z.number().int().min(1),
  id: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().min(1),
});

/**
 * Reads all complete sprite sheets, newest first.
 * @param rootPath - Sprite-sheet storage root
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Complete generated sprite sheets
 */
export async function readSpriteSheets(
  rootPath: string,
  publicBaseUrl: string,
): Promise<SpriteSheetAsset[]> {
  const entries = await readEntries(rootPath);
  const sheets = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readSpriteSheet(rootPath, entry.name, publicBaseUrl)),
  );

  return sheets
    .filter((asset): asset is SpriteSheetAsset => asset !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one sprite sheet when its manifest and every animation strip exist.
 * @param rootPath - Sprite-sheet storage root
 * @param id - Asset folder name
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Sprite-sheet metadata, or undefined for an incomplete asset
 */
export async function readSpriteSheet(
  rootPath: string,
  id: string,
  publicBaseUrl: string,
): Promise<SpriteSheetAsset | undefined> {
  try {
    const directory = join(rootPath, id);
    const manifestText = await readFile(
      join(directory, SPRITE_SHEET_MANIFEST_FILE_NAME),
      "utf8",
    );
    const parsed = manifestSchema.safeParse(JSON.parse(manifestText));
    if (!parsed.success) {
      return undefined;
    }
    const manifest = parsed.data;
    const files = [
      SPRITE_SHEET_ANCHOR_FILE_NAME,
      SPRITE_SHEET_SOURCE_FILE_NAME,
      ...manifest.animations.map((animation) =>
        spriteAnimationFileName(animation.kind),
      ),
    ];
    const stats = await Promise.all(
      files.map((fileName) => stat(join(directory, fileName))),
    );
    if (!stats.every((fileStat) => fileStat.isFile())) {
      return undefined;
    }

    const fileUrl = (fileName: string) =>
      `${publicBaseUrl}/${encodeURIComponent(id)}/${fileName}`;
    return {
      anchorUrl: fileUrl(SPRITE_SHEET_ANCHOR_FILE_NAME),
      animations: manifest.animations.map((animation) => ({
        ...animation,
        stripUrl: fileUrl(spriteAnimationFileName(animation.kind)),
      })),
      createdAt: manifest.createdAt,
      description: manifest.description,
      facing: manifest.facing,
      frameHeight: manifest.frameHeight,
      frameWidth: manifest.frameWidth,
      id,
      prompt: manifest.prompt,
      sheetUrl: fileUrl(SPRITE_SHEET_SOURCE_FILE_NAME),
      title: manifest.title,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * @param rootPath - Directory that may not exist yet
 * @returns Directory entries or an empty list
 */
async function readEntries(rootPath: string): Promise<Dirent[]> {
  try {
    return await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return [];
    }
    throw error;
  }
}
