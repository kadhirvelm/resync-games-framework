import type { SchoolId } from "../types";
import {
  buildingStillQualifies,
  canAfford,
  type HeroCalamityContext,
  heroesHoldingSlots,
  popFree,
  resolveBuilding,
  secondsToTicks,
  toResult,
} from "./context";
import { realmIndex, SCHOOL_CHOICE_REALM } from "./tables";
import type {
  ActionResult,
  HeroDefinition,
  HeroRecord,
  HeroState,
  HeroTable,
} from "./types";

/**
 * Builds the starting roster: every pool hero, locked or available.
 *
 * @param table - Hero data
 * @returns Hero records keyed by hero id, in table order
 */
export function createHeroRecords(
  table: HeroTable,
): Record<string, HeroRecord> {
  return Object.fromEntries(
    table.heroes.map((hero): [string, HeroRecord] => [
      hero.id,
      {
        channelEndsAtTick: null,
        falls: 0,
        hallId: null,
        heroId: hero.id,
        lanternLit: false,
        schoolId: hero.schoolId,
        status: hero.startsLocked ? "locked" : "available",
        unitId: null,
      },
    ]),
  );
}

/**
 * @param context - Rules context
 * @param heroId - Hero to look up
 * @returns The definition and record, or null when the id is unknown
 */
function findHero(
  context: HeroCalamityContext,
  heroId: string,
): { definition: HeroDefinition; record: HeroRecord } | null {
  const definition = context.heroTable.heroes.find((h) => h.id === heroId);
  const record = context.state.heroes[heroId];
  if (!definition || !record) {
    return null;
  }
  return { definition, record };
}

/**
 * @param definition - Hero data
 * @returns The class the hero fights as, using the placeholder when open
 */
function combatClassOf(definition: HeroDefinition) {
  return definition.classId ?? definition.provisionalClassId ?? "warden";
}

/**
 * @param context - Rules context
 * @param heroId - Hero to check
 * @returns Whether the hero is on the field and may take orders
 */
export function canHeroAct(
  context: HeroCalamityContext,
  heroId: string,
): boolean {
  return context.state.heroes[heroId]?.status === "alive";
}

/**
 * @param context - Rules context
 * @returns Every pool hero with display fields, in table order
 */
export function listHeroes(context: HeroCalamityContext): HeroState[] {
  const { heroTable, state } = context;
  return heroTable.heroes.flatMap((definition) => {
    const record = state.heroes[definition.id];
    if (!record) {
      return [];
    }
    return [
      {
        ...record,
        canAct: record.status === "alive",
        classId: definition.classId,
        name: definition.name,
        popCost: heroTable.popCost,
        title: definition.title,
        treasureSlots: heroTable.treasureSlots,
      },
    ];
  });
}

/**
 * Unlocks a locked hero (Ilya). When this fires is an open design question,
 * so the caller decides.
 *
 * @param context - Rules context
 * @param heroId - Hero to unlock
 * @returns Failure when the hero is unknown or not locked
 */
export function unlockHero(
  context: HeroCalamityContext,
  heroId: string,
): ActionResult {
  const hero = findHero(context, heroId);
  if (!hero) {
    return toResult(["unknown_hero"]);
  }
  if (hero.record.status !== "locked") {
    return toResult(["hero_not_locked"]);
  }
  hero.record.status = "available";
  context.events.push({
    heroId,
    tick: context.state.tick,
    type: "hero_unlocked",
  });
  return toResult([]);
}

/**
 * @param context - Rules context
 * @param heroId - Hero to train
 * @param hallId - Hero Hall to train at
 * @returns Every reason training cannot start now
 */
export function canTrainHero(
  context: HeroCalamityContext,
  heroId: string,
  hallId: string,
): ActionResult {
  const hero = findHero(context, heroId);
  if (!hero) {
    return toResult(["unknown_hero"]);
  }
  const reasons: string[] = [];
  if (hero.record.status === "locked") {
    reasons.push("hero_locked");
  }
  if (hero.record.status !== "available" && hero.record.status !== "locked") {
    reasons.push("hero_already_raised");
  }
  const { heroTable } = context;
  reasons.push(
    ...resolveBuilding(
      context,
      heroTable.hallBuildingType,
      heroTable.hallMinTier,
      hallId,
    ).reasons,
  );
  if (heroesHoldingSlots(context) >= context.state.aliveHeroCap) {
    reasons.push("hero_cap_reached");
  }
  if (popFree(context) < heroTable.popCost) {
    reasons.push("insufficient_pop");
  }
  if (!canAfford(context, hero.definition.trainCost)) {
    reasons.push("insufficient_resources");
  }
  return toResult(reasons);
}

/**
 * Spends the training cost and starts a training channel at the Hall.
 *
 * @param context - Rules context
 * @param heroId - Hero to train
 * @param hallId - Hero Hall to train at
 * @returns The gate result; nothing changes when it fails
 */
