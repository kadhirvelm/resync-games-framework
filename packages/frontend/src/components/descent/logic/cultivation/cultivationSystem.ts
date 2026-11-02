import { PILLS, REALMS, TREASURES } from "./data";
import type { CultivationCombatPort, CultivationStockpilePort } from "./ports";
import type { CultivationSystemState } from "./types";
import {
  type ActiveBreakthrough,
  type BreakthroughOutcome,
  type BreakthroughRolls,
  type CultivationFailure,
  type CultivationResult,
  type CultivationSuccess,
  type CultivationSystemOptions,
  type CultivationUnitState,
  type CultivationView,
  type HallTier,
  type PillDefinition,
  type PillPreview,
  RANK_TITLES,
  type RankTitle,
  type RealmDefinition,
  type RegisterCultivationUnitInput,
  type SchoolId,
  type TreasureInstance,
} from "./types";

/** Seconds a failed breakthrough injures the unit (and blocks retries). */
export const BREAKTHROUGH_INJURY_SECONDS = 45;

/** Maximum permanent-pill toxicity allowed in each realm. */
export const TOXICITY_CAP = 3;

/** Share of battle merit a unit loses when it dies. */
export const DEATH_MERIT_LOSS_RATIO = 0.25;

/** Death merit loss with the Long Life passive (Champion and above). */
export const LONG_LIFE_DEATH_MERIT_LOSS_RATIO = 0.1;

/** First rank whose passives include Long Life. */
const LONG_LIFE_RANK: RankTitle = "Champion";

/** Roll used when a breakthrough has no supplied roll: always a failure. */
const MISSING_ROLL = 1;

const HALL_TIERS: HallTier[] = ["Camp", "Stronghold", "Citadel"];
const VALID_ESSENCE_GRADES = new Set([1, 2, 4, 8, 16]);

/**
 * Gets the canonical order of a rank.
 * @param rank - Rank to locate
 * @returns Zero-based rank index
 */
function rankIndex(rank: RankTitle): number {
  return RANK_TITLES.indexOf(rank);
}

/**
 * Gets the canonical order of a Hall tier.
 * @param tier - Hall tier to locate
 * @returns Zero-based Hall tier index
 */
function hallTierIndex(tier: HallTier): number {
  return HALL_TIERS.indexOf(tier);
}

/**
 * Creates a successful command result.
 * @param value - Command payload
 * @returns Tagged success
 */
function success<T>(value: T): CultivationSuccess<T> {
  return { ok: true, value };
}

/**
 * Creates a rejected command result.
 * @param error - Player-readable rejection reason
 * @returns Tagged failure
 */
function failure(error: string): CultivationFailure {
  return { error, ok: false };
}

/**
 * Copies unit state deeply enough that render code cannot mutate the sim.
 * @param unit - Internal cultivation state
 * @returns Detached unit snapshot
 */
function cloneUnit(unit: CultivationUnitState): CultivationUnitState {
  return {
    ...unit,
    activeBreakthrough: unit.activeBreakthrough
      ? { ...unit.activeBreakthrough }
      : undefined,
    appliedPills: unit.appliedPills.map((pill) => ({ ...pill })),
    equippedTreasures: unit.equippedTreasures.map((treasure) => ({
      ...treasure,
    })),
  };
}

/**
 * Reads one breakthrough roll from a record or function source.
 * @param rolls - Record by unit id, or a roll function
 * @param unitId - Unit whose channel is finishing
 * @returns The 0..1 roll; a missing record entry counts as a failing 1
 */
function readRoll(rolls: BreakthroughRolls, unitId: string): number {
  if (typeof rolls === "function") {
    return rolls(unitId);
  }
  return rolls[unitId] ?? MISSING_ROLL;
}

/**
 * Computes battle merit left after a death.
 * @param unit - Unit that died
 * @returns Whole merit remaining after the 25% (or Long Life 10%) loss
 */
