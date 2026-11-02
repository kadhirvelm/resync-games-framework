import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { EnemyAsset } from "@resync-game-framework/api";
import { z } from "zod";
import { enemyPatternSchema } from "./enemyPattern";
import { ENEMY_FILE_NAME, ENEMY_MANIFEST_FILE_NAME } from "./enemySpec";

const manifestSchema = z.object({
  createdAt: z.string().min(1),
  description: z.string().min(1),
  id: z.string().min(1),
  maxHitPoints: z.number().int().min(1).max(500),
  pattern: enemyPatternSchema.optional(),
  prompt: z.string().min(1),
  title: z.string().min(1),
});

/**
 * Reads all complete enemy portraits, newest first.
 * @param rootPath - Enemy storage root
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Complete generated enemies
 */
export async function readEnemies(
  rootPath: string,
  publicBaseUrl: string,
): Promise<EnemyAsset[]> {
  const entries = await readEntries(rootPath);
  const enemies = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readEnemy(rootPath, entry.name, publicBaseUrl)),
  );

  return enemies
    .filter((asset): asset is EnemyAsset => asset !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one enemy when both its manifest and WebP exist.
 * @param rootPath - Enemy storage root
 * @param id - Asset folder name
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Enemy metadata, or undefined for an incomplete asset
 */
export async function readEnemy(
  rootPath: string,
  id: string,
  publicBaseUrl: string,
): Promise<EnemyAsset | undefined> {
  try {
    const directory = join(rootPath, id);
    const [manifestText, imageStat] = await Promise.all([
      readFile(join(directory, ENEMY_MANIFEST_FILE_NAME), "utf8"),
      stat(join(directory, ENEMY_FILE_NAME)),
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
      imageUrl: `${publicBaseUrl}/${encodeURIComponent(id)}/${ENEMY_FILE_NAME}`,
      pattern: parsed.data.pattern ?? [],
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
