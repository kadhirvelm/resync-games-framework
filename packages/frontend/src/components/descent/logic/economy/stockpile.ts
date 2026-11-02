/**
 * Stockpile math. Spends are atomic: a short resource leaves every total
 * unchanged.
 */

import { RESOURCE_IDS, type ResourceStockpile } from "../types";
import type { EconomyHost } from "./model";

/**
 * @param stockpile - Current totals
 * @param cost - Amounts to remove. Missing keys count as zero.
 * @returns Whether every amount is a non-negative integer the stockpile covers
 */
export function canAfford(
  stockpile: ResourceStockpile,
  cost: Partial<ResourceStockpile>,
): boolean {
  for (const resourceId of RESOURCE_IDS) {
    const amount = cost[resourceId] ?? 0;
    if (!Number.isInteger(amount) || amount < 0) return false;
    if ((stockpile[resourceId] ?? 0) < amount) return false;
  }
  return true;
}

/**
 * Removes `cost` when it is affordable.
 * @param host - World whose stockpile changes
 * @param cost - Amounts to remove
 * @returns Whether the stockpile changed
 */
export function trySpend(
  host: EconomyHost,
  cost: Partial<ResourceStockpile>,
): boolean {
  if (!canAfford(host.resources, cost)) return false;
  for (const resourceId of RESOURCE_IDS) {
    const amount = cost[resourceId] ?? 0;
    host.resources[resourceId] = (host.resources[resourceId] ?? 0) - amount;
  }
  return true;
}

/**
 * @param stockpile - Totals to copy
 * @returns A new record the caller can edit without touching the sim
 */
export function copyStockpile(stockpile: ResourceStockpile): ResourceStockpile {
  const copy = {} as ResourceStockpile;
  for (const resourceId of RESOURCE_IDS) {
    copy[resourceId] = stockpile[resourceId] ?? 0;
  }
  return copy;
}

/**
 * @returns A stockpile with every resource at zero
 */
export function emptyStockpile(): ResourceStockpile {
  const stockpile = {} as ResourceStockpile;
  for (const resourceId of RESOURCE_IDS) stockpile[resourceId] = 0;
  return stockpile;
}

/**
 * Adds a deposit table onto a stockpile-shaped record.
 * @param target - Deposit that receives the resources
 * @param addition - Amounts to add. Missing keys add nothing.
 */
export function addDeposit(
  target: ResourceStockpile,
  addition: Partial<ResourceStockpile>,
): void {
  for (const resourceId of RESOURCE_IDS) {
    const amount = addition[resourceId] ?? 0;
    target[resourceId] = (target[resourceId] ?? 0) + amount;
  }
}
