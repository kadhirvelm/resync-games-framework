import type { HoldTier } from "../logic/economy/model";

/** Ordered progression of Hold tiers from lowest to highest. */
export const HOLD_TIER_ORDER: readonly HoldTier[] = [
  "Camp",
  "Outpost",
  "Stronghold",
  "Citadel",
];

/** Player-facing summary of what a Hold tier upgrade newly unlocks. */
export interface TierUnlockSummary {
  /** Building names unlocked at this tier. */
  buildings: readonly string[];
  /** Prominent banner headline. */
  headline: string;
  /** Concise one-line description of the newly available options. */
  summary: string;
  /** Hold tier that was reached. */
  tier: HoldTier;
  /** Unit classes unlocked at this tier. */
  units: readonly string[];
}

const TIER_SUMMARIES: Readonly<
  Record<Exclude<HoldTier, "Camp">, TierUnlockSummary>
> = {
  Citadel: {
    buildings: ["Spirit Herb Garden", "Alchemy Furnace"],
    headline: "Hold Upgraded: Citadel",
    summary:
      "Unlocks Spirit Herb Garden and Alchemy Furnace to grow Spirit Herbs and brew cultivation pills.",
    tier: "Citadel",
    units: [],
  },
  Outpost: {
    buildings: [
      "Ward Tower",
      "Farm",
      "Gate",
      "Omen Tower",
      "Cultivator Sanctum",
      "Spirit Array",
    ],
    headline: "Hold Upgraded: Outpost",
    summary:
      "Unlocks Hunters & Riders at the Barracks, plus Ward Tower, Farm, Gate, Omen Tower, Cultivator Sanctum, and Spirit Array.",
    tier: "Outpost",
    units: ["Hunters", "Riders"],
  },
  Stronghold: {
    buildings: ["Hell Market", "Cultivation Hall", "Meditation Pavilion"],
    headline: "Hold Upgraded: Stronghold",
    summary:
      "Unlocks Hell Market, Cultivation Hall, and Meditation Pavilion for Coin trade and breakthroughs.",
    tier: "Stronghold",
    units: [],
  },
};

/**
 * Returns the 0-based progression rank for a Hold tier.
 * @param tier - Hold tier
 * @returns Numeric rank (0 for Camp through 3 for Citadel)
 */
export function holdTierRank(tier: HoldTier): number {
  return HOLD_TIER_ORDER.indexOf(tier);
}

/**
 * Checks whether a Hold tier transition is a strict upgrade to a higher tier.
 * @param previous - Previously observed Hold tier
 * @param current - Newly observed Hold tier
 * @returns True only when `current` is strictly higher than `previous`
 */
export function didHoldTierAdvance(
  previous: HoldTier,
  current: HoldTier,
): boolean {
  return holdTierRank(current) > holdTierRank(previous);
}

/**
 * Returns the player-facing unlock summary for reaching a Hold tier, or `null`
 * for the starting `"Camp"` tier.
 * @param tier - Target Hold tier
 * @returns Unlock summary for Outpost, Stronghold, or Citadel; null for Camp
 */
export function tierUnlockSummary(tier: HoldTier): TierUnlockSummary | null {
  if (tier === "Camp") return null;
  return TIER_SUMMARIES[tier];
}