export function meritAfterDeath(unit: CultivationUnitState): number {
  const hasLongLife = rankIndex(unit.rank) >= rankIndex(LONG_LIFE_RANK);
  const lossRatio = hasLongLife
    ? LONG_LIFE_DEATH_MERIT_LOSS_RATIO
    : DEATH_MERIT_LOSS_RATIO;
  return Math.floor(unit.merit * (1 - lossRatio));
}

/** Headless cultivation rules with explicit combat, economy, and layer seams. */
export class CultivationSystem {
  private readonly units = new Map<string, CultivationUnitState>();
  private readonly inventoryTreasures = new Map<string, TreasureInstance>();
  private readonly groundTreasures = new Map<string, TreasureInstance>();

  /**
   * Creates the cultivation rules service.
   * @param options - Injected layer-owned maximum rank function
   * @param combat - Combat calls used for damage, death, and injury
   * @param stockpile - Economy calls used for materials, pills, Hall, and pop
   */
  constructor(
    private readonly options: CultivationSystemOptions,
    private readonly combat: CultivationCombatPort,
    private readonly stockpile: CultivationStockpilePort,
  ) {}

  /**
   * Copies every unit and treasure so the sim can save cultivation.
   * @returns Detached, JSON-safe state for `restoreState`
   */
  exportState(): CultivationSystemState {
    return {
      groundTreasures: [...this.groundTreasures.values()].map((treasure) => ({
        ...treasure,
      })),
      inventoryTreasures: [...this.inventoryTreasures.values()].map(
        (treasure) => ({ ...treasure }),
      ),
      units: [...this.units.values()].map(cloneUnit),
    };
  }

  /**
   * Replaces all units and treasures with a saved copy. Combat registration
   * is left to the caller, whose combat port already holds the saved bodies.
   * @param state - Output of `exportState`
   */
  restoreState(state: CultivationSystemState): void {
    this.units.clear();
    this.inventoryTreasures.clear();
    this.groundTreasures.clear();
    for (const unit of state.units)
      this.units.set(unit.unitId, cloneUnit(unit));
    for (const treasure of state.inventoryTreasures) {
      this.inventoryTreasures.set(treasure.instanceId, { ...treasure });
    }
    for (const treasure of state.groundTreasures) {
      this.groundTreasures.set(treasure.instanceId, { ...treasure });
    }
  }

  /**
   * Forgets a unit that left the field for good (not a fallen hero).
   * @param unitId - Unit to drop; unknown ids are ignored
   */
  removeUnit(unitId: string): void {
    this.units.delete(unitId);
  }

  /**
   * Reports whether a unit is on the ladder.
   * @param unitId - Unit to look up
   * @returns Whether it was registered
   */
  hasUnit(unitId: string): boolean {
    return this.units.has(unitId);
  }

  /**
   * Registers a non-villager combat unit on the Ashborn-to-Ascended ladder.
   * @param input - Initial cultivation and combat values
   * @returns Registered detached unit state or a duplicate-id rejection
   */
  registerUnit(
    input: RegisterCultivationUnitInput,
  ): CultivationResult<CultivationUnitState> {
    if (this.units.has(input.unitId)) {
      return failure(`Cultivation unit already exists: ${input.unitId}`);
    }
    const rank = input.rank ?? "Ashborn";
    const unit: CultivationUnitState = {
      appliedPills: [],
      combatProof: Math.max(0, input.combatProof ?? 0),
      equippedTreasures: [],
      essence: Math.max(0, input.essence ?? 0),
      isHero: input.isHero ?? false,
      merit: Math.max(0, input.merit ?? 0),
      rank,
      school: input.school,
      unitId: input.unitId,
    };
    this.units.set(input.unitId, unit);
    this.combat.registerUnit(input.unitId, Math.max(1, input.maxHealth ?? 100));
    return success(cloneUnit(unit));
  }

