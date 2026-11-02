import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { StaticImageAsset } from "@resync-game-framework/api";
import { z } from "zod";
import {
  STATIC_IMAGE_FILE_NAME,
  STATIC_IMAGE_MANIFEST_FILE_NAME,
} from "./staticImageSpec";

const manifestSchema = z.object({
  aspectRatio: z.enum(["1:1", "3:4", "4:3", "9:16", "16:9"]),
  createdAt: z.string().min(1),
  description: z.string().min(1),
  id: z.string().min(1),
  imageSize: z.enum(["1K", "2K"]),
  prompt: z.string().min(1),
  title: z.string().min(1),
});

/**
 * Reads every complete standalone image, newest first.
 * @param rootPath - Static-image storage root
 * @param publicBaseUrl - Absolute public URL prefix
 * @returns Complete generated assets
 */
export async function readStaticImages(
  rootPath: string,
  publicBaseUrl: string,
): Promise<StaticImageAsset[]> {
  const entries = await readEntries(rootPath);
  const images = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readStaticImage(rootPath, entry.name, publicBaseUrl)),
  );
  return images
    .filter((asset): asset is StaticImageAsset => asset !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one static image when both its manifest and WebP exist.
 * @param rootPath - Static-image storage root
 * @param id - Asset folder name
 * @param publicBaseUrl - Absolute public URL prefix
 * @returns Stored metadata, or undefined for an incomplete asset
 */
export async function readStaticImage(
  rootPath: string,
  id: string,
  publicBaseUrl: string,
): Promise<StaticImageAsset | undefined> {
  try {
    const directory = join(rootPath, id);
    const [manifestText, imageStat] = await Promise.all([
      readFile(join(directory, STATIC_IMAGE_MANIFEST_FILE_NAME), "utf8"),
      stat(join(directory, STATIC_IMAGE_FILE_NAME)),
    ]);
    if (!imageStat.isFile()) return undefined;
    const parsed = manifestSchema.safeParse(JSON.parse(manifestText));
    if (!parsed.success) return undefined;
    return {
      ...parsed.data,
      id,
      imageUrl: `${publicBaseUrl}/${encodeURIComponent(id)}/${STATIC_IMAGE_FILE_NAME}`,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

/**
 * Reads a directory that may not exist yet.
 * @param rootPath - Storage root
 * @returns Directory entries or an empty list
 */
async function readEntries(rootPath: string): Promise<Dirent[]> {
  try {
    return await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }
}
