/** Accent per party position, shared by the battle canvas and the camp screens. */
export const OWNER_COLORS = [
  0x4e8f6a, 0xc08a3e, 0x8a5a83, 0x4f7fa0, 0xb5643c, 0x6f8a3a,
] as const;

/**
 * @param index - Position in the party, front first
 * @returns Phaser color number for that position
 */
export function ownerColor(index: number): number {
  return OWNER_COLORS[
    ((index % OWNER_COLORS.length) + OWNER_COLORS.length) % OWNER_COLORS.length
  ] as number;
}

/**
 * @param index - Position in the party, front first
 * @returns CSS hex color for that position
 */
export function ownerCssColor(index: number): string {
  return `#${ownerColor(index).toString(16).padStart(6, "0")}`;
}

/**
 * Accent slot for a party member. The cultivator is always jade; Coreborn
 * take the other colors in party order, so the cultivator's cards look the
 * same however the party is arranged.
 * @param party - Party members, front first, marked by whether each is the cultivator
 * @param index - Position of the member to color
 * @returns Index to pass to {@link ownerColor} or {@link ownerCssColor}
 */
export function partyAccentIndex(
  party: readonly { isCultivator: boolean }[],
  index: number,
): number {
  if (party[index]?.isCultivator) {
    return 0;
  }
  const corebornBefore = party
    .slice(0, index)
    .filter((member) => !member.isCultivator).length;
  return 1 + (corebornBefore % (OWNER_COLORS.length - 1));
}

/** Stand-in glyph for the cultivator's portrait: qi, the power it cultivates. */
export const CULTIVATOR_GLYPH = "气";