  /**
   * Builds the cultivation unit-panel read model.
   * @param unitId - Unit to inspect
   * @returns Rank, gates, toxicity, success chance, and cumulative passives
   */
  getCultivationView(unitId: string): CultivationView {
    const unit = this.requireUnit(unitId);
    const realm = this.realmForRank(unit.rank);
    const breakthrough = realm.breakthrough;
    const toxicity = this.currentToxicity(unit);
    const currentIndex = rankIndex(unit.rank);
    const passives = REALMS.slice(0, currentIndex + 1).flatMap(
      (definition) => definition.passives,
    );
    if (!breakthrough) {
      return {
        essence: unit.essence,
        essenceToNext: 0,
        merit: unit.merit,
        meritToNext: 0,
        missingRequirements: [],
        passives,
        rank: unit.rank,
        school: unit.school,
        successChance: 1,
        toxicity,
        toxicityCap: TOXICITY_CAP,
      };
    }
    return {
      essence: unit.essence,
      essenceToNext: breakthrough.essence,
      merit: unit.merit,
      meritToNext: breakthrough.merit,
      missingRequirements: this.missingRequirements(unit, realm),
      passives,
      rank: unit.rank,
      school: unit.school,
      successChance: this.successChance(realm),
      toxicity,
      toxicityCap: TOXICITY_CAP,
    };
  }

  /**
   * Reads detached cultivation state for save and headless assertions.
   * @param unitId - Unit to inspect
   * @returns Detached unit snapshot
   */
  getUnitState(unitId: string): CultivationUnitState {
    return cloneUnit(this.requireUnit(unitId));
  }

  /**
   * Adds battle merit without spending or trading it.
   * @param unitId - Unit earning merit
   * @param amount - Non-negative merit earned
   * @returns Updated merit total
   */
  awardMerit(unitId: string, amount: number): number {
    const unit = this.requireUnit(unitId);
    unit.merit += Math.max(0, amount);
    return unit.merit;
  }

  /**
   * Adds refined essence to a unit's breakthrough bar.
   * @param unitId - Unit receiving essence
   * @param amount - Non-negative essence earned
   * @returns Updated essence total
   */
  awardEssence(unitId: string, amount: number): number {
    const unit = this.requireUnit(unitId);
    unit.essence += Math.max(0, amount);
    return unit.essence;
  }

  /**
   * Records combat proof such as qualifying kills.
   * @param unitId - Unit receiving proof
   * @param amount - Non-negative proof count, default one
   * @returns Updated proof total
   */
  recordCombatProof(unitId: string, amount = 1): number {
    const unit = this.requireUnit(unitId);
    unit.combatProof += Math.max(0, amount);
    return unit.combatProof;
  }

  /**
   * Locks a unit's school once it has reached Sworn.
   * @param unitId - Unit choosing a school
   * @param school - Ember, Rime, or Blood
   * @returns Chosen school or a rank/lock rejection
   */
  chooseSchool(unitId: string, school: SchoolId): CultivationResult<SchoolId> {
    const unit = this.requireUnit(unitId);
    if (rankIndex(unit.rank) < rankIndex("Sworn")) {
      return failure("School choice unlocks at Sworn.");
    }
    if (unit.school) {
      return failure("School is already locked for this run.");
    }
    unit.school = school;
    return success(school);
  }

  /**
   * Projects a pill's effect and toxicity before inventory is consumed.
   * @param unitId - Potential recipient
   * @param pillId - Pill definition and inventory id
   * @returns Read-only effect, school-match, and toxicity projection
   */
  previewPill(unitId: string, pillId: string): PillPreview {
    const unit = this.requireUnit(unitId);
    const pill = this.requirePill(pillId);
    const toxicity = this.currentToxicity(unit);
    const isPermanent = pill.role === "permanent";
    const schoolMatch = pill.school ? pill.school === unit.school : undefined;
    let multiplier = 1;
    if (schoolMatch === false) {
      multiplier = 0.5;
    }
    let reason: string | undefined;
    if (pill.role === "battle") {
      reason ??= "Battle Pill is data only; mid-fight pill micro is deferred.";
    }
    if (pill.role === "breakthrough") {
      reason ??=
        "Breakthrough Pill is consumed only when a breakthrough begins.";
    }
    if (pill.role === "dao" && !unit.school) {
      reason ??= "Choose a school before feeding a Dao Pill.";
    }
    if (isPermanent && toxicity >= TOXICITY_CAP) {
      reason ??= `Toxicity cap reached for ${unit.rank}.`;
    }
    if (this.stockpile.getItemCount(pillId) < 1) {
      reason ??= `No ${pill.name} is available.`;
    }
    return {
      canFeed: reason === undefined,
      effectivenessMultiplier: multiplier,
      pillId,
      projectedAmount: pill.effect.amount * multiplier,
      reason,
      schoolMatch,
      toxicity,
      toxicityAfter: toxicity + (isPermanent ? 1 : 0),
      toxicityCap: TOXICITY_CAP,
    };
  }

