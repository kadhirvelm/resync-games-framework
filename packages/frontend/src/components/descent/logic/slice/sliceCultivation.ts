import { CultivationSystem } from "../cultivation/cultivationSystem";
import type {
  CultivationCombatPort,
  CultivationStockpilePort,
} from "../cultivation/ports";
import {
  type CultivationStatModifiers,
  cultivationStatModifiers,
} from "../cultivation/statModifiers";
import type { CultivationUnitState, HallTier } from "../cultivation/types";
import {
  addItem,
  canAffordPop,
  consumeItem,
  getHoldTier,
  getItemCount,
  getPopCap,
  getPopUsed,
  readStockpile,
  releasePopulation,
  reservePopulation,
} from "../economy/queries";
import { asBuilding, economyHost, isEconomyUnit } from "../economy/records";
import { canAfford, trySpend } from "../economy/stockpile";
import { LAYER_TABLE } from "../layers/layerTable";
import type { SimWorldState } from "../sim/world";
import type { RankTitle, RealmId } from "../types";
import { ECONOMY_STEP_TICKS, sliceState } from "./sliceState";

/** Realm id for each rank title, used by economy population weights. */
export const REALM_FOR_RANK: Record<RankTitle, RealmId> = {
  Ascended: "ascension",
  Ashborn: "qi_gathering",
  Champion: "nascent_soul",
  Sworn: "foundation",
  Veteran: "core_formation",
};

/**
 * Builds a cultivation system over the world's saved cultivation state.
 * Call `saveCultivation` after any mutation so the change is persisted.
 * @param world - Sim world
 * @returns A live system whose ports read and write this world
 */
export function openCultivation(world: SimWorldState): CultivationSystem {
  const system = new CultivationSystem(
    { maxRankForLayer: () => layerRankCap(world) },
    combatPort(world),
    stockpilePort(world),
  );
  system.restoreState(sliceState(world).cultivation);
  return system;
}

/**
 * Persists a system opened with `openCultivation`.
 * @param world - Sim world
 * @param system - System whose state should be saved
 */
export function saveCultivation(
  world: SimWorldState,
  system: CultivationSystem,
): void {
  sliceState(world).cultivation = system.exportState();
}

/**
 * Reads one unit's saved cultivation record without opening the system.
 * @param world - Sim world
 * @param unitId - Unit to look up
 * @returns The record, or undefined for villagers and the horde
 */
export function cultivationRecord(
  world: SimWorldState,
  unitId: string,
): CultivationUnitState | undefined {
  return sliceState(world).cultivation.units.find(
    (unit) => unit.unitId === unitId,
  );
}

/**
 * Stat multipliers for a unit, or neutral ones for uncultivated bodies.
 * @param record - Cultivation record, or undefined for villagers
 * @returns Damage, health, speed, and school-effect multipliers
 */
export function cultivationStats(
  record: CultivationUnitState | undefined,
): CultivationStatModifiers {
  if (!record) {
    return { damage: 1, maxHealth: 1, moveSpeed: 1, schoolEffect: 1 };
  }
  return cultivationStatModifiers(record);
}

/**
 * The current layer's realm cap.
 * @param world - Sim world
 * @returns Highest rank a unit may reach here
 */
export function layerRankCap(world: SimWorldState): RankTitle {
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === world.layerId);
  return layer?.realmCap ?? "Sworn";
}

/**
 * The current layer's multiplier for a school.
 * @param world - Sim world
 * @param school - School, or undefined before Sworn
 * @returns 1.25 favored, 0.85 hindered, 1 otherwise
 */
export function layerSchoolModifier(
  world: SimWorldState,
  school: CultivationUnitState["school"],
): number {
  if (school === undefined) return 1;
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === world.layerId);
  return layer?.schoolModifiers[school] ?? 1;
}

/**
 * The completed Cultivation Hall, if the Hold has one.
 * @param world - Sim world
 * @returns The hall record, or null
 */
export function completedHall(
  world: SimWorldState,
): ReturnType<typeof asBuilding> | null {
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (record.buildingType !== "cultivation_hall") continue;
    if (record.completed) return record;
  }
  return null;
}

/**
 * Cultivation's view of combat: life, Tribulation damage, and injuries.
 * @param world - Sim world
 * @returns A port backed by the world's unit records
 */
function combatPort(world: SimWorldState): CultivationCombatPort {
  const state = sliceState(world);
  /**
   * @param unitId - Unit to find
   * @returns The economy record, if the unit is alive on the field
   */
  const living = (unitId: string) => {
    const unit = world.units.find((entry) => entry.id === unitId);
    if (!unit || !isEconomyUnit(unit) || unit.hp <= 0) return null;
    return unit;
  };
  return {
    advanceTime(seconds) {
      for (const [unitId, left] of Object.entries(state.injuries)) {
        const next = left - seconds;
        if (next <= 0) delete state.injuries[unitId];
        else state.injuries[unitId] = next;
      }
    },
    applyDamage(unitId, amount) {
      const unit = living(unitId);
      if (!unit) return { alive: false, died: false };
      unit.hp = Math.max(0, unit.hp - Math.max(0, amount));
      return { alive: unit.hp > 0, died: unit.hp === 0 };
    },
    applyInjury(unitId, seconds) {
      state.injuries[unitId] = Math.max(state.injuries[unitId] ?? 0, seconds);
    },
    getInjurySeconds(unitId) {
      return state.injuries[unitId] ?? 0;
    },
    isAlive(unitId) {
      return living(unitId) !== null;
    },
    registerUnit() {
      // Bodies live on the world; registration needs no extra record.
    },
  };
}

/**
 * Cultivation's view of the economy: stockpile, pills, Hall, and population.
 * @param world - Sim world
 * @returns A port backed by the economy module's records
 */
function stockpilePort(world: SimWorldState): CultivationStockpilePort {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  return {
    addItem: (itemId, count = 1) => addItem(host, itemId, count),
    canAffordPop: (delta) => canAffordPop(host, delta),
    consumeItem: (itemId) => consumeItem(host, itemId),
    getHallTier: (): HallTier => getHoldTier(host),
    getItemCount: (itemId) => getItemCount(host, itemId),
    getPopulation: () => ({ cap: getPopCap(host), used: getPopUsed(host) }),
    getStockpile: () => readStockpile(host),
    hasResources: (cost) => canAfford(world.resources, cost),
    releasePopulation: (delta) => releasePopulation(host, delta),
    reservePopulation: (delta) => reservePopulation(host, delta),
    trySpend: (cost) => trySpend(host, cost),
  };
}
