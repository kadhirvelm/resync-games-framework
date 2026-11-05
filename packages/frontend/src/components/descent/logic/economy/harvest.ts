/**
 * Harvested producers, such as the Spirit Herb Garden. They grow on their own
 * once their inputs are paid, then wait ripe until a villager harvests them
 * and carries the crop to a drop-off.
 */

import type { CarryLoad, EconomyBuilding } from "./model";
import { type BuildingProductionDef, buildingDef } from "./tables";

/** Most villagers that can tend one harvested producer at once. */
export const HARVESTERS_PER_BUILDING = 1;

/**
 * @param buildingType - Building id
 * @returns Its production row when a villager must harvest it, otherwise null
 */
export function harvestDef(buildingType: string): BuildingProductionDef | null {
  const production = buildingDef(buildingType)?.production ?? null;
  if (production === null || !production.harvest) return null;
  return production;
}

/**
 * @param building - Any building
 * @returns How far its crop has grown, 0 to 1, or null when it is not a
 *   finished harvested producer
 */
export function growthFraction(building: EconomyBuilding): number | null {
  const production = harvestDef(building.buildingType);
  if (production === null || !building.completed) return null;
  const progress = building.production?.progress ?? 0;
  return Math.min(1, Math.max(0, progress / production.everyTicks));
}

/**
 * @param building - Any building
 * @returns Whether its crop is fully grown and waiting for a harvester
 */
export function isRipe(building: EconomyBuilding): boolean {
  return growthFraction(building) === 1;
}

/**
 * Grows a harvested producer by one economy step. It starts a crop by paying
 * its inputs, grows to full, then holds there until harvested.
 * @param building - Finished harvested producer
 * @param production - Its production row
 * @param payInputs - Pays the crop's inputs; false when they are short
 */
export function growCrop(
  building: EconomyBuilding,
  production: BuildingProductionDef,
  payInputs: () => boolean,
): void {
  if (building.production === null) {
    if (!payInputs()) return;
    building.production = { progress: 0 };
  }
  building.production.progress = Math.min(
    production.everyTicks,
    building.production.progress + 1,
  );
}

/**
 * Picks a ripe crop. The building is left empty so its next crop can start.
 * @param building - Harvested producer a villager stands beside
 * @returns The load to carry home, or null while the crop is still growing
 */
export function takeHarvest(building: EconomyBuilding): CarryLoad | null {
  const production = harvestDef(building.buildingType);
  if (production === null || !isRipe(building)) return null;
  const [entry] = Object.entries(production.output);
  if (entry === undefined) return null;
  const [resourceId, amount] = entry;
  building.production = null;
  return {
    amount: amount ?? 0,
    resourceId: resourceId as CarryLoad["resourceId"],
  };
}