  /**
   * Consumes and applies a feedable pill after validating its preview.
   * @param unitId - Recipient unit
   * @param pillId - Permanent or Dao pill id
   * @returns Applied effect or a no-consume rejection
   */
  feedPill(unitId: string, pillId: string): CultivationResult<number> {
    const preview = this.previewPill(unitId, pillId);
    if (!preview.canFeed) {
      return failure(preview.reason ?? "Pill cannot be fed.");
    }
    if (!this.stockpile.consumeItem(pillId)) {
      return failure("Pill inventory changed before it could be consumed.");
    }
    const unit = this.requireUnit(unitId);
    const pill = this.requirePill(pillId);
    if (pill.role !== "permanent" && pill.role !== "dao") {
      return failure("This pill has no cultivation feeding behavior.");
    }
    unit.appliedPills.push({
      amount: preview.projectedAmount,
      pillId,
      realm: unit.rank,
      role: pill.role,
      schoolMatch: preview.schoolMatch,
      stat: pill.effect.stat,
    });
    return success(preview.projectedAmount);
  }

  /**
   * Pays all validated gates and starts a 20-second channel or Tribulation.
   * Spends in refundable order (population, then the pill, then materials)
   * so a failed spend never loses anything.
   * @param unitId - Unit attempting to advance
   * @returns Active breakthrough state or the first unmet checklist reason
   */
  startBreakthrough(unitId: string): CultivationResult<ActiveBreakthrough> {
    const unit = this.requireUnit(unitId);
    const realm = this.realmForRank(unit.rank);
    const breakthrough = realm.breakthrough;
    if (!breakthrough) {
      return failure("Ascended is the highest cultivation rank.");
    }
    const missing = this.missingRequirements(unit, realm);
    if (missing.length > 0) {
      return failure(missing[0] ?? "Breakthrough requirements are incomplete.");
    }
    const targetRealm = this.realmForRank(breakthrough.targetRank);
    const populationDelta = Math.max(
      0,
      targetRealm.population - realm.population,
    );
    if (!this.stockpile.reservePopulation(populationDelta)) {
      return failure("Spare population was lost before the channel began.");
    }
    if (!this.stockpile.consumeItem("breakthrough_pill")) {
      this.stockpile.releasePopulation(populationDelta);
      return failure("Breakthrough Pill changed before it could be consumed.");
    }
    if (!this.stockpile.trySpend(breakthrough.materials)) {
      this.stockpile.addItem("breakthrough_pill", 1);
      this.stockpile.releasePopulation(populationDelta);
      return failure("Tier materials changed before they could be spent.");
    }
    unit.activeBreakthrough = {
      kind: breakthrough.kind,
      remainingSeconds: breakthrough.channelSeconds,
      reservedPopulation: populationDelta,
      sourceRank: unit.rank,
      successChance: this.successChance(realm),
      targetRank: breakthrough.targetRank,
    };
    return success({ ...unit.activeBreakthrough });
  }