export function trainHero(
  context: HeroCalamityContext,
  heroId: string,
  hallId: string,
): ActionResult {
  const gate = canTrainHero(context, heroId, hallId);
  const hero = findHero(context, heroId);
  if (!gate.ok || !hero) {
    return gate;
  }
  if (!context.ports.economy.trySpend(hero.definition.trainCost)) {
    return toResult(["insufficient_resources"]);
  }
  const completesAtTick =
    context.state.tick +
    secondsToTicks(context.state, hero.definition.trainSeconds);
  hero.record.status = "training";
  hero.record.hallId = hallId;
  hero.record.channelEndsAtTick = completesAtTick;
  context.events.push({
    completesAtTick,
    hallId,
    heroId,
    tick: context.state.tick,
    type: "hero_training_started",
  });
  return gate;
}

/**
 * @param context - Rules context
 * @param heroId - Fallen hero
 * @returns Essence and ticks a revive costs at the hero's current realm
 */
export function reviveCost(
  context: HeroCalamityContext,
  heroId: string,
): { essence: number; ticks: number } {
  const { revive } = context.heroTable;
  const unitId = context.state.heroes[heroId]?.unitId;
  const steps =
    unitId == null ? 0 : realmIndex(context.ports.cultivation.getRealm(unitId));
  return {
    essence: revive.baseEssence + revive.essencePerRealm * steps,
    ticks: secondsToTicks(
      context.state,
      revive.baseSeconds + revive.secondsPerRealm * steps,
    ),
  };
}

/**
 * @param context - Rules context
 * @param heroId - Hero to revive
 * @param hallId - A specific Hall, or null to use the hero's Hall or any Hall
 * @returns The Hall to use and every reason the revive cannot start
 */
function reviveGate(
  context: HeroCalamityContext,
  heroId: string,
  hallId: string | null,
): { hallId: string | null; result: ActionResult } {
  const hero = findHero(context, heroId);
  if (!hero) {
    return { hallId: null, result: toResult(["unknown_hero"]) };
  }
  const reasons: string[] = [];
  if (hero.record.status !== "awaiting_revive") {
    reasons.push("hero_not_fallen");
  }
  const { heroTable } = context;
  const preferred = hallId ?? hero.record.hallId;
  const atPreferred = resolveBuilding(
    context,
    heroTable.hallBuildingType,
    heroTable.hallMinTier,
    preferred,
  );
  const hall =
    atPreferred.building !== null || hallId !== null
      ? atPreferred
      : resolveBuilding(
          context,
          heroTable.hallBuildingType,
          heroTable.hallMinTier,
          null,
        );
  reasons.push(...hall.reasons);
  if (heroesHoldingSlots(context) >= context.state.aliveHeroCap) {
    reasons.push("hero_cap_reached");
  }
  if (popFree(context) < heroTable.popCost) {
    reasons.push("insufficient_pop");
  }
  const { essence } = reviveCost(context, heroId);
  if (!canAfford(context, { essence })) {
    reasons.push("insufficient_essence");
  }
  return { hallId: hall.building?.id ?? null, result: toResult(reasons) };
}

/**
 * @param context - Rules context
 * @param heroId - Hero to check
 * @param hallId - A specific Hall, or null for any
 * @returns Every reason a revive cannot start now
 */
export function canReviveHero(
  context: HeroCalamityContext,
  heroId: string,
  hallId: string | null = null,
): ActionResult {
  return reviveGate(context, heroId, hallId).result;
}

/**
 * Spends essence and starts the Great Soul pullback at a Hero Hall.
 *
 * @param context - Rules context
 * @param heroId - Fallen hero
 * @param hallId - A specific Hall, or null to use the hero's Hall or any Hall
 * @returns The gate result; nothing changes when it fails
 */
export function startRevive(
  context: HeroCalamityContext,
  heroId: string,
  hallId: string | null = null,
): ActionResult {
  const gate = reviveGate(context, heroId, hallId);
  const record = context.state.heroes[heroId];
  if (!gate.result.ok || !record || gate.hallId === null) {
    return gate.result;
  }
  const { essence, ticks } = reviveCost(context, heroId);
  if (!context.ports.economy.trySpend({ essence })) {
    return toResult(["insufficient_essence"]);
  }
  const completesAtTick = context.state.tick + ticks;
  record.status = "reviving";
  record.hallId = gate.hallId;
  record.channelEndsAtTick = completesAtTick;
  context.events.push({
    completesAtTick,
    essenceSpent: essence,
    hallId: gate.hallId,
    heroId,
    tick: context.state.tick,
    type: "hero_revive_started",
  });
  return gate.result;
}

/**
 * Marks a hero fallen when its unit dies. The unit stays registered with
 * cultivation, so the hero keeps its realm, school, and treasures.
 *
 * @param context - Rules context
 * @param unitId - Unit that died
 * @returns Whether the unit was a living hero
 */
