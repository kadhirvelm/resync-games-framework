import { REALMS } from "./data";
import type { CultivationUnitState } from "./types";

/** Stat multipliers a unit's cultivation applies on top of its base class. */
export interface CultivationStatModifiers {
  /** Multiplier on base attack damage. */
  damage: number;
  /** Multiplier on base maximum health. */
  maxHealth: number;
  /** Multiplier on base movement speed. */
  moveSpeed: number;
  /** Multiplier on the unit's school passive strength. */
  schoolEffect: number;
}

/**
 * Sums the applied pill amounts for one stat.
 * @param unit - Unit whose pills are read
 * @param stat - Pill effect stat id
 * @returns Additive bonus, already halved for off-school Dao pills
 */
function pillBonus(unit: CultivationUnitState, stat: string): number {
  return unit.appliedPills
    .filter((pill) => pill.stat === stat)
    .reduce((total, pill) => total + pill.amount, 0);
}

/**
 * Computes the multipliers cultivation applies to a unit's base stats:
 * the realm `statMultiplier` on health and damage, permanent-pill health and
 * speed bonuses, and Dao-pill school effect bonuses. Pill bonuses stack
 * additively; an off-school Dao pill's half effect is already in its amount.
 * @param unit - Cultivation state of one unit
 * @returns Multipliers where 1 means unchanged
 */
export function cultivationStatModifiers(
  unit: CultivationUnitState,
): CultivationStatModifiers {
  const realmMultiplier =
    REALMS.find((realm) => realm.rank === unit.rank)?.statMultiplier ?? 1;
  return {
    damage: realmMultiplier,
    maxHealth: realmMultiplier * (1 + pillBonus(unit, "max_health")),
    moveSpeed: 1 + pillBonus(unit, "move_speed"),
    schoolEffect: 1 + pillBonus(unit, "school_effect"),
  };
}
