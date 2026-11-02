import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AUDIO_CUES,
  AUDIO_ROLES,
  DUNGEON_SLOT_KINDS,
  DUNGEON_SLOT_STATUSES,
  type DungeonBlueprint,
  type DungeonSlot,
  type DungeonSlotPreview,
  type DungeonSlotStatus,
} from "@resync-game-framework/api";
import { z } from "zod";
import { withDungeonAudio } from "./dungeonAudioPlan";
import { DUNGEON_FILE_NAME } from "./dungeonStorage";

const slotFields = {
  assetId: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  generationId: z.string().min(1).optional(),
  id: z.string().min(1),
  prompt: z.string().min(1),
  status: z.enum(DUNGEON_SLOT_STATUSES),
  title: z.string().min(1),
} as const;

const slotSchema = z.discriminatedUnion("kind", [
  z.object({ ...slotFields, kind: z.literal(DUNGEON_SLOT_KINDS[0]) }),
  z.object({ ...slotFields, kind: z.literal(DUNGEON_SLOT_KINDS[1]) }),
  z.object({ ...slotFields, kind: z.literal(DUNGEON_SLOT_KINDS[2]) }),
  z.object({
    ...slotFields,
    characterSlotId: z.string().min(1),
    kind: z.literal(DUNGEON_SLOT_KINDS[3]),
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({
    ...slotFields,
    kind: z.literal(DUNGEON_SLOT_KINDS[4]),
    ownerSlotId: z.string().min(1),
  }),
  z.object({
    ...slotFields,
    cue: z.enum(AUDIO_CUES),
    kind: z.literal(DUNGEON_SLOT_KINDS[5]),
    loop: z.boolean(),
    ownerSlotId: z.string().min(1).optional(),
    role: z.enum(AUDIO_ROLES),
  }),
]);

const blueprintSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
  prompt: z.string().min(1),
  slots: z.array(slotSchema),
  summary: z.string(),
});

/** Package JSON before preview images and the public file URL are added. */
export type StoredDungeonBlueprint = z.infer<typeof blueprintSchema>;

/** One slot as it is written to the package file. */
export type StoredDungeonSlot = z.infer<typeof slotSchema>;

/** Fields a slot update may change. Cleared fields are removed from the file. */
export interface DungeonSlotUpdate {
  assetId?: string;
  clearAssetId?: boolean;
  clearError?: boolean;
  clearGenerationId?: boolean;
  error?: string;
  generationId?: string;
  status?: DungeonSlotStatus;
}

/**
 * Reads every readable dungeon package, newest first.
 * A missing folder or a file that is not a package is skipped.
 * @param rootPath - Dungeon storage root
 * @returns Stored packages without preview images
 */
