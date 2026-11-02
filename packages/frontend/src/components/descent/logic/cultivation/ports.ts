import type { CultivationResourceId, HallTier, ResourceCost } from "./types";

/** Result from applying a combat damage event through the cultivation seam. */
export interface CultivationDamageResult {
  alive: boolean;
  died: boolean;
}

/** Narrow combat seam used by channels, injury, and death-driven drops. */
export interface CultivationCombatPort {
  registerUnit(unitId: string, maxHealth: number): void;
  isAlive(unitId: string): boolean;
  applyDamage(unitId: string, amount: number): CultivationDamageResult;
  applyInjury(unitId: string, seconds: number): void;
  getInjurySeconds(unitId: string): number;
  advanceTime(seconds: number): void;
}

/** Narrow economy seam used for materials, pill inventory, Hall tier, and pop. */
export interface CultivationStockpilePort {
  getStockpile(): Readonly<Record<CultivationResourceId, number>>;
  hasResources(cost: ResourceCost): boolean;
  trySpend(cost: ResourceCost): boolean;
  getItemCount(itemId: string): number;
  consumeItem(itemId: string): boolean;
  addItem(itemId: string, count?: number): void;
  getHallTier(): HallTier;
  canAffordPop(delta: number): boolean;
  reservePopulation(delta: number): boolean;
  releasePopulation(delta: number): void;
  getPopulation(): { used: number; cap: number };
}

interface CombatStubUnit {
  health: number;
  maxHealth: number;
  injurySeconds: number;
}

/** Headless combat stub for cultivation tests and pre-integration wiring. */
export class CultivationCombatStub implements CultivationCombatPort {
  private readonly units = new Map<string, CombatStubUnit>();

  /**
   * Adds a living combat unit when it is not already tracked.
   * @param unitId - Stable unit id
   * @param maxHealth - Starting and maximum health
   */
  registerUnit(unitId: string, maxHealth: number): void {
    if (this.units.has(unitId)) {
      return;
    }
    this.units.set(unitId, {
      health: maxHealth,
      injurySeconds: 0,
      maxHealth,
    });
  }

  /**
   * Reports whether the combat stub still considers a unit alive.
   * @param unitId - Unit to inspect
   * @returns True when its health is above zero
   */
  isAlive(unitId: string): boolean {
    return (this.units.get(unitId)?.health ?? 0) > 0;
  }

  /**
   * Applies a deterministic combat damage event.
   * @param unitId - Unit taking damage
   * @param amount - Non-negative damage amount
   * @returns Current life state and whether this hit caused death
   */
  applyDamage(unitId: string, amount: number): CultivationDamageResult {
    const unit = this.requireUnit(unitId);
    const wasAlive = unit.health > 0;
    unit.health = Math.max(0, unit.health - Math.max(0, amount));
    return { alive: unit.health > 0, died: wasAlive && unit.health === 0 };
  }

  /**
   * Applies or extends a breakthrough injury timer.
   * @param unitId - Injured unit
   * @param seconds - Injury duration in simulation seconds
   */
  applyInjury(unitId: string, seconds: number): void {
    const unit = this.requireUnit(unitId);
    unit.injurySeconds = Math.max(unit.injurySeconds, Math.max(0, seconds));
  }

  /**
   * Reads the remaining injury duration.
   * @param unitId - Unit to inspect
   * @returns Remaining injury duration in simulation seconds
   */
  getInjurySeconds(unitId: string): number {
    return this.requireUnit(unitId).injurySeconds;
  }

  /**
   * Advances only combat timers; it performs no autonomous combat.
   * @param seconds - Simulation time to advance
   */
  advanceTime(seconds: number): void {
    const elapsed = Math.max(0, seconds);
    for (const unit of this.units.values()) {
      unit.injurySeconds = Math.max(0, unit.injurySeconds - elapsed);
    }
  }

  /**
   * Restores a dead unit for headless drop/re-equip fixtures.
   * @param unitId - Unit to restore
   */
  restoreUnit(unitId: string): void {
    const unit = this.requireUnit(unitId);
    unit.health = unit.maxHealth;
  }

  /**
   * Resolves a tracked unit or throws for a broken integration.
   * @param unitId - Unit to resolve
   * @returns Mutable combat stub state
   */
  private requireUnit(unitId: string): CombatStubUnit {
    const unit = this.units.get(unitId);
    if (!unit) {
      throw new Error(`Unknown combat unit: ${unitId}`);
    }
    return unit;
  }
}

/** Configuration accepted by the headless stockpile stub. */
export interface CultivationStockpileStubOptions {
  resources?: ResourceCost;
  items?: Record<string, number>;
  hallTier?: HallTier;
  populationUsed?: number;
  populationCap?: number;
}

/**
 * Creates a complete zero-filled resource record.
 * @param resources - Sparse values to overlay
 * @returns All cultivation resource ids with finite non-negative quantities
 */
