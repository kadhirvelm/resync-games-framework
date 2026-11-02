import {
  buildingStillQualifies,
  canAfford,
  type HeroCalamityContext,
  popFree,
  resolveBuilding,
  secondsToTicks,
  toResult,
} from "./context";
import type {
  ActionResult,
  CalamityDefinition,
  CalamityStrikeResult,
  CalamityTraits,
  StrikePathTile,
} from "./types";

/**
 * @param context - Rules context
 * @param calamityId - Calamity to look up
 * @returns Its definition, or undefined when unknown
 */
function findCalamity(
  context: HeroCalamityContext,
  calamityId: string,
): CalamityDefinition | undefined {
  return context.calamityTable.calamities.find((c) => c.id === calamityId);
}

/**
 * @param context - Rules context
 * @param calamityId - Calamity to summon
 * @param altarId - A specific Altar, or null for any Citadel Altar
 * @returns The Altar to use and every reason the summon cannot start
 */
function summonGate(
  context: HeroCalamityContext,
  calamityId: string,
  altarId: string | null,
): { altarId: string | null; result: ActionResult } {
  const calamity = findCalamity(context, calamityId);
  if (!calamity) {
    return { altarId: null, result: toResult(["unknown_calamity"]) };
  }
  const { calamityTable, ports, state } = context;
  const altar = resolveBuilding(
    context,
    calamityTable.altarBuildingType,
    calamityTable.altarMinTier,
    altarId,
  );
  const reasons = [...altar.reasons];
  if (state.activeCalamity !== null) {
    reasons.push("calamity_already_active");
  }
  if (state.summon !== null) {
    reasons.push("summon_in_progress");
  }
  const cores = ports.inventory.countItem(calamityTable.bossCoreItemId);
  if (cores < calamity.bossCores) {
    reasons.push("missing_boss_core");
  }
  if (popFree(context) < calamityTable.popCost) {
    reasons.push("insufficient_pop");
  }
  if (!canAfford(context, { essence: calamity.essenceCost })) {
    reasons.push("insufficient_essence");
  }
  return { altarId: altar.building?.id ?? null, result: toResult(reasons) };
}

/**
 * @param context - Rules context
 * @param calamityId - Calamity to check
 * @param altarId - A specific Altar, or null for any Citadel Altar
 * @returns Every reason the summon cannot start now
 */
export function canSummonCalamity(
  context: HeroCalamityContext,
  calamityId: string,
  altarId: string | null = null,
): ActionResult {
  return summonGate(context, calamityId, altarId).result;
}

/**
 * Spends essence and boss cores, reserves pop, and starts the telegraphed
 * summon channel.
 *
 * @param context - Rules context
 * @param calamityId - Calamity to summon
 * @param altarId - A specific Altar, or null for any Citadel Altar
 * @returns The gate result; nothing changes when it fails
 */
export function summonCalamity(
  context: HeroCalamityContext,
  calamityId: string,
  altarId: string | null = null,
): ActionResult {
  const gate = summonGate(context, calamityId, altarId);
  const calamity = findCalamity(context, calamityId);
  if (!gate.result.ok || !calamity || gate.altarId === null) {
    return gate.result;
  }
  const { calamityTable, ports, state } = context;
  if (!ports.economy.trySpend({ essence: calamity.essenceCost })) {
    return toResult(["insufficient_essence"]);
  }
  if (
    !ports.inventory.consumeItem(
      calamityTable.bossCoreItemId,
      calamity.bossCores,
    )
  ) {
    return toResult(["missing_boss_core"]);
  }
  const completesAtTick =
    state.tick + secondsToTicks(state, calamity.summonSeconds);
  state.summon = {
    altarId: gate.altarId,
    calamityId,
    completesAtTick,
    startedAtTick: state.tick,
  };
  context.events.push({
    altarId: gate.altarId,
    calamityId,
    completesAtTick,
    telegraph: { ...calamityTable.telegraph },
    tick: state.tick,
    type: "calamity_summon_started",
  });
  return gate.result;
}

/**
 * Advances the summon channel: aborts it when the Altar is gone, or puts the
 * Calamity on the field when the channel ends. Spent essence and boss cores
 * are not refunded on abort (placeholder).
 *
 * @param context - Rules context
 */