export function onHeroUnitKilled(
  context: HeroCalamityContext,
  unitId: string,
): boolean {
  const record = Object.values(context.state.heroes).find(
    (hero) => hero.unitId === unitId && hero.status === "alive",
  );
  if (!record) {
    return false;
  }
  record.status = "awaiting_revive";
  record.lanternLit = false;
  record.falls += 1;
  context.events.push({
    heroId: record.heroId,
    tick: context.state.tick,
    type: "hero_fallen",
    unitId,
  });
  return true;
}

/**
 * Lets a hero with an open school pick one once it reaches Sworn.
 *
 * @param context - Rules context
 * @param heroId - Hero choosing
 * @param schoolId - School to lock for the run
 * @returns Failure when the hero's school is preset, already chosen, or the
 *   hero is not yet Sworn
 */
export function chooseHeroSchool(
  context: HeroCalamityContext,
  heroId: string,
  schoolId: SchoolId,
): ActionResult {
  const hero = findHero(context, heroId);
  if (!hero) {
    return toResult(["unknown_hero"]);
  }
  const { definition, record } = hero;
  if (definition.schoolChoice !== "at_sworn" || record.schoolId !== null) {
    return toResult(["school_locked"]);
  }
  if (record.unitId === null || record.status !== "alive") {
    return toResult(["hero_not_on_field"]);
  }
  const realm = context.ports.cultivation.getRealm(record.unitId);
  if (realmIndex(realm) < realmIndex(SCHOOL_CHOICE_REALM)) {
    return toResult(["below_sworn"]);
  }
  record.schoolId = schoolId;
  context.ports.cultivation.setSchool(record.unitId, schoolId);
  context.events.push({
    heroId,
    schoolId,
    tick: context.state.tick,
    type: "hero_school_chosen",
  });
  return toResult([]);
}

/**
 * Finishes a training channel: spawns the hero and lights its lantern.
 *
 * @param context - Rules context
 * @param definition - Hero data
 * @param record - Hero record in `training`
 * @param hallId - Hall the hero walks out of
 */
function completeTraining(
  context: HeroCalamityContext,
  definition: HeroDefinition,
  record: HeroRecord,
  hallId: string,
): void {
  const unitId = context.ports.combat.spawnUnit({
    buildingId: hallId,
    classId: combatClassOf(definition),
    definitionId: definition.id,
    kind: "hero",
    popCost: context.heroTable.popCost,
    schoolId: record.schoolId,
    stats: definition.stats,
  });
  context.ports.cultivation.registerCultivator(unitId, {
    schoolId: record.schoolId,
    treasureSlots: context.heroTable.treasureSlots,
  });
  record.unitId = unitId;
  record.status = "alive";
  record.channelEndsAtTick = null;
  record.lanternLit = true;
  context.events.push({
    hallId,
    heroId: definition.id,
    lanternLit: true,
    tick: context.state.tick,
    type: "hero_trained",
    unitId,
  });
}

/**
 * Finishes a revive channel: returns the same unit at the Hall.
 *
 * @param context - Rules context
 * @param record - Hero record in `reviving`
 * @param hallId - Hall the hero returns at
 */
function completeRevive(
  context: HeroCalamityContext,
  record: HeroRecord,
  hallId: string,
): void {
  const unitId = record.unitId ?? "";
  context.ports.combat.reviveUnit(unitId, hallId);
  record.status = "alive";
  record.channelEndsAtTick = null;
  record.lanternLit = true;
  context.events.push({
    hallId,
    heroId: record.heroId,
    lanternLit: true,
    tick: context.state.tick,
    type: "hero_revived",
    unitId,
  });
}

/**
 * Stops a channel whose Hall fell. Spent resources are not refunded
 * (placeholder); training returns to `available`, revive to `awaiting_revive`.
 *
 * @param context - Rules context
 * @param record - Hero record mid-channel
 * @param hallId - Hall that no longer qualifies
 */
function interruptChannel(
  context: HeroCalamityContext,
  record: HeroRecord,
  hallId: string,
): void {
  record.status =
    record.status === "training" ? "available" : "awaiting_revive";
  record.channelEndsAtTick = null;
  context.events.push({
    hallId,
    heroId: record.heroId,
    tick: context.state.tick,
    type: "hero_channel_interrupted",
  });
}

/**
 * Advances every training and revive channel to `context.state.tick`.
 *
 * @param context - Rules context
 */
export function stepHeroChannels(context: HeroCalamityContext): void {
  const { heroTable, state } = context;
  for (const definition of heroTable.heroes) {
    const record = state.heroes[definition.id];
    const endsAt = record?.channelEndsAtTick;
    if (!record || endsAt == null || record.hallId === null) {
      continue;
    }
    const hallStands = buildingStillQualifies(
      context,
      record.hallId,
      heroTable.hallBuildingType,
      heroTable.hallMinTier,
    );
    if (!hallStands) {
      interruptChannel(context, record, record.hallId);
      continue;
    }
    if (state.tick < endsAt) {
      continue;
    }
    if (record.status === "training") {
      completeTraining(context, definition, record, record.hallId);
      continue;
    }
    completeRevive(context, record, record.hallId);
  }
}
