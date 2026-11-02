import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { CardCharacterSetAsset } from "@resync-game-framework/api";
import {
  CARD_CHARACTER_MANIFEST_FILE_NAME,
  type CardCharacterLevelNumber,
  cardCharacterLevelFileName,
  isCardCharacterLevelNumber,
  orderCardCharacterLevels,
} from "./cardCharacterSpec";

interface ManifestLevel {
  description: string;
  fileName: string;
  level: CardCharacterLevelNumber;
  title: string;
}

interface CardCharacterManifest {
  createdAt: string;
  levels: ManifestLevel[];
  prompt: string;
  setId: string;
  theme: string;
}

/**
 * Reads saved card-character sets from disk.
 * A directory without a valid manifest, or with a missing portrait, is skipped.
 * @param rootPath - Absolute card-character static root
 * @param publicBaseUrl - Public URL prefix without a trailing slash
 * @returns Sets newest first
 */
export async function readCardCharacterSets(
  rootPath: string,
  publicBaseUrl: string,
): Promise<CardCharacterSetAsset[]> {
  const entries = await readDirectoryEntries(rootPath);
  const sets: CardCharacterSetAsset[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const set = await readSet(
      join(rootPath, entry.name),
      entry.name,
      publicBaseUrl,
    );
    if (set !== undefined) {
      sets.push(set);
    }
  }

  sets.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return sets;
}

/**
 * Reads one saved card-character set.
 * @param rootPath - Absolute card-character static root
 * @param setId - Folder name of the set
 * @param publicBaseUrl - Public URL prefix without a trailing slash
 * @returns The set, or `undefined` when its manifest or a portrait is missing
 */
export function readCardCharacterSet(
  rootPath: string,
  setId: string,
  publicBaseUrl: string,
): Promise<CardCharacterSetAsset | undefined> {
  return readSet(join(rootPath, setId), setId, publicBaseUrl);
}

/**
 * @param rootPath - Directory that may not exist yet
 * @returns Directory entries, or an empty list when the root is missing
 */
async function readDirectoryEntries(rootPath: string): Promise<Dirent[]> {
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

/**
 * @param setDirectory - Absolute path of one character set
 * @param directoryName - Folder name, used as the public set id
 * @param publicBaseUrl - Public URL prefix without a trailing slash
 * @returns The set when the manifest and all four portraits are present
 */
async function readSet(
  setDirectory: string,
  directoryName: string,
  publicBaseUrl: string,
): Promise<CardCharacterSetAsset | undefined> {
  const manifest = await readManifest(setDirectory);
  if (manifest === undefined) {
    return undefined;
  }

  const portraitsExist = await allPortraitsExist(setDirectory, manifest.levels);
  if (!portraitsExist) {
    return undefined;
  }

  return {
    createdAt: manifest.createdAt,
    levels: manifest.levels.map((level) => ({
      description: level.description,
      fileName: level.fileName,
      level: level.level,
      title: level.title,
      url: `${publicBaseUrl}/${encodeURIComponent(directoryName)}/${encodeURIComponent(level.fileName)}`,
    })),
    prompt: manifest.prompt,
    setId: directoryName,
    theme: manifest.theme,
  };
}

/**
 * @param setDirectory - Absolute path of one character set
 * @returns Parsed manifest, or `undefined` when the file is missing or invalid
 */
async function readManifest(
  setDirectory: string,
): Promise<CardCharacterManifest | undefined> {
  let rawText: string;
  try {
    rawText = await readFile(
      join(setDirectory, CARD_CHARACTER_MANIFEST_FILE_NAME),
      "utf8",
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }

  return parseManifest(parsed);
}

/**
 * @param value - JSON value read from `manifest.json`
 * @returns A manifest with levels 1–4 in order, or `undefined` when the shape is wrong
 */
function parseManifest(value: unknown): CardCharacterManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const createdAt = value.createdAt;
  const prompt = value.prompt;
  const setId = value.setId;
  const theme = value.theme;
  if (
    typeof createdAt !== "string" ||
    typeof prompt !== "string" ||
    typeof setId !== "string" ||
    typeof theme !== "string" ||
    createdAt === "" ||
    prompt === "" ||
    setId === "" ||
    theme === ""
  ) {
    return undefined;
  }

  const levels = parseLevels(value.levels);
  if (levels === undefined) {
    return undefined;
  }

  return { createdAt, levels, prompt, setId, theme };
}

/**
 * @param value - `levels` field from a manifest
 * @returns Four levels in order, or `undefined` when any stage is missing
 */
function parseLevels(value: unknown): ManifestLevel[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const levels: ManifestLevel[] = [];
  for (const entry of value) {
    const level = parseLevel(entry);
    if (level === undefined) {
      return undefined;
    }
    levels.push(level);
  }

  return orderCardCharacterLevels(levels);
}

/**
 * @param value - One manifest level entry
 * @returns The level when it matches the expected portrait file name
 */
function parseLevel(value: unknown): ManifestLevel | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const description = value.description;
  const fileName = value.fileName;
  const level = value.level;
  const title = value.title;
  if (!isCardCharacterLevelNumber(level)) {
    return undefined;
  }
  if (typeof description !== "string" || description.trim() === "") {
    return undefined;
  }
  if (typeof title !== "string" || title.trim() === "") {
    return undefined;
  }
  if (fileName !== cardCharacterLevelFileName(level)) {
    return undefined;
  }

  return {
    description: description.trim(),
    fileName,
    level,
    title: title.trim(),
  };
}

/**
 * @param setDirectory - Absolute path of one character set
 * @param levels - Manifest levels whose files must exist
 * @returns Whether every portrait file is present
 */
async function allPortraitsExist(
  setDirectory: string,
  levels: ManifestLevel[],
): Promise<boolean> {
  for (const level of levels) {
    const exists = await isFile(join(setDirectory, level.fileName));
    if (!exists) {
      return false;
    }
  }
  return true;
}

/**
 * @param filePath - Candidate portrait path
 * @returns Whether the path is an existing file
 */
async function isFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * @param value - Unknown JSON value
 * @returns Whether the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
