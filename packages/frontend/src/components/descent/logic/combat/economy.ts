import type { CombatClassId, RankTitle, TrainingCost } from "./types";
import { getUnitDefinition } from "./unitCatalog";

/** Economy operations needed to commit one training batch. */
export interface CombatEconomy {
  /** Checks whether the population cap can fit a batch. */
  canAddPopulation(amount: number): boolean;
  /** Deducts food and water atomically when affordable. */
  spend(cost: TrainingCost): boolean;
  /** Commits population after resources have been paid. */
  addPopulation(amount: number): void;
}

/** Serializable state used by the local economy stub. */
export interface StubCombatEconomyState {
  food: number;
  population: number;
  populationCap: number;
  water: number;
}

/** Result of attempting to train a mortal combat batch. */
export type TrainUnitBatchResult =
  | {
      count: number;
      ok: true;
      populationAdded: number;
      spent: TrainingCost;
    }
  | { ok: false; reason: "population-cap" | "resources" };

/** Minimal in-memory economy for isolated combat tests and early integration. */
export class StubCombatEconomy implements CombatEconomy {
  /**
   * Creates the economy stub from caller-owned values.
   * @param state - Starting resources and population
   */
  constructor(public readonly state: StubCombatEconomyState) {}

  /**
   * Checks whether additional population fits.
   * @param amount - Population weight to reserve
   * @returns Whether the cap has room
   */
  canAddPopulation(amount: number): boolean {
    return this.state.population + amount <= this.state.populationCap;
  }

  /**
   * Pays food and water if both are available.
   * @param cost - Resource amount to deduct
   * @returns Whether the resources were paid
   */
  spend(cost: TrainingCost): boolean {
    if (this.state.food < cost.food || this.state.water < cost.water) {
      return false;
    }
    this.state.food -= cost.food;
    this.state.water -= cost.water;
    return true;
  }

  /**
   * Adds already-validated population.
   * @param amount - Population weight to commit
   */
  addPopulation(amount: number): void {
    this.state.population += amount;
  }
}

/**
 * Trains one mortal batch, spending resources through the economy seam.
 * Ashborn and Sworn train five at a time; higher ranks train individually.
 * @param classId - Combat class to train
 * @param rankTitle - Rank of the trained mortal
 * @param economy - Owning economy implementation
 * @returns The committed batch or a failure with no resource changes
 */
export function trainUnitBatch(
  classId: CombatClassId,
  rankTitle: RankTitle,
  economy: CombatEconomy,
): TrainUnitBatchResult {
  const definition = getUnitDefinition(classId);
  const count = rankTitle === "Ashborn" || rankTitle === "Sworn" ? 5 : 1;
  const populationAdded = definition.popCost * count;
  const spent = {
    food: definition.trainingCost.food * count,
    water: definition.trainingCost.water * count,
  };

  if (!economy.canAddPopulation(populationAdded)) {
    return { ok: false, reason: "population-cap" };
  }
  if (!economy.spend(spent)) {
    return { ok: false, reason: "resources" };
  }
  economy.addPopulation(populationAdded);
  return { count, ok: true, populationAdded, spent };
}
