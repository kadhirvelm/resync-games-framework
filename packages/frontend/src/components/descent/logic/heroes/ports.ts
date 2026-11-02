import type { ClassId, RealmId, ResourceId, SchoolId } from "../types";
import type { BigUnitStats, HoldTier, ResourceCost } from "./types";

/**
 * What this module needs to know about a building. Return `null` from
 * `getBuilding` once a building is destroyed.
 */
export interface HeroBuildingView {
  buildingType: string;
  id: string;
  tier: HoldTier;
}

/**
 * Economy seam (chunk 03). `getPopUsed` must NOT include heroes or the
 * Calamity; this module adds its own share through `popUsed()`.
 */
export interface HeroEconomyPort {
  getBuilding(buildingId: string): HeroBuildingView | null;
  getPopCap(): number;
  getPopUsed(): number;
  getStockpile(): Readonly<Record<ResourceId, number>>;
  listBuildings(): readonly HeroBuildingView[];
  trySpend(cost: ResourceCost): boolean;
}

/** Item seam. Boss cores are dropped by the waves/bosses chunk. */
export interface HeroInventoryPort {
  consumeItem(itemId: string, amount: number): boolean;
  countItem(itemId: string): number;
}

/** Cultivation seam (chunk 05). Stubbed in `stubs.ts` until it lands. */
export interface HeroCultivationPort {
  getRealm(unitId: string): RealmId;
  registerCultivator(
    unitId: string,
    profile: { schoolId: SchoolId | null; treasureSlots: number },
  ): void;
  setSchool(unitId: string, schoolId: SchoolId): void;
}

/** What to put on the field for a hero or Calamity. */
export interface BigUnitSpawn {
  buildingId: string;
  classId: Exclude<ClassId, "villager">;
  definitionId: string;
  kind: "hero" | "calamity";
  popCost: number;
  schoolId: SchoolId | null;
  stats: BigUnitStats;
}

/** Combat seam (chunk 04). Stubbed in `stubs.ts` until it lands. */
export interface HeroCombatPort {
  /** Applies raw damage; combat applies the counter multiplier. */
  applyDamage(sourceId: string, targetId: string, raw: number): void;
  /** Brings a fallen unit back at a building, keeping its id. */
  reviveUnit(unitId: string, buildingId: string): void;
  /** Creates the unit and returns its sim id. */
  spawnUnit(spawn: BigUnitSpawn): string;
}

/** Every seam the hero and Calamity module reads or writes through. */
export interface HeroCalamityPorts {
  combat: HeroCombatPort;
  cultivation: HeroCultivationPort;
  economy: HeroEconomyPort;
  inventory: HeroInventoryPort;
}
