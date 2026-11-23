import type { HoldTier } from "../logic/economy/model";
import { RESOURCE_IDS, type ResourceId } from "../logic/types";

/** Core resources that are always shown in the top resource bar from tick 0. */
const STARTING_RESOURCES: ReadonlySet<ResourceId> = new Set([
  "food",
  "water",
  "wood",
  "stone",
]);

/** Ordering of Hold tiers from starting Camp up to Citadel. */
const HOLD_TIER_RANK: Readonly<Record<HoldTier, number>> = {
  Camp: 0,
  Citadel: 3,
  Outpost: 1,
  Stronghold: 2,
};

/**
 * Minimum Hold tier that automatically reveals each late/frontier resource
 * even before the player has discovered a deposit or gathered any.
 */
const RESOURCE_REVEAL_TIER: Partial<Readonly<Record<ResourceId, HoldTier>>> = {
  coin: "Stronghold",
  essence: "Outpost",
  iron: "Outpost",
  spirit_herbs: "Citadel",
};

/** Input for computing which resources should appear in the HUD ledger. */
export interface VisibleResourcesInput {
  /** Resources discovered on explored map deposits, if known. */
  discoveredResourceIds?: ReadonlySet<ResourceId>;
  /** Current Hold tier. */
  holdTier: HoldTier;
  /** Current stockpile amounts keyed by resource id. */
  resources: Readonly<Record<ResourceId, number>>;
}

/**
 * Checks whether a single resource should be shown in the HUD at the current
 * progression state.
 * @param resourceId - Candidate resource id
 * @param input - Current Hold tier, stockpile, and discovered deposits
 * @returns True when the resource chip should be visible
 */
function isResourceVisible(
  resourceId: ResourceId,
  input: VisibleResourcesInput,
): boolean {
  if (STARTING_RESOURCES.has(resourceId)) return true;
  if ((input.resources[resourceId] ?? 0) > 0) return true;
  if (input.discoveredResourceIds?.has(resourceId) === true) return true;
  const revealTier = RESOURCE_REVEAL_TIER[resourceId];
  if (revealTier === undefined) return false;
  return HOLD_TIER_RANK[input.holdTier] >= HOLD_TIER_RANK[revealTier];
}

/**
 * Returns the canonical-order list of resources that should appear in the top
 * resource bar. Starts with the 4 core resources (food, water, wood, stone)
 * and progressively reveals frontier/late resources as the player gathers
 * them, explores matching deposits, or upgrades the Hold.
 * @param input - Current Hold tier, stockpile, and optional discovered deposits
 * @returns Ordered resource ids to display
 */
export function visibleResourceIds(
  input: VisibleResourcesInput,
): readonly ResourceId[] {
  return RESOURCE_IDS.filter((resourceId) =>
    isResourceVisible(resourceId, input),
  );
}
