/**
 * Read models and population checks. Stockpile and building lists are copies,
 * so a view cannot write the sim by editing the result.
 */

import type { ResourceStockpile, UnitState } from "../types";
import type {
  EconomyBuildingView,
  EconomyHost,
  EconomyUnit,
  HoldTier,
  ResourceNode,
  SpiritVein,
} from "./model";
import { countedPop } from "./pop";
import { asBuilding, isEconomyUnit } from "./records";
import { copyStockpile } from "./stockpile";
import { basePopCap, buildingDef } from "./tables";

/**
 * @param host - World to read
 * @returns A copy of the eight resource totals
 */
export function readStockpile(host: EconomyHost): ResourceStockpile {
  return copyStockpile(host.resources);
}

/**
 * Population of villagers, soldiers, and reservations.
 * Heroes and Calamities are omitted; their module adds that share.
 * @param host - World to score
 * @returns Population currently charged against the cap
 */
export function getPopUsed(host: EconomyHost): number {
  let used = host.economy.popReserved;
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    used += countedPop(unit);
  }
  return used;
}

/**
 * Base cap plus the bonus of every finished housing building.
 * @param host - World to score
 * @returns The population cap
 */
export function getPopCap(host: EconomyHost): number {
  let cap = basePopCap();
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (!record.completed) continue;
    cap += buildingDef(record.buildingType)?.popBonus ?? 0;
  }
  return cap;
}

/**
 * @param host - World to score
 * @param delta - Extra population a breakthrough or training would add
 * @returns Whether `delta` still fits under the cap
 */
export function canAffordPop(host: EconomyHost, delta: number): boolean {
  if (!Number.isFinite(delta)) return false;
  return getPopUsed(host) + delta <= getPopCap(host);
}

/**
 * Holds population for a breakthrough channel.
 * @param host - World whose reservation increases
 * @param delta - Population to hold
 * @returns Whether the reservation fit
 */
export function reservePopulation(host: EconomyHost, delta: number): boolean {
  const amount = Math.max(0, delta);
  if (!canAffordPop(host, amount)) return false;
  host.economy.popReserved += amount;
  return true;
}

/**
 * Returns population held for a channel that failed.
 * @param host - World whose reservation decreases
 * @param delta - Population to release
 */
export function releasePopulation(host: EconomyHost, delta: number): void {
  const amount = Math.max(0, delta);
  host.economy.popReserved = Math.max(0, host.economy.popReserved - amount);
}

/**
 * @param host - World to read
 * @returns A copy of every building, including construction and bonus flags
 */
export function listBuildings(host: EconomyHost): EconomyBuildingView[] {
  return host.buildings.map((building) => {
    const record = asBuilding(building);
    const progress =
      record.buildTicks === 0 ? 1 : record.buildTicksDone / record.buildTicks;
    return {
      bonuses: {
        adjacency: record.bonuses.adjacency.map((flag) => ({ ...flag })),
        vein: record.bonuses.vein ? { ...record.bonuses.vein } : null,
      },
      brew: record.brew ? { ...record.brew } : null,
      buildingType: record.buildingType,
      completed: record.completed,
      constructing: record.constructing,
      constructionProgress: Math.min(1, progress),
      hp: record.hp,
      id: record.id,
      maxHp: record.maxHp,
      onSpiritVein: record.onSpiritVein,
      placeholder: record.placeholder,
      production: record.production ? { ...record.production } : null,
      tier: record.tier,
      x: record.x,
      y: record.y,
    };
  });
}

/**
 * @param host - World to read
 * @param buildingId - Building to test
 * @returns Whether that building stands on a Spirit Vein
 */
export function isOnSpiritVein(host: EconomyHost, buildingId: string): boolean {
  const building = host.buildings.find((entry) => entry.id === buildingId);
  if (!building) return false;
  return asBuilding(building).onSpiritVein;
}

/**
 * @param host - World to read
 * @returns Copies of the units, including carry, tasks, and fed modifiers
 */
export function listUnits(host: EconomyHost): EconomyUnit[] {
  return host.units.filter(isEconomyUnit).map((unit) => structuredClone(unit));
}

/**
 * @param host - World to read
 * @returns Copies of the surface nodes
 */
export function listNodes(host: EconomyHost): ResourceNode[] {
  return host.economy.nodes.map((node) => ({ ...node }));
}

/**
 * @param host - World to read
 * @returns Copies of the Spirit Veins
 */
export function listVeins(host: EconomyHost): SpiritVein[] {
  return host.economy.veins.map((vein) => ({ ...vein }));
}

/**
 * @param host - World to read
 * @returns The current hold tier
 */
export function getHoldTier(host: EconomyHost): HoldTier {
  return host.economy.tier;
}

/**
 * @param host - World to read
 * @param itemId - Pill or coin-sink item
 * @returns How many of that item are stored
 */
export function getItemCount(host: EconomyHost, itemId: string): number {
  return host.economy.items[itemId] ?? 0;
}

/**
 * Removes one stored item.
 * @param host - World whose items change
 * @param itemId - Item to consume
 * @returns Whether one item was removed
 */
export function consumeItem(host: EconomyHost, itemId: string): boolean {
  const count = getItemCount(host, itemId);
  if (count < 1) return false;
  host.economy.items[itemId] = count - 1;
  return true;
}

/**
 * Adds stored items, such as a brewed pill.
 * @param host - World whose items change
 * @param itemId - Item to add
 * @param count - How many to add
 */
export function addItem(
  host: EconomyHost,
  itemId: string,
  count: number,
): void {
  const amount = Math.max(0, count);
  host.economy.items[itemId] = getItemCount(host, itemId) + amount;
}

/** Fed buff a unit currently carries. Zero when it is not fed. */
export interface FedBonuses {
  healthBonus: number;
  regenBonus: number;
}

/**
 * Reads the Mess Hall buff so combat can scale max health and regeneration.
 * Expired buffs are removed by the economy step, so presence means active.
 * @param unit - Any sim unit; non-economy units are never fed
 * @returns Fractional health and regen bonuses (0.1 means +10%), or zeros
 */
export function fedBonuses(unit: UnitState): FedBonuses {
  if (!isEconomyUnit(unit)) return { healthBonus: 0, regenBonus: 0 };
  const fed = unit.modifiers.find((modifier) => modifier.id === "fed");
  if (!fed) return { healthBonus: 0, regenBonus: 0 };
  return { healthBonus: fed.healthBonus, regenBonus: fed.regenBonus };
}
