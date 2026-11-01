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
 * Lists the slots one Generate click should start. Generating a character
 * or an enemy also starts its battle sprite when that sprite has no asset
 * and is not already running, so a new unit arrives able to fight animated.
 * @param slot - Slot the user asked to generate
 * @param slots - Every slot in the package
 * @returns The slot, followed by its sprite when that should run too
 */
export function slotsStartedWith(
  slot: DungeonSlot,
  slots: readonly DungeonSlot[],
): DungeonSlot[] {
  if (slot.kind !== "card-character" && slot.kind !== "enemy") {
    return [slot];
  }
  const sprite = spriteForOwner(slots, slot.id);
  const idle = sprite?.status === "planned" || sprite?.status === "failed";
  if (sprite === undefined || !idle) {
    return [slot];
  }
  return [slot, sprite];
}