export function stepCalamitySummon(context: HeroCalamityContext): void {
  const { calamityTable, ports, state } = context;
  const summon = state.summon;
  if (summon === null) {
    return;
  }
  const altarStands = buildingStillQualifies(
    context,
    summon.altarId,
    calamityTable.altarBuildingType,
    calamityTable.altarMinTier,
  );
  if (!altarStands) {
    state.summon = null;
    context.events.push({
      altarId: summon.altarId,
      calamityId: summon.calamityId,
      reason: "altar_destroyed",
      tick: state.tick,
      type: "calamity_summon_aborted",
    });
    return;
  }
  const calamity = findCalamity(context, summon.calamityId);
  if (state.tick < summon.completesAtTick || !calamity) {
    return;
  }
  const unitId = ports.combat.spawnUnit({
    buildingId: summon.altarId,
    classId: calamity.classId,
    definitionId: calamity.id,
    kind: "calamity",
    popCost: calamityTable.popCost,
    schoolId: calamity.schoolId,
    stats: calamity.stats,
  });
  state.summon = null;
  state.activeCalamity = {
    altarId: summon.altarId,
    calamityId: calamity.id,
    unitId,
  };
  context.events.push({
    altarId: summon.altarId,
    calamityId: calamity.id,
    tick: state.tick,
    type: "calamity_summon_completed",
    unitId,
  });
}

/**
 * Clears the active Calamity when its unit dies, freeing the Altar.
 *
 * @param context - Rules context
 * @param unitId - Unit that died
 * @returns Whether the unit was the active Calamity
 */
export function onCalamityUnitKilled(
  context: HeroCalamityContext,
  unitId: string,
): boolean {
  const active = context.state.activeCalamity;
  if (active?.unitId !== unitId) {
    return false;
  }
  context.state.activeCalamity = null;
  context.events.push({
    calamityId: active.calamityId,
    tick: context.state.tick,
    type: "calamity_died",
    unitId,
  });
  return true;
}

/**
 * Works out what a Calamity strike reaches along a straight path. Walls stop
 * a strike unless the Calamity `passesWalls`; one that also `burnsPath`
 * damages every wall it passes.
 *
 * @param traits - Attacker's Calamity traits
 * @param path - Tiles between attacker and target, nearest first
 * @returns Whether the target is hit, which wall blocked, and walls burned
 */
export function planCalamityStrike(
  traits: CalamityTraits,
  path: readonly StrikePathTile[],
): CalamityStrikeResult {
  const walls = path.filter((tile) => tile.wall);
  const firstWall = walls[0];
  if (firstWall && !traits.passesWalls) {
    return {
      blockedByWallId: firstWall.structureId,
      burnedWallIds: [],
      hitTarget: false,
    };
  }
  const burnedWallIds = traits.burnsPath
    ? walls.flatMap((tile) => (tile.structureId ? [tile.structureId] : []))
    : [];
  return { blockedByWallId: null, burnedWallIds, hitTarget: true };
}

/**
 * Resolves the active Calamity's strike through combat. Damage still goes
 * through `applyDamage`, so the counter triangle applies.
 *
 * @param context - Rules context
 * @param targetId - Unit or building struck
 * @param raw - Raw damage before counters
 * @param path - Tiles between the Calamity and its target, nearest first
 * @returns The strike plan, or a miss when no Calamity is active
 */
export function strikeWithCalamity(
  context: HeroCalamityContext,
  targetId: string,
  raw: number,
  path: readonly StrikePathTile[],
): CalamityStrikeResult {
  const active = context.state.activeCalamity;
  const calamity = active
    ? findCalamity(context, active.calamityId)
    : undefined;
  if (!active || !calamity) {
    return { blockedByWallId: null, burnedWallIds: [], hitTarget: false };
  }
  const plan = planCalamityStrike(calamity.traits, path);
  const { combat } = context.ports;
  const burnDamage = raw * (calamity.traits.wallBurnFraction ?? 0);
  for (const wallId of plan.burnedWallIds) {
    combat.applyDamage(active.unitId, wallId, burnDamage);
  }
  if (plan.blockedByWallId !== null) {
    combat.applyDamage(active.unitId, plan.blockedByWallId, raw);
  }
  if (plan.hitTarget) {
    combat.applyDamage(active.unitId, targetId, raw);
  }
  return plan;
}
