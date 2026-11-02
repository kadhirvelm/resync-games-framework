/**
 * Hero Hall and Calamity Altar rules for Descent (chunk 06).
 *
 * Wiring into the sim core:
 * - Route `train_hero`, `revive_hero`, `summon_calamity`, and hero
 *   `choose_school` commands to `handleCommand` while the sim consumes its
 *   queue. Hero verbs live in `HeroCommand` until the shared union adds them.
 * - Call `step(tick)` once per sim tick after commands; channels finish on
 *   sim ticks only, never wall-clock time.
 * - Forward combat's `unit_killed` to `onUnitKilled`. A missing Altar or Hall
 *   is also detected on the next `step`, so a destroy event is optional.
 * - Add `popUsed()` to the economy's pop total, and store `getState()` under
 *   `meta.heroes` for saves; pass it back as `state` to restore.
 * - Read `drainEvents()` for `hero_fallen`, `hero_revived`,
 *   `calamity_summon_started` (beacon and horn cue), `calamity_summon_completed`,
 *   and `calamity_died`.
 *
 * Ultimates are data-only: nothing here reads or runs them.
 */
import { TICKS_PER_SECOND } from "../sim/constants";
import type { Command, SchoolId } from "../types";
import {
  canSummonCalamity,
  onCalamityUnitKilled,
  stepCalamitySummon,
  strikeWithCalamity,
  summonCalamity,
} from "./calamityAltar";
import { type HeroCalamityContext, modulePopUsed, toResult } from "./context";
import {
  canHeroAct,
  canReviveHero,
  canTrainHero,
  chooseHeroSchool,
  createHeroRecords,
  listHeroes,
  onHeroUnitKilled,
  reviveCost,
  startRevive,
  stepHeroChannels,
  trainHero,
  unlockHero,
} from "./heroHall";
import type { HeroCalamityPorts } from "./ports";
import { CALAMITY_TABLE, HERO_TABLE } from "./tables";
import type {
  ActionResult,
  CalamityStrikeResult,
  CalamityTable,
  HeroCalamityEvent,
  HeroCalamityState,
  HeroCommand,
  HeroState,
  HeroTable,
  StrikePathTile,
} from "./types";

/** Options for `createHeroCalamitySystem`. */
export interface HeroCalamityOptions {
  /** Living-hero cap; defaults to `heroes.json` (3). */
  aliveHeroCap?: number;
  calamityTable?: CalamityTable;
  heroTable?: HeroTable;
  ports: HeroCalamityPorts;
  /** Saved state to restore instead of starting fresh. */
  state?: HeroCalamityState;
  /**
   * Sim rate used to turn hero and summon seconds into ticks. Defaults to the
   * Descent sim's `TICKS_PER_SECOND`; it also replaces the rate in a restored
   * save so new channels always run on the live sim clock.
   */
  ticksPerSecond?: number;
}

/** Outcome of `handleCommand`. `handled` is false for commands it ignores. */
export interface HeroCommandOutcome {
  handled: boolean;
  result: ActionResult;
}

/** The hero and Calamity module bound to one sim. */
export interface HeroCalamitySystem {
  calamityStrike(
    targetId: string,
    raw: number,
    path: readonly StrikePathTile[],
  ): CalamityStrikeResult;
  canHeroAct(heroId: string): boolean;
  canReviveHero(heroId: string, hallId?: string): ActionResult;
  canSummonCalamity(calamityId: string, altarId?: string): ActionResult;
  canTrainHero(heroId: string, hallId: string): ActionResult;
  chooseHeroSchool(heroId: string, schoolId: SchoolId): ActionResult;
  drainEvents(): HeroCalamityEvent[];
  getState(): HeroCalamityState;
  handleCommand(command: Command | HeroCommand): HeroCommandOutcome;
  listHeroes(): HeroState[];
  onUnitKilled(unitId: string): void;
  popUsed(): number;
  reviveCost(heroId: string): { essence: number; ticks: number };
  startRevive(heroId: string, hallId?: string): ActionResult;
  step(tick: number): void;
  summonCalamity(calamityId: string, altarId?: string): ActionResult;
  trainHero(heroId: string, hallId: string): ActionResult;
  unlockHero(heroId: string): ActionResult;
}

