import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BattleBackgroundAsset } from "@resync-game-framework/api";
import { z } from "zod";
import {
  BATTLE_BACKGROUND_FILE_NAME,
  BATTLE_BACKGROUND_MANIFEST_FILE_NAME,
} from "./battleBackgroundSpec";

const manifestSchema = z.object({
  createdAt: z.string().min(1),
  description: z.string().min(1),
  id: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().min(1),
});

/**
 * Reads all complete background assets, newest first.
 * @param rootPath - Battle-background storage root
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Complete generated backgrounds
 */
export async function readBattleBackgrounds(
  rootPath: string,
  publicBaseUrl: string,
): Promise<BattleBackgroundAsset[]> {
  const entries = await readEntries(rootPath);
  const backgrounds = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) =>
        readBattleBackground(rootPath, entry.name, publicBaseUrl),
      ),
  );

  return backgrounds
    .filter((asset): asset is BattleBackgroundAsset => asset !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one background when both its manifest and WebP exist.
 * @param rootPath - Battle-background storage root
 * @param id - Asset folder name
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Background metadata, or undefined for an incomplete asset
 */
export async function readBattleBackground(
  rootPath: string,
  id: string,
  publicBaseUrl: string,
): Promise<BattleBackgroundAsset | undefined> {
  try {
    const directory = join(rootPath, id);
    const [manifestText, imageStat] = await Promise.all([
      readFile(join(directory, BATTLE_BACKGROUND_MANIFEST_FILE_NAME), "utf8"),
      stat(join(directory, BATTLE_BACKGROUND_FILE_NAME)),
    ]);
    if (!imageStat.isFile()) {
      return undefined;
    }
    const parsed = manifestSchema.safeParse(JSON.parse(manifestText));
    if (!parsed.success) {
      return undefined;
    }
    return {
      ...parsed.data,
      id,
      imageUrl: `${publicBaseUrl}/${encodeURIComponent(id)}/${BATTLE_BACKGROUND_FILE_NAME}`,
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