  /**
   * Advances active channels using simulation time and caller-supplied rolls.
   * Tribulation succeeds solely by surviving its full 30 seconds. A channel
   * whose roll is missing from a record fails (it is treated as a roll of 1).
   * @param seconds - Non-negative simulation seconds to advance
   * @param outcomeRolls - Deterministic 0..1 rolls, as a record by unit id or
   *   a function called once per finishing channel
   * @returns Outcomes resolved during this advance
   */
  advanceBreakthroughs(
    seconds: number,
    outcomeRolls: BreakthroughRolls = {},
  ): BreakthroughOutcome[] {
    const elapsed = Math.max(0, seconds);
    this.combat.advanceTime(elapsed);
    const outcomes: BreakthroughOutcome[] = [];
    for (const unit of this.units.values()) {
      const active = unit.activeBreakthrough;
      if (!active) {
        continue;
      }
      if (!this.combat.isAlive(unit.unitId)) {
        outcomes.push(this.resolveBreakthrough(unit, false));
        continue;
      }
      active.remainingSeconds = Math.max(0, active.remainingSeconds - elapsed);
      if (active.remainingSeconds > 0) {
        continue;
      }
      const survivedTribulation = active.kind === "tribulation";
      const succeeded =
        survivedTribulation ||
        readRoll(outcomeRolls, unit.unitId) < active.successChance;
      outcomes.push(this.resolveBreakthrough(unit, succeeded));
    }
    return outcomes;
  }

  /**
   * Routes a combat damage event and drops treasures on a lethal hit.
   * @param unitId - Unit taking combat or Tribulation damage
   * @param amount - Non-negative raw damage already resolved by combat
   * @returns Treasure instances dropped by a resulting death
   */
  applyCombatDamage(unitId: string, amount: number): TreasureInstance[] {
    this.requireUnit(unitId);
    const damage = this.combat.applyDamage(unitId, amount);
    if (!damage.died) {
      return [];
    }
    return this.onUnitDeath(unitId);
  }

  /**
   * Handles a combat-owned death event: merit loss (25%, or 10% with Long
   * Life at Champion and above), a channel failure, and treasure drops.
   * Heroes keep their treasures because they revive; mortals drop them.
   * @param unitId - Dead unit
   * @returns Treasure instances now recoverable on the ground
   */
  onUnitDeath(unitId: string): TreasureInstance[] {
    const unit = this.requireUnit(unitId);
    unit.merit = meritAfterDeath(unit);
    if (unit.activeBreakthrough) {
      this.resolveBreakthrough(unit, false);
    }
    if (unit.isHero) {
      return [];
    }
    const dropped = unit.equippedTreasures.map((treasure) => ({ ...treasure }));
    unit.equippedTreasures = [];
    for (const treasure of dropped) {
      this.groundTreasures.set(treasure.instanceId, treasure);
    }
    return dropped;
  }

  /**
   * Adds a forged treasure to recoverable inventory at the layer's grade.
   * @param treasure - Unique instance id, known definition, and essence grade
   * @returns Forged treasure or a definition/grade/id rejection
   */
  forgeTreasure(
    treasure: TreasureInstance,
  ): CultivationResult<TreasureInstance> {
    if (
      !TREASURES.some((definition) => definition.id === treasure.definitionId)
    ) {
      return failure(`Unknown treasure definition: ${treasure.definitionId}`);
    }
    if (!VALID_ESSENCE_GRADES.has(treasure.essenceGrade)) {
      return failure("Treasure essence grade must be 1, 2, 4, 8, or 16.");
    }
    if (this.hasTreasureInstance(treasure.instanceId)) {
      return failure(
        `Treasure instance already exists: ${treasure.instanceId}`,
      );
    }
    const forged = { ...treasure };
    this.inventoryTreasures.set(forged.instanceId, forged);
    return success({ ...forged });
  }

  /**
   * Equips one inventory treasure, enforcing realm and hero slot rules.
   * @param unitId - Unit receiving the treasure
   * @param instanceId - Forged treasure instance id
   * @returns Equipped treasure or a slot/eligibility rejection
   */
  equipTreasure(
    unitId: string,
    instanceId: string,
  ): CultivationResult<TreasureInstance> {
    const unit = this.requireUnit(unitId);
    if (!this.combat.isAlive(unitId)) {
      return failure("A dead unit cannot equip treasure.");
    }
    if (!unit.isHero && rankIndex(unit.rank) < rankIndex("Veteran")) {
      return failure("Treasure slots unlock for non-heroes at Veteran.");
    }
    const slotCap = unit.isHero ? 3 : 1;
    if (unit.equippedTreasures.length >= slotCap) {
      return failure(`All ${slotCap} treasure slots are occupied.`);
    }
    const treasure = this.inventoryTreasures.get(instanceId);
    if (!treasure) {
      return failure(`Treasure is not in inventory: ${instanceId}`);
    }
    this.inventoryTreasures.delete(instanceId);
    unit.equippedTreasures.push(treasure);
    return success({ ...treasure });
  }