/**
 * @param heroTable - Hero data
 * @param aliveHeroCap - Living-hero cap
 * @param ticksPerSecond - Sim rate
 * @returns Fresh module state at tick 0
 */
export function createHeroCalamityState(
  heroTable: HeroTable,
  aliveHeroCap: number,
  ticksPerSecond: number,
): HeroCalamityState {
  return {
    activeCalamity: null,
    aliveHeroCap,
    heroes: createHeroRecords(heroTable),
    summon: null,
    tick: 0,
    ticksPerSecond,
  };
}

/**
 * Binds the hero and Calamity rules to a set of ports.
 *
 * @param options - Ports, optional saved state, and tunables
 * @returns The module's command, query, and tick API
 */
export function createHeroCalamitySystem(
  options: HeroCalamityOptions,
): HeroCalamitySystem {
  const heroTable = options.heroTable ?? HERO_TABLE;
  const ticksPerSecond = options.ticksPerSecond ?? TICKS_PER_SECOND;
  const restored = options.state
    ? { ...options.state, ticksPerSecond }
    : undefined;
  const context: HeroCalamityContext = {
    calamityTable: options.calamityTable ?? CALAMITY_TABLE,
    events: [],
    heroTable,
    ports: options.ports,
    state:
      restored ??
      createHeroCalamityState(
        heroTable,
        options.aliveHeroCap ?? heroTable.aliveCap,
        ticksPerSecond,
      ),
  };

  /**
   * Claims `choose_school` only when the unit is a hero.
   *
   * @param unitId - Unit choosing
   * @param schoolId - School picked
   * @returns Unhandled for non-hero units so cultivation can take it
   */
  const chooseSchoolForUnit = (
    unitId: string,
    schoolId: SchoolId,
  ): HeroCommandOutcome => {
    const hero = Object.values(context.state.heroes).find(
      (record) => record.unitId === unitId,
    );
    if (!hero) {
      return { handled: false, result: toResult([]) };
    }
    return {
      handled: true,
      result: chooseHeroSchool(context, hero.heroId, schoolId),
    };
  };

  /**
   * @param command - Any sim command
   * @returns Whether this module owns it, and its result
   */
  const handleCommand = (
    command: Command | HeroCommand,
  ): HeroCommandOutcome => {
    switch (command.type) {
      case "train_hero":
        return {
          handled: true,
          result: trainHero(context, command.heroId, command.hallId),
        };
      case "revive_hero":
        return {
          handled: true,
          result: startRevive(context, command.heroId, command.hallId ?? null),
        };
      case "summon_calamity":
        return {
          handled: true,
          result: summonCalamity(context, command.calamityId, command.altarId),
        };
      case "choose_school":
        return chooseSchoolForUnit(command.unitId, command.school);
      default:
        return { handled: false, result: toResult([]) };
    }
  };

  return {
    calamityStrike: (targetId, raw, path) =>
      strikeWithCalamity(context, targetId, raw, path),
    canHeroAct: (heroId) => canHeroAct(context, heroId),
    canReviveHero: (heroId, hallId) =>
      canReviveHero(context, heroId, hallId ?? null),
    canSummonCalamity: (calamityId, altarId) =>
      canSummonCalamity(context, calamityId, altarId ?? null),
    canTrainHero: (heroId, hallId) => canTrainHero(context, heroId, hallId),
    chooseHeroSchool: (heroId, schoolId) =>
      chooseHeroSchool(context, heroId, schoolId),
    drainEvents: () => context.events.splice(0),
    getState: () => context.state,
    handleCommand,
    listHeroes: () => listHeroes(context),
    onUnitKilled: (unitId) => {
      if (onHeroUnitKilled(context, unitId)) {
        return;
      }
      onCalamityUnitKilled(context, unitId);
    },
    popUsed: () => modulePopUsed(context),
    reviveCost: (heroId) => reviveCost(context, heroId),
    startRevive: (heroId, hallId) =>
      startRevive(context, heroId, hallId ?? null),
    step: (tick) => {
      context.state.tick = tick;
      stepHeroChannels(context);
      stepCalamitySummon(context);
    },
    summonCalamity: (calamityId, altarId) =>
      summonCalamity(context, calamityId, altarId ?? null),
    trainHero: (heroId, hallId) => trainHero(context, heroId, hallId),
    unlockHero: (heroId) => unlockHero(context, heroId),
  };
}
