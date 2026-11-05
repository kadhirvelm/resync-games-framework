import { type HurtDisk, stepAroundHurt } from "../pathing/avoidHurt";
import { TICK_MS } from "../sim/constants";
import { CombatCommandQueue } from "./commandQueue";
import { getClassCounterMultiplier } from "./counters";
import type {
  BurnStatus,
  CombatBuilding,
  CombatCommand,
  CombatEvent,
  CombatPoint,
  CombatUnit,
  PendingProjectile,
  RankTitle,
  SchoolId,
  StampedCombatCommand,
  UnitDefinition,
  UnitOrder,
} from "./types";

/** Default fixed simulation step: the Descent sim's own tick length. */
export const DEFAULT_COMBAT_TICK_MS = TICK_MS;

/** Ember damage ticks once per simulated second. */
export const BURN_TICK_INTERVAL_MS = 1_000;

/** Ember remains for three damage ticks. */
export const BURN_DURATION_MS = 3_000;

/** Ember damage per tick as a share of the triggering raw attack. */
export const BURN_DAMAGE_RATIO = 0.15;

/** Maximum distance over which Ember jumps after a kill. */
export const BURN_SPREAD_RANGE = 4;

/** First Rime application slows movement by 25%. */
export const CHILL_SPEED_MULTIPLIER = 0.75;

/** Rime slow duration. */
export const CHILL_DURATION_MS = 2_500;

/** Second Rime application briefly immobilizes the target. */
export const FREEZE_DURATION_MS = 800;

/** Blood heals this share of post-armor damage dealt. */
export const BLOOD_LIFESTEAL_RATIO = 0.25;

/** Adept heals ally units whose health is below this share of maximum. */
export const ADEPT_HEAL_THRESHOLD = 0.7;

/** Adept heal amount as a share of the Adept's attack damage. */
export const ADEPT_HEAL_RATIO = 0.8;

/** Attack-move targets farther than this many vision radii are dropped. */
export const ATTACK_MOVE_LEASH_VISION_RATIO = 1.5;

/** Healthy Blood units automatically pay this share of max health. */
export const BLOOD_POWER_HEALTH_COST_RATIO = 0.05;

/** Automatic Blood health spend increases that attack by 15%. */
export const BLOOD_POWER_DAMAGE_MULTIPLIER = 1.15;

/** Blood's automatic power swing is available above this health share. */
export const BLOOD_POWER_HEALTH_THRESHOLD = 0.75;

/** Setup fields that are not owned by a unit definition. */
export interface CreateCombatUnitOptions {
  factionId: string;
  hasLongLife?: boolean;
  hasTreasure?: boolean;
  id: string;
  isWaveUnit?: boolean;
  merit?: number;
  position: CombatPoint;
  rankTitle?: RankTitle;
  school?: SchoolId;
}

/** Initial entities and fixed-step size for a combat simulation. */
export interface CombatSimulationOptions {
  buildings?: CombatBuilding[];
  /**
   * Multiplier on every heal (Adept heals and Blood lifesteal), so a layer
   * can weaken healing. Defaults to 1.
   */
  healingMultiplier?: number;
  /** Disks a unit is hurt for standing in. Steps skirt them. */
  hurtZones?: readonly HurtDisk[];
  /** Disks that block movement without hurting, such as large buildings. */
  obstacles?: readonly HurtDisk[];
  /** Projectiles still in flight, from a previous `exportState`. */
  pendingProjectiles?: PendingProjectile[];
  /** Tick counter to resume from, from a previous `exportState`. */
  startTick?: number;
  tickMs?: number;
  units?: CombatUnit[];
}

/** JSON-safe combat state, enough to rebuild a simulation mid-fight. */
export interface CombatSimulationState {
  buildings: CombatBuilding[];
  pendingProjectiles: PendingProjectile[];
  tick: number;
  units: CombatUnit[];
}

/**
 * Creates a mutable combat entity from a data-driven unit definition.
 * @param definition - Base class stats
 * @param options - Identity, ownership, placement, and optional cultivation data
 * @returns A ready unit with no order or active status
 */
export function createCombatUnit(
  definition: UnitDefinition,
  options: CreateCombatUnitOptions,
): CombatUnit {
  return {
    armor: definition.armor,
    attackCooldownMs: 0,
    attackKind: definition.attackKind,
    attackRange: definition.attackRange,
    attacksPerSecond: definition.attacksPerSecond,
    classId: definition.classId,
    damage: definition.damage,
    definitionId: definition.id,
    factionId: options.factionId,
    hasLongLife: options.hasLongLife,
    hasTreasure: options.hasTreasure,
    hitPoints: definition.maxHitPoints,
    id: options.id,
    isWaveUnit: options.isWaveUnit,
    maxHitPoints: definition.maxHitPoints,
    merit: options.merit ?? 0,
    popCost: definition.popCost,
    position: { ...options.position },
    projectileSpeed: definition.projectileSpeed,
    rankTitle: options.rankTitle ?? definition.defaultRankTitle,
    school: options.school,
    speed: definition.speed,
    statuses: {},
    structureDamageMultiplier: definition.structureDamageMultiplier,
    vision: definition.vision,
  };
}

/**
 * Computes straight-line distance in deterministic simulation space.
 * @param left - First position
 * @param right - Second position
 * @returns Euclidean distance
 */