  /**
   * Recovers a death drop into treasure inventory.
   * @param instanceId - Ground treasure instance id
   * @returns Recovered treasure or a missing-drop rejection
   */
  recoverTreasure(instanceId: string): CultivationResult<TreasureInstance> {
    const treasure = this.groundTreasures.get(instanceId);
    if (!treasure) {
      return failure(`Treasure is not on the ground: ${instanceId}`);
    }
    this.groundTreasures.delete(instanceId);
    this.inventoryTreasures.set(instanceId, treasure);
    return success({ ...treasure });
  }

  /**
   * Lists detached treasure drops awaiting recovery.
   * @returns All current ground treasures
   */
  getGroundTreasures(): TreasureInstance[] {
    return [...this.groundTreasures.values()].map((treasure) => ({
      ...treasure,
    }));
  }

  /**
   * Lists detached forged or recovered treasures ready to equip.
   * @returns All current inventory treasures
   */
  getInventoryTreasures(): TreasureInstance[] {
    return [...this.inventoryTreasures.values()].map((treasure) => ({
      ...treasure,
    }));
  }

  /**
   * Resolves a successful or failed breakthrough and its resource aftermath.
   * The population reserved for the channel is released either way: on
   * failure the unit keeps its old weight, and on success the host counts
   * the unit's new realm population weight directly, so keeping the
   * reservation would double-count it.
   * @param unit - Unit whose active attempt is ending
   * @param succeeded - Whether the attempt passed
   * @returns Stable outcome event
   */
  private resolveBreakthrough(
    unit: CultivationUnitState,
    succeeded: boolean,
  ): BreakthroughOutcome {
    const active = unit.activeBreakthrough;
    if (!active) {
      throw new Error(`Unit has no active breakthrough: ${unit.unitId}`);
    }
    const outcome: BreakthroughOutcome = {
      kind: active.kind,
      sourceRank: active.sourceRank,
      succeeded,
      targetRank: active.targetRank,
      unitId: unit.unitId,
    };
    unit.activeBreakthrough = undefined;
    this.stockpile.releasePopulation(active.reservedPopulation);
    if (!succeeded) {
      unit.essence = Math.floor(unit.essence / 2);
      this.combat.applyInjury(unit.unitId, BREAKTHROUGH_INJURY_SECONDS);
      return outcome;
    }
    unit.rank = active.targetRank;
    unit.essence = 0;
    return outcome;
  }

