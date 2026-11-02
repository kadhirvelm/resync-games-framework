import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  AUDIO_CUES,
  AUDIO_ROLES,
  type AudioAsset,
} from "@towers-of-coreborn/api";
import { z } from "zod";
import { AUDIO_FILE_NAME, AUDIO_MANIFEST_FILE_NAME } from "./audioStorage";

const manifestSchema = z.object({
  createdAt: z.string().min(1),
  cue: z.enum(AUDIO_CUES),
  design: z.string().min(1),
  durationSeconds: z.number().positive(),
  id: z.string().min(1),
  loop: z.boolean(),
  prompt: z.string().min(1),
  role: z.enum(AUDIO_ROLES),
  title: z.string().min(1),
  vendor: z.literal("elevenlabs"),
});

/**
 * Reads all complete audio clips, newest first.
 * @param rootPath - Audio storage root
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Complete generated clips
 */
export async function readAudioClips(
  rootPath: string,
  publicBaseUrl: string,
): Promise<AudioAsset[]> {
  const entries = await readEntries(rootPath);
  const clips = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readAudioClip(rootPath, entry.name, publicBaseUrl)),
  );
  return clips
    .filter((asset): asset is AudioAsset => asset !== undefined)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one clip when both its manifest and mp3 exist.
 * @param rootPath - Audio storage root
 * @param id - Asset folder name
 * @param publicBaseUrl - Absolute static URL prefix
 * @returns Clip metadata, or undefined for an incomplete asset
 */
export async function readAudioClip(
  rootPath: string,
  id: string,
  publicBaseUrl: string,
): Promise<AudioAsset | undefined> {
  try {
    const directory = join(rootPath, id);
    const [manifestText, fileStat] = await Promise.all([
      readFile(join(directory, AUDIO_MANIFEST_FILE_NAME), "utf8"),
      stat(join(directory, AUDIO_FILE_NAME)),
    ]);
    if (!fileStat.isFile()) {
      return undefined;
    }
    const parsed = manifestSchema.safeParse(JSON.parse(manifestText));
    if (!parsed.success) {
      return undefined;
    }
    return {
      ...parsed.data,
      audioUrl: `${publicBaseUrl}/${encodeURIComponent(id)}/${AUDIO_FILE_NAME}`,
      id,
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
 * @param rootPath - Directory to list
 * @returns Directory entries, or an empty list when the folder is missing
 */
async function readEntries(rootPath: string): Promise<Dirent[]> {
  try {
    return await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