export async function readStoredDungeonBlueprints(
  rootPath: string,
): Promise<StoredDungeonBlueprint[]> {
  const entries = await readEntries(rootPath);
  const blueprints = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => readStoredDungeonBlueprint(rootPath, entry.name)),
  );
  return blueprints
    .filter(
      (blueprint): blueprint is StoredDungeonBlueprint =>
        blueprint !== undefined,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Reads one package file.
 * @param rootPath - Dungeon storage root
 * @param id - Package folder name
 * @returns The package, or undefined when the file is missing or invalid
 */
export async function readStoredDungeonBlueprint(
  rootPath: string,
  id: string,
): Promise<StoredDungeonBlueprint | undefined> {
  try {
    const text = await readFile(blueprintPath(rootPath, id), "utf8");
    const parsed = blueprintSchema.safeParse(JSON.parse(text));
    if (!parsed.success || parsed.data.id !== id) {
      return undefined;
    }
    return withDungeonAudio(withUnitSprites(parsed.data));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Prompt for a sprite slot added to a character that has none.
 * The slot generator puts the character's own prompt above it.
 */
export const DEFAULT_SPRITE_PROMPT =
  "Animate this character as a full-body battle sprite facing right, toward the enemies: idle breathing, their signature attack, a guard, and a flinch when hit. Keep the silhouette, outfit, weapon, and palette from the character prompt.";

/**
 * Prompt for a sprite slot added to an enemy that has none.
 * The slot generator puts the enemy's own prompt above it.
 */
export const DEFAULT_ENEMY_SPRITE_PROMPT =
  "Animate this enemy as a full-body battle sprite facing left, toward the player's party: idle menace, its signature attack, a guard, and a flinch when hit. Keep the silhouette, anatomy, weapons, and palette from the enemy prompt.";

/** Slot kinds that fight in battle and so get one sprite slot each. */
type SpriteOwnerKind = "card-character" | "enemy";

/** A stored character or enemy slot. */
type SpriteOwnerSlot = Extract<StoredDungeonSlot, { kind: SpriteOwnerKind }>;

/**
 * @param ownerSlotId - Character or enemy slot id
 * @returns The id given to that unit's added sprite slot. It is derived, so
 * reading the same file twice yields the same id.
 */
export function defaultSpriteSlotId(ownerSlotId: string): string {
  return `${ownerSlotId}-sprite`;
}

/**
 * @param kind - Kind of the slot the sprite animates
 * @returns Default sprite prompt for that kind of unit
 */
export function defaultSpritePrompt(kind: SpriteOwnerKind): string {
  if (kind === "enemy") {
    return DEFAULT_ENEMY_SPRITE_PROMPT;
  }
  return DEFAULT_SPRITE_PROMPT;
}

/**
 * Gives every character and every enemy a sprite slot. A missing sprite is
 * placed right after its owner, or after a character's last card. Packages
 * where every unit already has one are returned unchanged. An added slot is
 * written to the file with the next slot update.
 * @param blueprint - Package read from disk
 * @returns The package with one sprite slot per character and enemy
 */
export function withUnitSprites(
  blueprint: StoredDungeonBlueprint,
): StoredDungeonBlueprint {
  const animated = new Set(
    blueprint.slots.flatMap((slot) =>
      slot.kind === "sprite-sheet" ? [slot.ownerSlotId] : [],
    ),
  );
  const missing = blueprint.slots.filter(
    (slot): slot is SpriteOwnerSlot =>
      isSpriteOwner(slot) && !animated.has(slot.id),
  );
  if (missing.length === 0) {
    return blueprint;
  }
  const slots = [...blueprint.slots];
  for (const owner of missing) {
    slots.splice(lastOwnedIndex(slots, owner.id) + 1, 0, {
      id: defaultSpriteSlotId(owner.id),
      kind: "sprite-sheet",
      ownerSlotId: owner.id,
      prompt: defaultSpritePrompt(owner.kind),
      status: "planned",
      title: `${owner.title} sprite`,
    });
  }
  return { ...blueprint, slots };
}

/**
 * @param slot - Any stored slot
 * @returns Whether the slot is a character or enemy that fights as a sprite
 */
function isSpriteOwner(slot: StoredDungeonSlot): slot is SpriteOwnerSlot {
  return slot.kind === "card-character" || slot.kind === "enemy";
}

/**
 * @param slots - Package slots in order
 * @param ownerSlotId - Character or enemy slot id
 * @returns Index of the owner or of the last card it owns, whichever is later
 */
function lastOwnedIndex(
  slots: readonly StoredDungeonSlot[],
  ownerSlotId: string,
): number {
  return slots.reduce(
    (last, slot, index) =>
      slot.id === ownerSlotId ||
      (slot.kind === "playable-card" && slot.characterSlotId === ownerSlotId)
        ? index
        : last,
    -1,
  );
}

/**
 * Writes a package atomically so a reader never sees a partial file.
 * @param rootPath - Dungeon storage root
 * @param blueprint - Package to store. Preview fields are omitted.
 */
export async function writeStoredDungeonBlueprint(
  rootPath: string,
  blueprint: StoredDungeonBlueprint,
): Promise<void> {
  const directory = join(rootPath, blueprint.id);
  await mkdir(directory, { recursive: true });
  const target = blueprintPath(rootPath, blueprint.id);
  const temporary = join(directory, `${DUNGEON_FILE_NAME}.tmp`);
  await writeFile(temporary, `${JSON.stringify(blueprint, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

/**
 * Applies one slot update. Clearing a field removes it from the stored object.
 * @param slot - Slot currently in the file
 * @param update - Fields to change
 * @returns The slot to write back
 */
export function applyDungeonSlotUpdate(
  slot: StoredDungeonSlot,
  update: DungeonSlotUpdate,
): StoredDungeonSlot {
  const next: StoredDungeonSlot = { ...slot };
  if (update.status !== undefined) {
    next.status = update.status;
  }
  if (update.assetId !== undefined) {
    next.assetId = update.assetId;
  }
  if (update.clearAssetId === true) {
    delete next.assetId;
  }
  if (update.generationId !== undefined) {
    next.generationId = update.generationId;
  }
  if (update.clearGenerationId === true) {
    delete next.generationId;
  }
  if (update.error !== undefined) {
    next.error = update.error;
  }
  if (update.clearError === true) {
    delete next.error;
  }
  return next;
}

/**
 * Adds the public file URL and any resolved previews.
 * @param blueprint - Package read from disk
 * @param jsonUrl - Absolute URL of the package file
 * @param previews - Preview by slot id. Missing ids stay without a preview.
 * @returns The blueprint returned by the API
 */
export function toDungeonBlueprint(
  blueprint: StoredDungeonBlueprint,
  jsonUrl: string,
  previews: ReadonlyMap<string, DungeonSlotPreview>,
): DungeonBlueprint {
  return {
    ...blueprint,
    jsonUrl,
    slots: blueprint.slots.map((slot) =>
      toDungeonSlot(slot, previews.get(slot.id)),
    ),
  };
}

/**
 * @param slot - Stored slot
 * @param preview - Resolved image, when the linked asset exists
 * @returns The slot returned by the API
 */
function toDungeonSlot(
  slot: StoredDungeonSlot,
  preview: DungeonSlotPreview | undefined,
): DungeonSlot {
  if (preview === undefined) {
    return slot;
  }
  return { ...slot, preview };
}

/**
 * @param rootPath - Dungeon storage root
 * @param id - Package folder name
 * @returns Absolute path of the package file
 */
function blueprintPath(rootPath: string, id: string): string {
  return join(rootPath, id, DUNGEON_FILE_NAME);
}

/**
 * @param rootPath - Directory that may not exist yet
 * @returns Directory entries, or an empty list when the root is missing
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
