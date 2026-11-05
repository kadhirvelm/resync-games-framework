/** Timed building production for renewable Ashen Gate resources. */

import { growCrop } from "./harvest";
import type { EconomyBuilding, EconomyHost, ProductionJob } from "./model";
import { asBuilding } from "./records";
import { addDeposit, trySpend } from "./stockpile";
import { type BuildingProductionDef, buildingDef } from "./tables";
import { activeWorkers } from "./villagers";

/**
 * Starts affordable production cycles and advances running ones. Inputs are
 * paid when a cycle starts; outputs arrive only after its full grow time.
 * A building that takes workers only starts or advances while a villager
 * works it, and each worker beside it adds one step of progress. A harvested
 * producer grows on its own and waits ripe for a villager (`takeHarvest`).
 * @param host - World whose buildings and stockpile advance
 */
export function stepProduction(host: EconomyHost): void {
  for (const building of host.buildings) {
    const record = asBuilding(building);
    const production = buildingDef(record.buildingType)?.production;
    if (!record.completed || production === null || production === undefined) {
      continue;
    }
    record.production = normalizeProductionJob(record.production);
    if (production.harvest) {
      growCrop(record, production, () => trySpend(host, production.input));
      continue;
    }
    const progress = progressThisStep(host, record, production);
    if (progress === 0) continue;
    if (record.production === null) {
      if (!trySpend(host, production.input)) continue;
      record.production = { progress: 0 };
    }
    record.production.progress += progress;
    if (record.production.progress < production.everyTicks) continue;
    addDeposit(host.resources, production.output);
    record.production = null;
  }
}

/**
 * @param host - World of villagers
 * @param building - Finished producer
 * @param production - Its production row
 * @returns Progress it gains this step: 1 when it runs on its own, otherwise
 *   one per active worker
 */
function progressThisStep(
  host: EconomyHost,
  building: EconomyBuilding,
  production: BuildingProductionDef,
): number {
  if (production.workers === null) return 1;
  return activeWorkers(host, building);
}

/**
 * Repairs older saves that predate building production or contain bad progress.
 * @param value - Saved production field
 * @returns A safe running job, or null for an idle producer
 */
function normalizeProductionJob(value: unknown): ProductionJob | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return null;
  const progress = (value as Partial<ProductionJob>).progress;
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  return { progress: Math.max(0, progress) };
}