  /**
   * Computes all player-readable breakthrough checklist failures.
   * @param unit - Unit being checked
   * @param realm - Unit's current realm definition
   * @returns Missing checklist items in gate order
   */
  private missingRequirements(
    unit: CultivationUnitState,
    realm: RealmDefinition,
  ): string[] {
    const breakthrough = realm.breakthrough;
    if (!breakthrough) {
      return [];
    }
    const missing: string[] = [];
    if (unit.merit < breakthrough.merit) {
      missing.push(`Battle merit ${unit.merit}/${breakthrough.merit}`);
    }
    if (unit.combatProof < breakthrough.combatProof) {
      missing.push(
        `Combat proof ${unit.combatProof}/${breakthrough.combatProof}`,
      );
    }
    if (unit.essence < breakthrough.essence) {
      missing.push(`Essence ${unit.essence}/${breakthrough.essence}`);
    }
    if (!this.stockpile.hasResources(breakthrough.materials)) {
      missing.push("Tier materials are missing from stockpile.");
    }
    if (
      hallTierIndex(this.stockpile.getHallTier()) <
      hallTierIndex(breakthrough.hallTier)
    ) {
      missing.push(`Cultivation Hall requires ${breakthrough.hallTier}.`);
    }
    if (this.stockpile.getItemCount("breakthrough_pill") < 1) {
      missing.push("Breakthrough Pill is required.");
    }
    const targetRealm = this.realmForRank(breakthrough.targetRank);
    const populationDelta = Math.max(
      0,
      targetRealm.population - realm.population,
    );
    if (!this.stockpile.canAffordPop(populationDelta)) {
      missing.push(`Spare population ${populationDelta} is required.`);
    }
    const maxRank = this.options.maxRankForLayer();
    if (rankIndex(breakthrough.targetRank) > rankIndex(maxRank)) {
      missing.push(`Layer rank cap is ${maxRank}.`);
    }
    if (rankIndex(unit.rank) >= rankIndex("Sworn") && !unit.school) {
      missing.push("School choice is required before advancing.");
    }
    if (!this.combat.isAlive(unit.unitId)) {
      missing.push("Unit must be alive to break through.");
    }
    if (this.combat.getInjurySeconds(unit.unitId) > 0) {
      missing.push("Breakthrough injury is active.");
    }
    if (unit.activeBreakthrough) {
      missing.push("Breakthrough is already channeling.");
    }
    return missing;
  }

  /**
   * Counts permanent pills consumed in the unit's current realm.
   * @param unit - Unit to inspect
   * @returns Current-realm toxicity from zero through three
   */
  private currentToxicity(unit: CultivationUnitState): number {
    return unit.appliedPills.filter(
      (pill) => pill.role === "permanent" && pill.realm === unit.rank,
    ).length;
  }

  /**
   * Includes the required Breakthrough Pill's 20% bonus in the shown chance.
   * @param realm - Current realm definition
   * @returns Clamped success chance from zero through one
   */
  private successChance(realm: RealmDefinition): number {
    const breakthrough = realm.breakthrough;
    if (!breakthrough) {
      return 1;
    }
    const pill = this.requirePill("breakthrough_pill");
    return Math.min(1, breakthrough.baseSuccessChance + pill.effect.amount);
  }

  /**
   * Resolves a registered unit or throws for a broken integration.
   * @param unitId - Unit id to resolve
   * @returns Mutable internal unit state
   */
  private requireUnit(unitId: string): CultivationUnitState {
    const unit = this.units.get(unitId);
    if (!unit) {
      throw new Error(`Unknown cultivation unit: ${unitId}`);
    }
    return unit;
  }

  /**
   * Resolves a realm by player-facing rank.
   * @param rank - Rank whose realm data is needed
   * @returns Matching realm definition
   */
  private realmForRank(rank: RankTitle): RealmDefinition {
    const realm = REALMS.find((definition) => definition.rank === rank);
    if (!realm) {
      throw new Error(`Missing realm definition for rank: ${rank}`);
    }
    return realm;
  }

  /**
   * Resolves a pill by data id.
   * @param pillId - Pill id to resolve
   * @returns Matching pill definition
   */
  private requirePill(pillId: string): PillDefinition {
    const pill = PILLS.find((definition) => definition.id === pillId);
    if (!pill) {
      throw new Error(`Unknown pill definition: ${pillId}`);
    }
    return pill;
  }

  /**
   * Checks all locations for a duplicate unique treasure id.
   * @param instanceId - Treasure instance id
   * @returns True when the id is already present anywhere
   */
  private hasTreasureInstance(instanceId: string): boolean {
    if (
      this.inventoryTreasures.has(instanceId) ||
      this.groundTreasures.has(instanceId)
    ) {
      return true;
    }
    return [...this.units.values()].some((unit) =>
      unit.equippedTreasures.some(
        (treasure) => treasure.instanceId === instanceId,
      ),
    );
  }
}

/**
 * Functional adapter for consumers that prefer a named query over a method.
 * @param system - Cultivation system holding unit state
 * @param unitId - Unit to inspect
 * @returns Cultivation unit-panel view
 */
export function getCultivationView(
  system: CultivationSystem,
  unitId: string,
): CultivationView {
  return system.getCultivationView(unitId);
}
