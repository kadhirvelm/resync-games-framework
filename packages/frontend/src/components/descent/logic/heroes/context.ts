import type { HeroBuildingView, HeroCalamityPorts } from "./ports";
import { meetsTier } from "./tables";
import type {
  ActionResult,
  CalamityTable,
  HeroCalamityEvent,
  HeroCalamityState,
  HeroStatus,
  HeroTable,
  HoldTier,
  ResourceCost,
} from "./types";

/** Everything the hero and Calamity rules read or write in one call. */
export interface HeroCalamityContext {
  calamityTable: CalamityTable;
  events: HeroCalamityEvent[];
  heroTable: HeroTable;
  ports: HeroCalamityPorts;
  state: HeroCalamityState;
}

/** Hero statuses that hold a cap slot and pop. */
export const HERO_STATUSES_USING_SLOT: readonly HeroStatus[] = [
  "training",
  "alive",
  "reviving",
];

/**
 * @param reasons - Failed gate codes, or none
 * @returns An `ActionResult` that is ok only when `reasons` is empty
 */
export function toResult(reasons: string[]): ActionResult {
  return { ok: reasons.length === 0, reasons };
}

/**
 * @param state - Module state carrying `ticksPerSecond`
 * @param seconds - Duration in sim seconds
 * @returns Whole ticks, at least one
 */
export function secondsToTicks(
  state: HeroCalamityState,
  seconds: number,
): number {
  return Math.max(1, Math.ceil(seconds * state.ticksPerSecond));
}

/**
 * @param context - Rules context
 * @returns How many heroes are training, alive, or reviving
 */
export function heroesHoldingSlots(context: HeroCalamityContext): number {
  return Object.values(context.state.heroes).filter((hero) =>
    HERO_STATUSES_USING_SLOT.includes(hero.status),
  ).length;
}

/**
 * @param context - Rules context
 * @returns Pop used by heroes and the Calamity (summoning or on the field)
 */
export function modulePopUsed(context: HeroCalamityContext): number {
  const heroPop = heroesHoldingSlots(context) * context.heroTable.popCost;
  const { activeCalamity, summon } = context.state;
  const calamityHoldsPop = activeCalamity !== null || summon !== null;
  const calamityPop = calamityHoldsPop ? context.calamityTable.popCost : 0;
  return heroPop + calamityPop;
}

/**
 * @param context - Rules context
 * @returns Free pop after the economy's units, heroes, and the Calamity
 */
export function popFree(context: HeroCalamityContext): number {
  const { economy } = context.ports;
  return economy.getPopCap() - economy.getPopUsed() - modulePopUsed(context);
}

/**
 * @param context - Rules context
 * @param cost - Resources a gate will spend
 * @returns Whether the stockpile covers every entry
 */
export function canAfford(
  context: HeroCalamityContext,
  cost: ResourceCost,
): boolean {
  const stockpile = context.ports.economy.getStockpile();
  return Object.entries(cost).every(
    ([id, amount]) =>
      (stockpile[id as keyof typeof stockpile] ?? 0) >= (amount ?? 0),
  );
}

/**
 * Finds a standing building of a type and minimum tier.
 *
 * @param context - Rules context
 * @param buildingType - Required building type id
 * @param minTier - Required tier
 * @param buildingId - A specific building to check; otherwise the first match
 * @returns The building and any gate failures
 */
export function resolveBuilding(
  context: HeroCalamityContext,
  buildingType: string,
  minTier: HoldTier,
  buildingId: string | null,
): { building: HeroBuildingView | null; reasons: string[] } {
  const { economy } = context.ports;
  const candidates =
    buildingId === null
      ? economy.listBuildings().filter((b) => b.buildingType === buildingType)
      : [economy.getBuilding(buildingId)].filter(
          (b): b is HeroBuildingView => b?.buildingType === buildingType,
        );
  if (candidates.length === 0) {
    return { building: null, reasons: [`no_${buildingType}`] };
  }
  const building = candidates.find((b) => meetsTier(b.tier, minTier));
  if (!building) {
    return { building: null, reasons: [`${buildingType}_tier_too_low`] };
  }
  return { building, reasons: [] };
}

/**
 * @param context - Rules context
 * @param buildingId - Building a channel depends on
 * @param buildingType - Type it must still be
 * @param minTier - Tier it must still meet
 * @returns Whether the building still stands and still qualifies
 */
export function buildingStillQualifies(
  context: HeroCalamityContext,
  buildingId: string,
  buildingType: string,
  minTier: HoldTier,
): boolean {
  return (
    resolveBuilding(context, buildingType, minTier, buildingId).building !==
    null
  );
}