function distance(left: CombatPoint, right: CombatPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

/**
 * Where one unit walks for a move or attack-move: its formation slot when the
 * command names one, otherwise the clicked point.
 * @param unitId - Unit receiving the order
 * @param command - Move or attack-move command
 * @returns The unit's destination
 */
function orderDestination(
  unitId: string,
  command: { destinations?: Record<string, CombatPoint>; x: number; y: number },
): CombatPoint {
  const slot = command.destinations?.[unitId];
  if (slot !== undefined) return { x: slot.x, y: slot.y };
  return { x: command.x, y: command.y };
}

/**
 * Rounds combat values to keep repeated fixed-tick math stable and readable.
 * @param value - Unrounded simulation value
 * @returns Value rounded to three decimal places
 */
function combatValue(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Orders ids by UTF-16 code units, independent of the runtime locale.
 * @param left - First id
 * @param right - Second id
 * @returns Negative, zero, or positive in the usual comparator sense
 */
export function compareIds(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * Validates a healing multiplier supplied by a layer or host.
 * @param multiplier - Candidate multiplier
 * @returns The same multiplier when it is finite and non-negative
 */
function validHealingMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new Error("Healing multiplier must be a non-negative finite number.");
  }
  return multiplier;
}

/**
 * Merges a new Ember application into an existing burn without resetting
 * its tick clock, so several Ember attackers still deal burn damage.
 * @param existing - Burn already on the target, if any
 * @param sourceId - Unit applying the new burn
 * @param damagePerTick - New burn strength
 * @returns The burn status to store on the target
 */
export function mergeBurn(
  existing: BurnStatus | undefined,
  sourceId: string,
  damagePerTick: number,
): BurnStatus {
  if (!existing) {
    return {
      damagePerTick,
      elapsedMs: 0,
      remainingMs: BURN_DURATION_MS,
      sourceId,
    };
  }
  const newIsStronger = damagePerTick >= existing.damagePerTick;
  return {
    damagePerTick: Math.max(existing.damagePerTick, damagePerTick),
    elapsedMs: existing.elapsedMs,
    remainingMs: BURN_DURATION_MS,
    sourceId: newIsStronger ? sourceId : existing.sourceId,
  };
}

/** Pure, deterministic combat state advanced only through fixed ticks. */
export class CombatSimulation {
  private readonly buildings = new Map<string, CombatBuilding>();
  private readonly commandQueue = new CombatCommandQueue();
  private readonly events: CombatEvent[] = [];
  private factionVisionMultipliers = new Map<string, number>();
  private globalVisionMultiplier = 1;
  private healingMultiplier = 1;
  private readonly hurtZones: readonly HurtDisk[];
  private readonly obstacles: readonly HurtDisk[];
  private readonly pendingProjectiles: PendingProjectile[] = [];
  private readonly tickMs: number;
  private readonly units = new Map<string, CombatUnit>();
  private currentTick = 0;

  /**
   * Creates a combat state from caller-owned entity snapshots.
   * @param options - Initial units, structures, tick length, and healing modifier
   */
  constructor(options: CombatSimulationOptions = {}) {
    this.tickMs = options.tickMs ?? DEFAULT_COMBAT_TICK_MS;
    if (!Number.isFinite(this.tickMs) || this.tickMs <= 0) {
      throw new Error("Combat tick length must be a positive finite number.");
    }
    this.healingMultiplier = validHealingMultiplier(
      options.healingMultiplier ?? 1,
    );
    this.hurtZones = options.hurtZones ?? [];
    this.obstacles = options.obstacles ?? [];
    for (const unit of options.units ?? []) {
      this.units.set(unit.id, structuredClone(unit));
    }
    for (const building of options.buildings ?? []) {
      this.buildings.set(building.id, structuredClone(building));
    }
    for (const projectile of options.pendingProjectiles ?? []) {
      this.pendingProjectiles.push({ ...projectile });
    }
    this.currentTick = Math.max(0, Math.floor(options.startTick ?? 0));
  }

  /**
   * Copies everything needed to resume this fight in a new simulation.
   * Living and dead units are both included so callers can read final health.
   * @returns Detached, JSON-safe state
   */
  exportState(): CombatSimulationState {
    return {
      buildings: [...this.buildings.values()].map((building) =>
        structuredClone(building),
      ),
      pendingProjectiles: this.pendingProjectiles.map((projectile) => ({
        ...projectile,
      })),
      tick: this.currentTick,
      units: [...this.units.values()].map((unit) => structuredClone(unit)),
    };
  }

  /**
   * Stamps an order for the next tick without mutating unit state.
   * @param command - Move, attack-move, target, or stop order
   * @param issuedBy - Stable player or controller id
   * @returns The stamped command
   */
  enqueueCommand(
    command: CombatCommand,
    issuedBy: string,
  ): StampedCombatCommand {
    return this.commandQueue.enqueue(command, issuedBy, this.currentTick);
  }

  /**
   * Advances exactly one fixed simulation tick. The returned events are
   * removed from the internal buffer; events raised outside a tick (for
   * example by `attack` or `applyDamage`) stay until `drainEvents`.
   * @returns Events emitted during this tick
   */
  advanceTick(): CombatEvent[] {
    const firstNewEvent = this.events.length;
    this.currentTick += 1;
    for (const command of this.commandQueue.takeReady(this.currentTick)) {
      this.executeCommand(command);
    }
    this.resolveReadyProjectiles();
    for (const unitId of [...this.units.keys()].sort(compareIds)) {
      const unit = this.units.get(unitId);
      if (!unit || unit.hitPoints <= 0) {
        continue;
      }
      this.advanceStatuses(unit);
      if (unit.hitPoints <= 0) {
        continue;
      }
      this.advanceUnit(unit);
    }
    return this.events.splice(firstNewEvent);
  }

  /**
   * Advances several fixed ticks for simulation orchestration and tests.
   * @param count - Whole number of ticks to advance
   * @returns All events produced by the requested ticks
   */
  advanceTicks(count: number): CombatEvent[] {
    const emitted: CombatEvent[] = [];
    const tickCount = Math.max(0, Math.floor(count));
    for (let index = 0; index < tickCount; index += 1) {
      emitted.push(...this.advanceTick());
    }
    return emitted;
  }

  /**
   * Applies raw damage using counters, armor, structure bonuses, and death hooks.
   * School passives are applied only by attacks, not arbitrary scripted damage.
   * Damage between members of the same faction is ignored.
   * @param sourceId - Unit dealing damage
   * @param targetId - Unit or structure receiving damage
   * @param raw - Pre-mitigation damage
   */
  applyDamage(sourceId: string, targetId: string, raw: number): void {
    const source = this.units.get(sourceId);
    if (!source || source.hitPoints <= 0 || raw <= 0) {
      return;
    }
    const targetUnit = this.units.get(targetId);
    if (targetUnit) {
      if (targetUnit.factionId === source.factionId) {
        return;
      }
      this.applyDamageToUnit(source, targetUnit, raw);
      return;
    }
    const targetBuilding = this.buildings.get(targetId);
    if (!targetBuilding || targetBuilding.factionId === source.factionId) {
      return;
    }
    this.applyDamageToBuilding(source, targetBuilding, raw);
  }

  /**
   * Starts one explicit basic attack, respecting cooldown and attack travel type.
   * @param sourceId - Attacking unit
   * @param targetId - Hostile unit or structure
   * @returns Whether an attack was started; false for allies and out-of-range targets
   */
  attack(sourceId: string, targetId: string): boolean {
    const source = this.units.get(sourceId);
    if (!source || source.hitPoints <= 0 || source.attackCooldownMs > 0) {
      return false;
    }
    const targetPosition = this.getHostileTargetPosition(source, targetId);
    if (
      !targetPosition ||
      this.reachDistance(source, targetId, targetPosition) > source.attackRange
    ) {
      return false;
    }
    this.startAttack(source, targetId);
    return true;
  }

  /**
   * Sets the vision multiplier globally or for one faction.
   * @param multiplier - Non-negative layer or faction modifier
   * @param factionId - Optional faction override; omit for the global modifier
   */
  setVisionMultiplier(multiplier: number, factionId?: string): void {
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new Error(
        "Vision multiplier must be a non-negative finite number.",
      );
    }
    if (factionId) {
      this.factionVisionMultipliers.set(factionId, multiplier);
      return;
    }
    this.globalVisionMultiplier = multiplier;
  }

  /**
   * Sets the multiplier applied to Adept heals and Blood lifesteal.
   * @param multiplier - Non-negative layer modifier; 1 is normal healing
   */
  setHealingMultiplier(multiplier: number): void {
    this.healingMultiplier = validHealingMultiplier(multiplier);
  }

  /**
   * Gets a unit's current layer-adjusted vision.
   * @param unitId - Unit to inspect
   * @returns Effective vision, or zero for an unknown/dead unit
   */
  getVision(unitId: string): number {
    const unit = this.units.get(unitId);
    if (!unit || unit.hitPoints <= 0) {
      return 0;
    }
    const factionMultiplier =
      this.factionVisionMultipliers.get(unit.factionId) ?? 1;
    return combatValue(
      unit.vision * this.globalVisionMultiplier * factionMultiplier,
    );
  }

  /**
   * Gets current movement speed after chill or freeze.
   * @param unitId - Unit to inspect
   * @returns Effective map-units per second
   */
  getEffectiveSpeed(unitId: string): number {
    const unit = this.units.get(unitId);
    if (!unit || unit.hitPoints <= 0 || unit.statuses.frozen) {
      return 0;
    }
    if (unit.statuses.chill) {
      return combatValue(unit.speed * CHILL_SPEED_MULTIPLIER);
    }
    return unit.speed;
  }

  /**
   * Reads a unit without exposing mutable simulation state.
   * @param unitId - Unit identifier
   * @returns A cloned unit snapshot when found
   */
  getUnit(unitId: string): CombatUnit | undefined {
    const unit = this.units.get(unitId);
    return unit ? structuredClone(unit) : undefined;
  }

  /**
   * Reads a structure without exposing mutable simulation state.
   * @param buildingId - Structure identifier
   * @returns A cloned structure snapshot when found
   */
  getBuilding(buildingId: string): CombatBuilding | undefined {
    const building = this.buildings.get(buildingId);
    return building ? structuredClone(building) : undefined;
  }

  /**
   * Reads commands that have not reached their execution tick.
   * @returns Cloned pending commands
   */
  getQueuedCommands(): StampedCombatCommand[] {
    return this.commandQueue.snapshot();
  }

  /**
   * Returns all events not yet returned by `advanceTick` and clears them.
   * @returns Combat events in deterministic order
   */
  drainEvents(): CombatEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /**
   * Applies one stamped command to unit orders.
   * @param stamped - Queue entry whose tick has arrived
   */
  private executeCommand(stamped: StampedCombatCommand): void {
    const { command } = stamped;
    const pace = this.groupPace(command);
    for (const unitId of command.unitIds) {
      const unit = this.units.get(unitId);
      if (!unit || unit.hitPoints <= 0) {
        continue;
      }
      unit.order = this.orderForCommand(unit, command, pace);
    }
    this.events.push({
      command: structuredClone(stamped),
      kind: "command_executed",
    });
  }

  /**
   * The shared marching speed for a group move: its slowest living member's
   * base speed. Chill and freeze still slow a unit below it.
   * @param command - Command being executed
   * @returns The pace, or undefined when the command does not keep pace
   */
  private groupPace(command: CombatCommand): number | undefined {
    if (command.type !== "order_move" && command.type !== "order_attack_move") {
      return undefined;
    }
    if (command.keepPace !== true) {
      return undefined;
    }
    let slowest: number | undefined;
    for (const unitId of command.unitIds) {
      const unit = this.units.get(unitId);
      if (!unit || unit.hitPoints <= 0) {
        continue;
      }
      if (slowest === undefined || unit.speed < slowest) {
        slowest = unit.speed;
      }
    }
    return slowest;
  }

  /**
   * Translates one command into the order a unit should carry.
   * @param unit - Living unit receiving the command
   * @param command - Command being executed
   * @param pace - Group marching speed, if the group keeps pace
   * @returns The new order, or undefined for stop and friendly targets
   */
  private orderForCommand(
    unit: CombatUnit,
    command: CombatCommand,
    pace: number | undefined,
  ): UnitOrder | undefined {
    if (command.type === "order_move") {
      return {
        destination: orderDestination(unit.id, command),
        ...(pace === undefined ? {} : { pace }),
        type: "move",
      };
    }
    if (command.type === "order_attack_move") {
      return {
        destination: orderDestination(unit.id, command),
        ...(pace === undefined ? {} : { pace }),
        type: "attack_move",
      };
    }
    if (command.type !== "order_attack") {
      return undefined;
    }
    if (this.isFriendlyTarget(unit, command.targetId)) {
      return undefined;
    }
    return { targetId: command.targetId, type: "attack_target" };
  }

  /**
   * Advances status durations and applies due Ember damage.
   * @param unit - Living unit at the start of the tick
   */
  private advanceStatuses(unit: CombatUnit): void {
    const burn = unit.statuses.burn;
    if (burn) {
      burn.elapsedMs += this.tickMs;
      burn.remainingMs -= this.tickMs;
      const dueTicks = Math.floor(burn.elapsedMs / BURN_TICK_INTERVAL_MS);
      burn.elapsedMs %= BURN_TICK_INTERVAL_MS;
      for (let index = 0; index < dueTicks && unit.hitPoints > 0; index += 1) {
        this.applyPureUnitDamage(burn.sourceId, unit, burn.damagePerTick);
        if (unit.hitPoints <= 0) {
          this.spreadBurn(burn.sourceId, unit, burn.damagePerTick);
        }
      }
      if (burn.remainingMs <= 0 || unit.hitPoints <= 0) {
        unit.statuses.burn = undefined;
      }
    }

    const chill = unit.statuses.chill;
    if (chill) {
      chill.remainingMs -= this.tickMs;
      if (chill.remainingMs <= 0) {
        unit.statuses.chill = undefined;
      }
    }

    const frozen = unit.statuses.frozen;
    if (!frozen) {
      return;
    }
    frozen.remainingMs -= this.tickMs;
    if (frozen.remainingMs <= 0) {
      unit.statuses.frozen = undefined;
    }
  }

  /**
   * Counts down the attack cooldown. Overshoot from the tick on which the
   * unit became ready is kept (as a negative value) so the next attack lands
   * on schedule; a unit that was already ready carries nothing forward.
   * @param unit - Living unit to update
   */
  private advanceCooldown(unit: CombatUnit): void {
    if (unit.attackCooldownMs <= 0) {
      unit.attackCooldownMs = 0;
      return;
    }
    unit.attackCooldownMs -= this.tickMs;
  }

  /**
   * Advances cooldown, healing, movement, acquisition, and basic attacks.
   * @param unit - Living unit to update
   */
  private advanceUnit(unit: CombatUnit): void {
    this.advanceCooldown(unit);
    if (unit.statuses.frozen) {
      return;
    }
    if (unit.order?.type !== "move" && this.tryAdeptHeal(unit)) {
      return;
    }
    if (!unit.order) {
      this.acquireGuardTarget(unit);
    }
    const order = unit.order;
    if (!order) {
      return;
    }
    if (order.type === "move") {
      if (this.moveToward(unit, order.destination, order.pace)) {
        unit.order = undefined;
      }
      return;
    }
    if (order.type === "attack_target") {
      this.advanceTargetOrder(unit, order.targetId);
      return;
    }

    const acquiredTarget = this.keepOrAcquireTarget(unit, order.targetId);
    order.targetId = acquiredTarget;
    if (acquiredTarget) {
      this.advanceTowardTarget(unit, acquiredTarget);
      return;
    }
    if (this.moveToward(unit, order.destination, order.pace)) {
      unit.order = undefined;
    }
  }

  /**
   * Gives an idle unit a guard order against the nearest enemy unit in
   * vision. The order is an attack-move back to the unit's current spot, so
   * after the fight (or a leash break) it walks home.
   * @param unit - Idle living unit
   */
  private acquireGuardTarget(unit: CombatUnit): void {
    const targetId = this.findNearestEnemyUnit(unit, this.getVision(unit.id));
    if (!targetId) {
      return;
    }
    unit.order = {
      destination: { ...unit.position },
      targetId,
      type: "attack_move",
    };
  }

  /**
   * Pursues a specifically ordered target or clears an invalid order.
   * @param unit - Ordered attacker
   * @param targetId - Requested target
   */
  private advanceTargetOrder(unit: CombatUnit, targetId: string): void {
    if (!this.getHostileTargetPosition(unit, targetId)) {
      unit.order = undefined;
      return;
    }
    this.advanceTowardTarget(unit, targetId);
  }

  /**
   * Attacks an in-range target or moves toward it.
   * @param unit - Pursuing attacker
   * @param targetId - Living hostile target
   */
  private advanceTowardTarget(unit: CombatUnit, targetId: string): void {
    const targetPosition = this.getHostileTargetPosition(unit, targetId);
    if (!targetPosition) {
      return;
    }
    if (
      this.reachDistance(unit, targetId, targetPosition) <= unit.attackRange
    ) {
      this.startAttack(unit, targetId);
      return;
    }
    this.moveToward(unit, targetPosition);
  }

  /**
   * The gap an attack has to cover: center distance less the extra body
   * size of the attacker and of the target. Ordinary units add nothing; a
   * large building adds the distance to its edge.
   * @param source - Attacker
   * @param targetId - Unit or building being attacked
   * @param targetPosition - Target's current position
   * @returns Distance compared against the attacker's range
   */
  private reachDistance(
    source: CombatUnit,
    targetId: string,
    targetPosition: CombatPoint,
  ): number {
    const targetRadius =
      this.units.get(targetId)?.bodyRadius ??
      this.buildings.get(targetId)?.bodyRadius ??
      0;
    const sourceRadius = source.bodyRadius ?? 0;
    return Math.max(
      0,
      distance(source.position, targetPosition) - targetRadius - sourceRadius,
    );
  }

  /**
   * Keeps a live attack-move target inside the leash, or finds the nearest
   * visible enemy unit, falling back to the nearest visible enemy building.
   * A building target is swapped for an enemy unit as soon as one is seen.
   * @param unit - Unit seeking a target
   * @param targetId - Previously acquired target
   * @returns Target to pursue, if any
   */
  private keepOrAcquireTarget(
    unit: CombatUnit,
    targetId?: string,
  ): string | undefined {
    const vision = this.getVision(unit.id);
    const nearestUnit = this.findNearestEnemyUnit(unit, vision);
    if (targetId && this.isWithinLeash(unit, targetId, vision)) {
      const keptBuilding = !this.units.has(targetId);
      if (keptBuilding && nearestUnit) {
        return nearestUnit;
      }
      return targetId;
    }
    return nearestUnit ?? this.findNearestEnemyBuilding(unit, vision);
  }

  /**
   * Checks whether an acquired target is still hostile, alive, and within
   * the attack-move leash of the unit.
   * @param unit - Unit holding the target
   * @param targetId - Acquired target
   * @param vision - Unit's effective vision
   * @returns Whether the target should be kept
   */
  private isWithinLeash(
    unit: CombatUnit,
    targetId: string,
    vision: number,
  ): boolean {
    const position = this.getHostileTargetPosition(unit, targetId);
    if (!position) {
      return false;
    }
    return (
      distance(unit.position, position) <=
      vision * ATTACK_MOVE_LEASH_VISION_RATIO
    );
  }

  /**
   * Finds a hostile living unit with deterministic distance and id tie-breaking.
   * @param source - Unit doing the search
   * @param range - Maximum acquisition radius
   * @returns Nearest enemy id
   */
  private findNearestEnemyUnit(
    source: CombatUnit,
    range: number,
  ): string | undefined {
    return [...this.units.values()]
      .filter(
        (candidate) =>
          candidate.hitPoints > 0 &&
          candidate.factionId !== source.factionId &&
          distance(source.position, candidate.position) <= range,
      )
      .sort((left, right) => {
        const distanceDifference =
          distance(source.position, left.position) -
          distance(source.position, right.position);
        return distanceDifference || compareIds(left.id, right.id);
      })[0]?.id;
  }

  /**
   * Finds a standing enemy-faction building with deterministic tie-breaking.
   * @param source - Unit doing the search
   * @param range - Maximum acquisition radius
   * @returns Nearest enemy building id
   */
  private findNearestEnemyBuilding(
    source: CombatUnit,
    range: number,
  ): string | undefined {
    return [...this.buildings.values()]
      .filter(
        (candidate) =>
          candidate.hitPoints > 0 &&
          candidate.factionId !== source.factionId &&
          distance(source.position, candidate.position) -
            (candidate.bodyRadius ?? 0) <=
            range,
      )
      .sort((left, right) => {
        const distanceDifference =
          distance(source.position, left.position) -
          distance(source.position, right.position);
        return distanceDifference || compareIds(left.id, right.id);
      })[0]?.id;
  }

  /**
   * Lets a ready Adept heal the most-injured nearby ally instead of attacking.
   * @param unit - Living, unfrozen unit
   * @returns Whether a heal was cast this tick
   */
  private tryAdeptHeal(unit: CombatUnit): boolean {
    if (unit.classId !== "adept" || unit.attackCooldownMs > 0) {
      return false;
    }
    const ally = this.findMostInjuredAlly(unit);
    if (!ally) {
      return false;
    }
    const amount = combatValue(
      Math.min(
        ally.maxHitPoints - ally.hitPoints,
        unit.damage * ADEPT_HEAL_RATIO * this.healingMultiplier,
      ),
    );
    if (amount <= 0) {
      return false;
    }
    this.resetAttackCooldown(unit);
    ally.hitPoints = combatValue(ally.hitPoints + amount);
    this.events.push({
      amount,
      kind: "unit_healed",
      sourceId: unit.id,
      unitId: ally.id,
    });
    return true;
  }

  /**
   * Finds the same-faction ally in range with the lowest health share below
   * the Adept heal threshold.
   * @param healer - Adept looking for a patient
   * @returns The ally to heal, if any
   */
  private findMostInjuredAlly(healer: CombatUnit): CombatUnit | undefined {
    return [...this.units.values()]
      .filter(
        (candidate) =>
          candidate.id !== healer.id &&
          candidate.hitPoints > 0 &&
          candidate.factionId === healer.factionId &&
          candidate.hitPoints < candidate.maxHitPoints * ADEPT_HEAL_THRESHOLD &&
          distance(healer.position, candidate.position) <= healer.attackRange,
      )
      .sort((left, right) => {
        const shareDifference =
          left.hitPoints / left.maxHitPoints -
          right.hitPoints / right.maxHitPoints;
        return shareDifference || compareIds(left.id, right.id);
      })[0];
  }

  /**
   * Moves a unit by at most one fixed-tick step, skirting hurt zones.
   * @param unit - Unit to move
   * @param destination - Point to approach
   * @param pace - Optional top speed, used when marching with a group
   * @returns Whether the destination was reached
   */
  private moveToward(
    unit: CombatUnit,
    destination: CombatPoint,
    pace?: number,
  ): boolean {
    const remaining = distance(unit.position, destination);
    if (remaining === 0) {
      return true;
    }
    const effective = this.getEffectiveSpeed(unit.id);
    const speed = pace === undefined ? effective : Math.min(effective, pace);
    const step = (speed * this.tickMs) / 1_000;
    if (step <= 0) {
      return false;
    }
    const ratio = Math.min(1, step / remaining);
    const proposed = {
      x: unit.position.x + (destination.x - unit.position.x) * ratio,
      y: unit.position.y + (destination.y - unit.position.y) * ratio,
    };
    const next = stepAroundHurt(unit.position, proposed, destination, [
      ...this.hurtZones,
      ...this.obstacles,
    ]);
    if (next.x === destination.x && next.y === destination.y) {
      unit.position = { ...destination };
      return true;
    }
    unit.position = {
      x: combatValue(next.x),
      y: combatValue(next.y),
    };
    return false;
  }

  /**
   * Starts the next attack interval, keeping any overshoot already carried
   * but never banking more than one attack.
   * @param unit - Unit that just attacked or healed
   */
  private resetAttackCooldown(unit: CombatUnit): void {
    const interval = 1_000 / unit.attacksPerSecond;
    unit.attackCooldownMs =
      Math.max(Math.min(0, unit.attackCooldownMs), -interval) + interval;
  }

  /**
   * Starts a basic hit and schedules projectile travel when needed.
   * @param source - Unit beginning the attack
   * @param targetId - Living unit or structure id
   */
  private startAttack(source: CombatUnit, targetId: string): void {
    if (source.attackCooldownMs > 0) {
      return;
    }
    let rawDamage = source.damage;
    if (this.shouldSpendBloodPower(source)) {
      const healthCost = combatValue(
        source.maxHitPoints * BLOOD_POWER_HEALTH_COST_RATIO,
      );
      source.hitPoints = combatValue(source.hitPoints - healthCost);
      rawDamage = combatValue(rawDamage * BLOOD_POWER_DAMAGE_MULTIPLIER);
      this.events.push({
        amount: healthCost,
        kind: "blood_power_spent",
        unitId: source.id,
      });
    }

    this.resetAttackCooldown(source);
    this.events.push({
      attackKind: source.attackKind,
      kind: "attack_started",
      sourceId: source.id,
      targetId,
    });
    if (source.attackKind === "melee") {
      this.resolveAttackImpact(source, targetId, rawDamage);
      return;
    }

    const targetPosition = this.getLivingTargetPosition(targetId);
    if (!targetPosition) {
      return;
    }
    const travelMs =
      (distance(source.position, targetPosition) /
        Math.max(0.001, source.projectileSpeed ?? 1)) *
      1_000;
    this.pendingProjectiles.push({
      impactTick:
        this.currentTick + Math.max(1, Math.ceil(travelMs / this.tickMs)),
      rawDamage,
      sourceId: source.id,
      targetId,
    });
  }

  /**
   * Resolves projectiles whose deterministic travel ticks have elapsed.
   */
  private resolveReadyProjectiles(): void {
    const ready = this.pendingProjectiles
      .filter((projectile) => projectile.impactTick <= this.currentTick)
      .sort(
        (left, right) =>
          left.impactTick - right.impactTick ||
          compareIds(left.sourceId, right.sourceId) ||
          compareIds(left.targetId, right.targetId),
      );
    const waiting = this.pendingProjectiles.filter(
      (projectile) => projectile.impactTick > this.currentTick,
    );
    this.pendingProjectiles.splice(
      0,
      this.pendingProjectiles.length,
      ...waiting,
    );
    for (const projectile of ready) {
      const source = this.units.get(projectile.sourceId);
      if (!source) {
        continue;
      }
      this.resolveAttackImpact(
        source,
        projectile.targetId,
        projectile.rawDamage,
      );
    }
  }

  /**
   * Resolves damage and the attacker's passive school effect.
   * @param source - Attacking unit, including a dead projectile owner
   * @param targetId - Impact target
   * @param rawDamage - Prepared raw attack damage
   */
  private resolveAttackImpact(
    source: CombatUnit,
    targetId: string,
    rawDamage: number,
  ): void {
    if (this.isFriendlyTarget(source, targetId)) {
      return;
    }
    const targetUnit = this.units.get(targetId);
    if (!targetUnit || targetUnit.hitPoints <= 0) {
      const building = this.buildings.get(targetId);
      if (building) {
        this.applyDamageToBuilding(source, building, rawDamage);
      }
      return;
    }

    const damageDealt = this.applyDamageToUnit(source, targetUnit, rawDamage);
    if (source.school === "ember") {
      this.applyEmber(source, targetUnit, rawDamage);
    }
    if (source.school === "rime" && targetUnit.hitPoints > 0) {
      this.applyRime(source, targetUnit);
    }
    if (source.school === "blood" && source.hitPoints > 0) {
      this.applyBloodLifesteal(source, damageDealt);
    }
  }

  /**
   * Applies armor and then the class counter to a unit target, so armor is
   * not cancelled by the counter bonus: `max(1, (raw - armor) * counter)`.
   * @param source - Damage source
   * @param target - Unit receiving damage
   * @param rawDamage - Damage before armor and counters
   * @returns Actual hit points removed
   */
  private applyDamageToUnit(
    source: CombatUnit,
    target: CombatUnit,
    rawDamage: number,
  ): number {
    if (target.hitPoints <= 0 || rawDamage <= 0) {
      return 0;
    }
    const counterMultiplier = getClassCounterMultiplier(
      source.classId,
      target.classId,
    );
    const mitigated = Math.max(
      1,
      (rawDamage - target.armor) * counterMultiplier,
    );
    return this.applyPureUnitDamage(source.id, target, mitigated);
  }

  /**
   * Removes hit points without applying class or armor math again.
   * @param sourceId - Damage source used by event and death hooks
   * @param target - Unit receiving damage
   * @param damage - Final damage amount
   * @returns Actual hit points removed
   */
  private applyPureUnitDamage(
    sourceId: string,
    target: CombatUnit,
    damage: number,
  ): number {
    const dealt = combatValue(Math.min(target.hitPoints, Math.max(0, damage)));
    if (dealt <= 0) {
      return 0;
    }
    target.hitPoints = combatValue(target.hitPoints - dealt);
    this.events.push({
      amount: dealt,
      kind: "damage_applied",
      sourceId,
      targetId: target.id,
    });
    if (target.hitPoints <= 0) {
      this.killUnit(sourceId, target);
    }
    return dealt;
  }

  /**
   * Applies armor and then the Breaker structure multiplier to a building:
   * `max(1, (raw - armor) * structureDamageMultiplier)`.
   * @param source - Damage source
   * @param target - Building receiving damage
   * @param rawDamage - Damage before armor and structure modifiers
   * @returns Actual structure hit points removed
   */
  private applyDamageToBuilding(
    source: CombatUnit,
    target: CombatBuilding,
    rawDamage: number,
  ): number {
    if (target.hitPoints <= 0 || rawDamage <= 0) {
      return 0;
    }
    const modified = Math.max(
      1,
      (rawDamage - target.armor) * source.structureDamageMultiplier,
    );
    const dealt = combatValue(Math.min(target.hitPoints, modified));
    target.hitPoints = combatValue(target.hitPoints - dealt);
    this.events.push({
      amount: dealt,
      hitPoints: target.hitPoints,
      kind: "building_damaged",
      sourceId: source.id,
      targetId: target.id,
    });
    return dealt;
  }

  /**
   * Applies or spreads Ember after a basic attack impact. A refresh keeps the
   * burn's tick clock and the stronger of the two burn strengths.
   * @param source - Ember attacker
   * @param target - Unit struck
   * @param rawDamage - Raw attack used to size burn
   */
  private applyEmber(
    source: CombatUnit,
    target: CombatUnit,
    rawDamage: number,
  ): void {
    const damagePerTick = combatValue(
      Math.max(1, rawDamage * BURN_DAMAGE_RATIO),
    );
    if (target.hitPoints <= 0) {
      this.spreadBurn(source.id, target, damagePerTick);
      return;
    }
    target.statuses.burn = mergeBurn(
      target.statuses.burn,
      source.id,
      damagePerTick,
    );
    this.events.push({
      effect: "burn",
      kind: "status_applied",
      sourceId: source.id,
      targetId: target.id,
    });
  }

  /**
   * Applies a Rime slow, or turns a hit on a chilled target into a freeze.
   * Freezing consumes the chill, so the cycle is chill, freeze, chill again.
   * @param source - Rime attacker
   * @param target - Living target
   */
  private applyRime(source: CombatUnit, target: CombatUnit): void {
    if (target.statuses.chill) {
      target.statuses.chill = undefined;
      target.statuses.frozen = { remainingMs: FREEZE_DURATION_MS };
      this.events.push({
        effect: "frozen",
        kind: "status_applied",
        sourceId: source.id,
        targetId: target.id,
      });
      return;
    }
    target.statuses.chill = { remainingMs: CHILL_DURATION_MS };
    this.events.push({
      effect: "chill",
      kind: "status_applied",
      sourceId: source.id,
      targetId: target.id,
    });
  }

  /**
   * Heals a Blood attacker for a share of actual post-armor damage.
   * @param source - Blood attacker
   * @param damageDealt - Actual hit points removed
   */
  private applyBloodLifesteal(source: CombatUnit, damageDealt: number): void {
    const missingHealth = source.maxHitPoints - source.hitPoints;
    const healed = combatValue(
      Math.min(
        missingHealth,
        damageDealt * BLOOD_LIFESTEAL_RATIO * this.healingMultiplier,
      ),
    );
    if (healed <= 0) {
      return;
    }
    source.hitPoints = combatValue(source.hitPoints + healed);
    this.events.push({
      amount: healed,
      kind: "unit_healed",
      sourceId: source.id,
      unitId: source.id,
    });
  }

  /**
   * Checks whether Blood's automatic healthy-unit power swing should trigger.
   * @param source - Potential Blood attacker
   * @returns Whether health can be spent safely and passively
   */
  private shouldSpendBloodPower(source: CombatUnit): boolean {
    if (source.school !== "blood") {
      return false;
    }
    return (
      source.hitPoints / source.maxHitPoints > BLOOD_POWER_HEALTH_THRESHOLD
    );
  }

  /**
   * Moves Ember from a killed unit to the nearest nearby hostile unit.
   * @param sourceId - Original Ember attacker
   * @param killed - Unit from which burn spreads
   * @param damagePerTick - Burn strength to copy
   */
  private spreadBurn(
    sourceId: string,
    killed: CombatUnit,
    damagePerTick: number,
  ): void {
    const nextTarget = [...this.units.values()]
      .filter(
        (candidate) =>
          candidate.id !== killed.id &&
          candidate.hitPoints > 0 &&
          candidate.factionId === killed.factionId &&
          distance(killed.position, candidate.position) <= BURN_SPREAD_RANGE,
      )
      .sort((left, right) => {
        const distanceDifference =
          distance(killed.position, left.position) -
          distance(killed.position, right.position);
        return distanceDifference || compareIds(left.id, right.id);
      })[0];
    if (!nextTarget) {
      return;
    }
    nextTarget.statuses.burn = mergeBurn(
      nextTarget.statuses.burn,
      sourceId,
      damagePerTick,
    );
    this.events.push({
      effect: "burn",
      kind: "status_applied",
      sourceId,
      targetId: nextTarget.id,
    });
  }

  /**
   * Emits death hooks and applies merit loss exactly once.
   * Note: `CombatUnit.merit` is combat's own copy. Cultivation owns the real
   * battle merit and applies its own death loss in
   * `CultivationSystem.onUnitDeath`; `meritLost` here is informational.
   * @param killerId - Unit credited with the kill
   * @param target - Newly killed unit
   */
  private killUnit(killerId: string, target: CombatUnit): void {
    const meritLossRatio = target.hasLongLife ? 0.1 : 0.25;
    const meritLost = combatValue(target.merit * meritLossRatio);
    target.merit = combatValue(Math.max(0, target.merit - meritLost));
    target.order = undefined;
    this.events.push({
      killerId,
      kind: "unit_killed",
      meritLost,
      treasureDropped: target.hasTreasure === true,
      unitId: target.id,
    });
    if (target.isWaveUnit) {
      this.events.push({ killerId, kind: "wave_unit_died", unitId: target.id });
    }
  }

  /**
   * Checks whether an id names a unit or building of the source's faction.
   * @param source - Unit that would deal damage
   * @param targetId - Unit or building id
   * @returns Whether hitting the target would be friendly fire
   */
  private isFriendlyTarget(source: CombatUnit, targetId: string): boolean {
    const unit = this.units.get(targetId);
    if (unit) {
      return unit.factionId === source.factionId;
    }
    const building = this.buildings.get(targetId);
    return building?.factionId === source.factionId;
  }

  /**
   * Gets a living, hostile unit or structure position.
   * @param source - Unit that would attack
   * @param targetId - Unit or building id
   * @returns Target position when it is alive and of another faction
   */
  private getHostileTargetPosition(
    source: CombatUnit,
    targetId: string,
  ): CombatPoint | undefined {
    if (this.isFriendlyTarget(source, targetId)) {
      return undefined;
    }
    return this.getLivingTargetPosition(targetId);
  }

  /**
   * Gets a living unit or structure position.
   * @param targetId - Unit or building id
   * @returns Target position when it can still be attacked
   */
  private getLivingTargetPosition(targetId: string): CombatPoint | undefined {
    const unit = this.units.get(targetId);
    if (unit && unit.hitPoints > 0) {
      return unit.position;
    }
    const building = this.buildings.get(targetId);
    if (building && building.hitPoints > 0) {
      return building.position;
    }
    return undefined;
  }
}
