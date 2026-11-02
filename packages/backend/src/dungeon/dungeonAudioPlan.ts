import type { AudioCue, AudioRole } from "@resync-game-framework/api";
import type {
  StoredDungeonBlueprint,
  StoredDungeonSlot,
} from "./dungeonBlueprint";

/** Music and stingers that belong to the package rather than one room or enemy. */
const PACKAGE_CUES = [
  { cue: "camp", role: "music", title: "Camp music" },
  { cue: "battle", role: "music", title: "Battle music" },
  { cue: "boss", role: "music", title: "Boss music" },
  { cue: "victory", role: "effect", title: "Victory stinger" },
  { cue: "defeat", role: "effect", title: "Defeat stinger" },
  { cue: "reward", role: "effect", title: "Reward stinger" },
] as const satisfies ReadonlyArray<{
  cue: AudioCue;
  role: AudioRole;
  title: string;
}>;

/**
 * Gives every room an ambience slot, every enemy an attack slot, and the
 * package its music and stingers. Slots that already exist are left alone.
 * Added slots are written to the file with the next slot update, and a new
 * package writes them when it is created.
 * @param blueprint - Package read from disk or just planned
 * @returns The package, unchanged when every audio slot is already present
 */
export function withDungeonAudio(
  blueprint: StoredDungeonBlueprint,
): StoredDungeonBlueprint {
  const slots = [...blueprint.slots];
  let added = false;
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const owner = slots[index];
    if (owner === undefined) {
      continue;
    }
    const owned = ownedAudio(owner);
    if (owned === undefined || hasOwnedAudio(slots, owner.id, owned.cue)) {
      continue;
    }
    const insertAt =
      owner.kind === "enemy" ? lastSpriteIndex(slots, owner.id) : index;
    slots.splice(insertAt + 1, 0, ownedSlot(blueprint, owner, owned));
    added = true;
  }
  for (const cue of PACKAGE_CUES) {
    if (hasPackageAudio(slots, cue.cue)) {
      continue;
    }
    slots.push(packageSlot(blueprint, cue));
    added = true;
  }
  if (!added) {
    return blueprint;
  }
  return { ...blueprint, slots };
}

/**
 * @param ownerSlotId - Room or enemy slot id
 * @param cue - Which clip that owner needs
 * @returns The id given to that added audio slot
 */
export function defaultAudioSlotId(ownerSlotId: string, cue: AudioCue): string {
  return `${ownerSlotId}-${cue}`;
}

/**
 * @param dungeonId - Package id
 * @param cue - Package-level cue
 * @returns The id given to that added score slot
 */
export function defaultScoreSlotId(dungeonId: string, cue: AudioCue): string {
  return `${dungeonId}-audio-${cue}`;
}

/**
 * @param owner - A stored slot that might need a clip
 * @returns The clip to add, or undefined when this slot does not own one
 */
function ownedAudio(
  owner: StoredDungeonSlot,
): { cue: AudioCue; role: AudioRole } | undefined {
  if (owner.kind === "battle-background") {
    return { cue: "room", role: "ambience" };
  }
  if (owner.kind === "enemy") {
    return { cue: "attack", role: "effect" };
  }
  return undefined;
}

/**
 * @param slots - Package slots
 * @param ownerSlotId - Room or enemy id
 * @param cue - Clip that owner should have
 * @returns Whether that clip is already planned
 */
function hasOwnedAudio(
  slots: readonly StoredDungeonSlot[],
  ownerSlotId: string,
  cue: AudioCue,
): boolean {
  return slots.some(
    (slot) =>
      slot.kind === "audio" &&
      slot.ownerSlotId === ownerSlotId &&
      slot.cue === cue,
  );
}

/**
 * @param slots - Package slots
 * @param cue - Music or stinger cue
 * @returns Whether the package already has that cue without an owner
 */
function hasPackageAudio(
  slots: readonly StoredDungeonSlot[],
  cue: AudioCue,
): boolean {
  return slots.some(
    (slot) =>
      slot.kind === "audio" &&
      slot.ownerSlotId === undefined &&
      slot.cue === cue,
  );
}