function completeResources(
  resources: ResourceCost = {},
): Record<CultivationResourceId, number> {
  return {
    coin: Math.max(0, resources.coin ?? 0),
    essence: Math.max(0, resources.essence ?? 0),
    food: Math.max(0, resources.food ?? 0),
    iron: Math.max(0, resources.iron ?? 0),
    spirit_herbs: Math.max(0, resources.spirit_herbs ?? 0),
    stone: Math.max(0, resources.stone ?? 0),
    water: Math.max(0, resources.water ?? 0),
    wood: Math.max(0, resources.wood ?? 0),
  };
}

/** In-memory stockpile stub for cultivation tests and pre-integration wiring. */
export class CultivationStockpileStub implements CultivationStockpilePort {
  private readonly resources: Record<CultivationResourceId, number>;
  private readonly items = new Map<string, number>();
  private hallTier: HallTier;
  private populationUsed: number;
  private populationCap: number;

  /**
   * Builds a deterministic stockpile fixture.
   * @param options - Starting resources, inventory, Hall tier, and population
   */
  constructor(options: CultivationStockpileStubOptions = {}) {
    this.resources = completeResources(options.resources);
    this.hallTier = options.hallTier ?? "Camp";
    this.populationUsed = Math.max(0, options.populationUsed ?? 0);
    this.populationCap = Math.max(0, options.populationCap ?? 100);
    for (const [itemId, count] of Object.entries(options.items ?? {})) {
      this.items.set(itemId, Math.max(0, count));
    }
  }

  /**
   * Returns an immutable-by-copy stockpile view.
   * @returns Current resource quantities
   */
  getStockpile(): Readonly<Record<CultivationResourceId, number>> {
    return { ...this.resources };
  }

  /**
   * Checks a sparse resource cost without consuming it.
   * @param cost - Required quantities
   * @returns True when every resource is affordable
   */
  hasResources(cost: ResourceCost): boolean {
    return Object.entries(cost).every(([resourceId, amount]) => {
      const id = resourceId as CultivationResourceId;
      return this.resources[id] >= (amount ?? 0);
    });
  }

  /**
   * Atomically spends a sparse cost when affordable.
   * @param cost - Quantities to consume
   * @returns True when the spend was applied
   */
  trySpend(cost: ResourceCost): boolean {
    if (!this.hasResources(cost)) {
      return false;
    }
    for (const [resourceId, amount] of Object.entries(cost)) {
      const id = resourceId as CultivationResourceId;
      this.resources[id] -= amount ?? 0;
    }
    return true;
  }

  /**
   * Reads an inventory item count.
   * @param itemId - Pill or other item id
   * @returns Available item count
   */
  getItemCount(itemId: string): number {
    return this.items.get(itemId) ?? 0;
  }

  /**
   * Consumes one item when present.
   * @param itemId - Item to consume
   * @returns True when one item was removed
   */
  consumeItem(itemId: string): boolean {
    const count = this.getItemCount(itemId);
    if (count < 1) {
      return false;
    }
    this.items.set(itemId, count - 1);
    return true;
  }

  /**
   * Adds item inventory for brewing/forging stubs.
   * @param itemId - Item to add
   * @param count - Non-negative quantity, default one
   */
  addItem(itemId: string, count = 1): void {
    const next = this.getItemCount(itemId) + Math.max(0, count);
    this.items.set(itemId, next);
  }

  /**
   * Reads the current Cultivation Hall tier.
   * @returns Current Hold tier for breakthrough gating
   */
  getHallTier(): HallTier {
    return this.hallTier;
  }

  /**
   * Changes the Hall tier in a headless fixture.
   * @param hallTier - New Hall tier
   */
  setHallTier(hallTier: HallTier): void {
    this.hallTier = hallTier;
  }

  /**
   * Checks whether a population increase fits.
   * @param delta - Additional weighted population
   * @returns True when the new total would not exceed the cap
   */
  canAffordPop(delta: number): boolean {
    return this.populationUsed + Math.max(0, delta) <= this.populationCap;
  }

  /**
   * Reserves weighted population while a unit channels.
   * @param delta - Additional population required by the target realm
   * @returns True when the reservation was made
   */
  reservePopulation(delta: number): boolean {
    const amount = Math.max(0, delta);
    if (!this.canAffordPop(amount)) {
      return false;
    }
    this.populationUsed += amount;
    return true;
  }

  /**
   * Releases a failed channel's population reservation.
   * @param delta - Previously reserved population
   */
  releasePopulation(delta: number): void {
    this.populationUsed = Math.max(0, this.populationUsed - Math.max(0, delta));
  }

  /**
   * Reads weighted population use and cap.
   * @returns Current population values
   */
  getPopulation(): { used: number; cap: number } {
    return { cap: this.populationCap, used: this.populationUsed };
  }

  /**
   * Changes the population cap in a headless fixture.
   * @param cap - New non-negative cap
   */
  setPopulationCap(cap: number): void {
    this.populationCap = Math.max(0, cap);
  }
}
