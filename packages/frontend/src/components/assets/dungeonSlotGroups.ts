import type {
  AudioCue,
  DungeonAudioSlot,
  DungeonCardSlot,
  DungeonSlot,
  DungeonSpriteSlot,
} from "@resync-game-framework/api";

/**
 * @param slots - Every slot in the package
 * @param characterSlotId - Character the cards belong to
 * @returns That character's cards from level 1 through 4
 */
export function cardsForCharacter(
  slots: readonly DungeonSlot[],
  characterSlotId: string,
): DungeonCardSlot[] {
  return slots
    .filter(
      (slot): slot is DungeonCardSlot =>
        slot.kind === "playable-card" &&
        slot.characterSlotId === characterSlotId,
    )
    .sort((left, right) => left.level - right.level);
}

/**
 * @param slots - Every slot in the package
 * @param ownerSlotId - Character or enemy the sprite animates
 * @returns That unit's battle sprite slot, when the package has one
 */
export function spriteForOwner(
  slots: readonly DungeonSlot[],
  ownerSlotId: string,
): DungeonSpriteSlot | undefined {
  return slots.find(
    (slot): slot is DungeonSpriteSlot =>
      slot.kind === "sprite-sheet" && slot.ownerSlotId === ownerSlotId,
  );
}

/**
 * @param slots - Every slot in the package
 * @param ownerSlotId - Room or enemy the clip belongs to
 * @param cue - room for a background, attack for an enemy
 * @returns That owner's audio slot, when the package has one
 */
export function audioForOwner(
  slots: readonly DungeonSlot[],
  ownerSlotId: string,
  cue: AudioCue,
): DungeonAudioSlot | undefined {
  return slots.find(
    (slot): slot is DungeonAudioSlot =>
      slot.kind === "audio" &&
      slot.ownerSlotId === ownerSlotId &&
      slot.cue === cue,
  );
}

/**
 * Lists the slots one Generate click should start. Generating a character
 * or an enemy also starts its battle sprite, and a room or enemy starts its
 * sound, when that companion has no asset and is not already running.
 * @param slot - Slot the user asked to generate
 * @param slots - Every slot in the package
 * @returns The slot, followed by its sprite and sound when those should run too
 */
export function slotsStartedWith(
  slot: DungeonSlot,
  slots: readonly DungeonSlot[],
): DungeonSlot[] {
  const started = [slot];
  if (slot.kind === "card-character" || slot.kind === "enemy") {
    const sprite = spriteForOwner(slots, slot.id);
    const idle = sprite?.status === "planned" || sprite?.status === "failed";
    if (sprite !== undefined && idle) {
      started.push(sprite);
    }
  }
  const cue = audioCueFor(slot);
  if (cue === undefined) {
    return started;
  }
  const audio = audioForOwner(slots, slot.id, cue);
  const audioIdle = audio?.status === "planned" || audio?.status === "failed";
  if (audio !== undefined && audioIdle) {
    started.push(audio);
  }
  return started;
}

/**
 * @param slot - Slot the user asked to generate
 * @returns The sound cue that should start with it, when it owns one
 */
function audioCueFor(slot: DungeonSlot): AudioCue | undefined {
  if (slot.kind === "battle-background") {
    return "room";
  }
  if (slot.kind === "enemy") {
    return "attack";
  }
  return undefined;
}