/**
 * @param slots - Package slots
 * @param ownerSlotId - Enemy slot id
 * @returns Index of that enemy's sprite, or of the enemy when it has none
 */
function lastSpriteIndex(
  slots: readonly StoredDungeonSlot[],
  ownerSlotId: string,
): number {
  return slots.reduce(
    (last, slot, index) =>
      slot.kind === "sprite-sheet" && slot.ownerSlotId === ownerSlotId
        ? index
        : last,
    slots.findIndex((slot) => slot.id === ownerSlotId),
  );
}

/**
 * @param blueprint - Package the clip belongs to
 * @param owner - Room or enemy
 * @param audio - Role and cue to add
 * @returns A planned audio slot
 */
function ownedSlot(
  blueprint: StoredDungeonBlueprint,
  owner: StoredDungeonSlot,
  audio: { cue: AudioCue; role: AudioRole },
): StoredDungeonSlot {
  return {
    cue: audio.cue,
    id: defaultAudioSlotId(owner.id, audio.cue),
    kind: "audio",
    loop: audio.role !== "effect",
    ownerSlotId: owner.id,
    prompt: ownedPrompt(blueprint, owner, audio.cue),
    role: audio.role,
    status: "planned",
    title: `${owner.title} ${audio.cue === "room" ? "ambience" : "attack"}`,
  };
}

/**
 * @param blueprint - Package the score belongs to
 * @param cue - Music or stinger definition
 * @returns A planned package-level audio slot
 */
function packageSlot(
  blueprint: StoredDungeonBlueprint,
  cue: { cue: AudioCue; role: AudioRole; title: string },
): StoredDungeonSlot {
  return {
    cue: cue.cue,
    id: defaultScoreSlotId(blueprint.id, cue.cue),
    kind: "audio",
    loop: cue.role !== "effect",
    prompt: packagePrompt(blueprint, cue.cue),
    role: cue.role,
    status: "planned",
    title: cue.title,
  };
}

/**
 * @param blueprint - Package, used for its summary
 * @param owner - Room or enemy the clip follows
 * @param cue - room or attack
 * @returns The prompt the audio agent turns into a sound-design prompt
 */
function ownedPrompt(
  blueprint: StoredDungeonBlueprint,
  owner: StoredDungeonSlot,
  cue: AudioCue,
): string {
  const story = blueprint.summary || blueprint.prompt;
  if (cue === "room") {
    return `Looping room tone for "${owner.title}". ${owner.prompt} Dungeon: ${story} No melody, no impacts, and no voice. A seamless environmental bed.`;
  }
  return `One-shot attack for "${owner.title}". ${owner.prompt} Dungeon: ${story} A single strike, no music bed, and no voice.`;
}

/**
 * @param blueprint - Package, used for its summary
 * @param cue - Music or stinger cue
 * @returns The prompt the audio agent turns into a sound-design prompt
 */
function packagePrompt(
  blueprint: StoredDungeonBlueprint,
  cue: AudioCue,
): string {
  const story = blueprint.summary || blueprint.prompt;
  if (cue === "camp") {
    return `Instrumental camp theme for this dungeon, slow and warm, able to loop, with no vocals and no lyrics. Dungeon: ${story}`;
  }
  if (cue === "battle") {
    return `Instrumental battle theme, driving and spare, able to loop, with no vocals and no lyrics. Dungeon: ${story}`;
  }
  if (cue === "boss") {
    return `Instrumental boss theme, heavier than the battle theme, able to loop, with no vocals and no lyrics. Dungeon: ${story}`;
  }
  if (cue === "victory") {
    return `Short victory stinger of bright bells that ends cleanly, with no vocals. Dungeon: ${story}`;
  }
  if (cue === "defeat") {
    return `Short defeat stinger, low and spare, that ends cleanly, with no vocals. Dungeon: ${story}`;
  }
  return `Short reward chime of a few bright notes that ends cleanly, with no vocals. Dungeon: ${story}`;
}
