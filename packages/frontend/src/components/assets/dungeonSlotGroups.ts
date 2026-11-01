import type {
  DungeonCardSlot,
  DungeonSlot,
  DungeonSpriteSlot,
} from "@towers-of-coreborn/api";

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
 * @param characterSlotId - Character the sprite animates
 * @returns That character's battle sprite slot, when the package has one
 */
export function spriteForCharacter(
  slots: readonly DungeonSlot[],
  characterSlotId: string,
): DungeonSpriteSlot | undefined {
  return slots.find(
    (slot): slot is DungeonSpriteSlot =>
      slot.kind === "sprite-sheet" && slot.characterSlotId === characterSlotId,
  );
}

/**
 * Lists the slots one Generate click should start. Generating a character
 * also starts its battle sprite when that sprite has no asset and is not
 * already running, so a new character arrives able to fight animated.
 * @param slot - Slot the user asked to generate
 * @param slots - Every slot in the package
 * @returns The slot, followed by its character's sprite when it should run too
 */
export function slotsStartedWith(
  slot: DungeonSlot,
  slots: readonly DungeonSlot[],
): DungeonSlot[] {
  if (slot.kind !== "card-character") {
    return [slot];
  }
  const sprite = spriteForCharacter(slots, slot.id);
  const idle = sprite?.status === "planned" || sprite?.status === "failed";
  if (sprite === undefined || !idle) {
    return [slot];
  }
  return [slot, sprite];
}
