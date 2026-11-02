import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  PlayableCardAsset,
  PlayableCardChainKind,
  PlayableCardEffect,
  PlayableCardKind,
  PlayableCardLoreSource,
} from "@resync-game-framework/api";
import {
  isPlayableCardChainKind,
  isPlayableCardKind,
  PLAYABLE_CARD_IMAGE_FILE_NAME,
  PLAYABLE_CARD_MANIFEST_FILE_NAME,
} from "./playableCardSpec";

interface PlayableCardManifest {
  aetherCost: number;
  cardId: string;
  createdAt: string;
  description: string;
  effects: PlayableCardEffect[];
  imageFileName: string;
  kind: PlayableCardKind;
  loreSources: PlayableCardLoreSource[];
  name: string;
  prompt: string;
}

/**
 * Reads saved playable cards from disk.
 * A directory without a valid manifest, or with a missing image, is skipped.
 * @param rootPath - Absolute playable-card static root
 * @param publicBaseUrl - Public URL prefix without a trailing slash
 * @returns Cards newest first
 */
export async function readPlayableCards(
  rootPath: string,
  publicBaseUrl: string,
): Promise<PlayableCardAsset[]> {
  const entries = await readDirectoryEntries(rootPath);
  const cards: PlayableCardAsset[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }
    const card = await readPlayableCard(rootPath, entry.name, publicBaseUrl);
    if (card !== undefined) {
      cards.push(card);
    }
  }

  cards.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return cards;
}

/**
 * Reads one saved playable card.
 * @param rootPath - Absolute playable-card static root
 * @param cardId - Folder name of the card
 * @param publicBaseUrl - Public URL prefix without a trailing slash
 * @returns The card, or `undefined` when its manifest or image is missing
 */
export async function readPlayableCard(
  rootPath: string,
  cardId: string,
  publicBaseUrl: string,
): Promise<PlayableCardAsset | undefined> {
  const directory = join(rootPath, cardId);
  const manifest = await readManifest(directory);
  if (manifest === undefined) {
    return undefined;
  }

  const imageExists = await isFile(
    join(directory, PLAYABLE_CARD_IMAGE_FILE_NAME),
  );
  if (!imageExists) {
    return undefined;
  }

  return {
    ...manifest,
    cardId,
    imageUrl: `${publicBaseUrl}/${encodeURIComponent(cardId)}/${encodeURIComponent(PLAYABLE_CARD_IMAGE_FILE_NAME)}`,
  };
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
 * @param directory - Absolute path of one card
 * @returns Parsed manifest, or `undefined` when the file is missing or invalid
 */
async function readManifest(
  directory: string,
): Promise<PlayableCardManifest | undefined> {
  let rawText: string;
  try {
    rawText = await readFile(
      join(directory, PLAYABLE_CARD_MANIFEST_FILE_NAME),
      "utf8",
    );
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  try {
    return parseManifest(JSON.parse(rawText) as unknown);
  } catch {
    return undefined;
  }
}

/**
 * @param value - JSON value read from `manifest.json`
 * @returns A manifest, or `undefined` when the shape is wrong
 */
function parseManifest(value: unknown): PlayableCardManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const aetherCost = value.aetherCost;
  const createdAt = value.createdAt;
  const description = value.description;
  const imageFileName = value.imageFileName;
  const kind = value.kind;
  const name = value.name;
  const prompt = value.prompt;
  if (
    typeof aetherCost !== "number" ||
    !Number.isInteger(aetherCost) ||
    typeof createdAt !== "string" ||
    createdAt === "" ||
    typeof description !== "string" ||
    description === "" ||
    imageFileName !== PLAYABLE_CARD_IMAGE_FILE_NAME ||
    !isPlayableCardKind(kind) ||
    typeof name !== "string" ||
    name === "" ||
    typeof prompt !== "string" ||
    prompt === ""
  ) {
    return undefined;
  }

  const effects = parseEffects(value.effects);
  const loreSources = parseLoreSources(value.loreSources);
  const firstEffect = effects?.[0];
  if (
    effects === undefined ||
    loreSources === undefined ||
    firstEffect === undefined ||
    firstEffect.kind !== kind
  ) {
    return undefined;
  }

  return {
    aetherCost,
    cardId: typeof value.cardId === "string" ? value.cardId : "",
    createdAt,
    description,
    effects,
    imageFileName,
    kind,
    loreSources,
    name,
    prompt,
  };
}

/**
 * @param value - `effects` field from a manifest
 * @returns The effects, or `undefined` when one is invalid
 */
function parseEffects(value: unknown): PlayableCardEffect[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return undefined;
  }

  const effects: PlayableCardEffect[] = [];
  for (const entry of value) {
    const effect = parseEffect(entry);
    if (effect === undefined) {
      return undefined;
    }
    effects.push(effect);
  }
  return effects;
}

/**
 * @param value - One manifest effect
 * @returns The effect when its kind and text are present
 */
function parseEffect(value: unknown): PlayableCardEffect | undefined {
  if (!isRecord(value) || !isPlayableCardKind(value.kind)) {
    return undefined;
  }
  if (typeof value.amount !== "number" || !Number.isInteger(value.amount)) {
    return undefined;
  }
  if (typeof value.text !== "string" || value.text.trim() === "") {
    return undefined;
  }

  const chainsFrom = parseChainsFrom(value.kind, value.chainsFrom);
  if (chainsFrom === "invalid") {
    return undefined;
  }
  if (chainsFrom === undefined) {
    return { amount: value.amount, kind: value.kind, text: value.text.trim() };
  }
  return {
    amount: value.amount,
    chainsFrom,
    kind: value.kind,
    text: value.text.trim(),
  };
}

/**
 * @param kind - Effect kind
 * @param value - Stored chain target
 * @returns The chain target, `undefined` when absent, or `"invalid"` when inconsistent
 */
function parseChainsFrom(
  kind: PlayableCardKind,
  value: unknown,
): PlayableCardChainKind | undefined | "invalid" {
  if (value === undefined) {
    return kind === "combo" ? "invalid" : undefined;
  }
  if (!isPlayableCardChainKind(value)) {
    return "invalid";
  }
  if (kind !== "combo") {
    return "invalid";
  }
  return value;
}

/**
 * @param value - `loreSources` field from a manifest
 * @returns The passages, or `undefined` when one is invalid
 */
function parseLoreSources(
  value: unknown,
): PlayableCardLoreSource[] | undefined {
  if (!Array.isArray(value) || value.length < 1) {
    return undefined;
  }

  const sources: PlayableCardLoreSource[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.documentId !== "string" ||
      entry.documentId === "" ||
      typeof entry.excerpt !== "string" ||
      entry.excerpt === "" ||
      typeof entry.title !== "string" ||
      entry.title === "" ||
      typeof entry.url !== "string"
    ) {
      return undefined;
    }
    sources.push({
      documentId: entry.documentId,
      excerpt: entry.excerpt,
      title: entry.title,
      url: entry.url,
    });
  }
  return sources;
}

/**
 * @param filePath - Candidate image path
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
