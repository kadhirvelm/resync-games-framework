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
import { ECONOMY_STEP_TICKS, sliceState, waveState } from "./sliceState";

/** Minimum merit, essence, and combat proof for Ashborn -> Sworn epiphany. */
const SWORN_MERIT_THRESHOLD = 100;
const SWORN_ESSENCE_THRESHOLD = 50;
const SWORN_PROOF_THRESHOLD = 3;

/** Options when opening the cultivation system against a sim world. */
export interface OpenCultivationOptions {
  /**
   * Satisfies Cultivation Hall pill, material, and Hold-tier gates virtually
   * so a starting Captain can attempt a battlefield breakthrough to Sworn
   * before an Outpost + Cultivation Hall are built.
   */
  bypassHallMaterials?: boolean;
  /** Specific completed Hall whose Spirit Vein bonus should be used. */
  hallId?: string;
}

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
 * @param options - Optional port overrides for Captain battlefield breakthrough
 * @returns A live system whose ports read and write this world
 */
export function openCultivation(
  world: SimWorldState,
  options?: OpenCultivationOptions,
): CultivationSystem {
  const system = new CultivationSystem(
    { maxRankForLayer: () => layerRankCap(world) },
    combatPort(world),
    stockpilePort(
      world,
      options?.bypassHallMaterials === true,
      options?.hallId,
    ),
  );
  system.restoreState(sliceState(world).cultivation);
  return system;
}

/**
 * Reports whether a unit id belongs to a starting Captain cultivator
 * (solo `ashen-captain` or co-op `crucible-captain-*`).
 * @param unitId - Unit id to inspect
 * @returns Whether this unit is a starting Captain
 */
export function isStartingCaptain(unitId: string): boolean {
  return unitId === "ashen-captain" || unitId.startsWith("crucible-captain-");
}

/**
 * Reports whether the opening scout wave has spawned and been cleared.
 * @param world - Sim world
 * @returns Whether at least one wave has spawned and no horde bodies remain
 */
export function isOpeningWaveRepelled(world: SimWorldState): boolean {
  const waves = waveState(world);
  return waves.spawnedWaveIds.length >= 1 && waves.units.length === 0;
}

/**
 * Reports whether a unit qualifies for the early Captain battlefield
 * breakthrough to Sworn without a Cultivation Hall.
 * @param world - Sim world
 * @param unitId - Candidate unit id
 * @returns Whether this unit is an Ashborn starting Captain after the scout wave
 */
export function canUseCaptainBattlefieldBreakthrough(
  world: SimWorldState,
  unitId: string,
): boolean {
  if (!isStartingCaptain(unitId)) return false;
  const record = cultivationRecord(world, unitId);
  if (record?.rank !== "Ashborn") return false;
  return (
    sliceState(world).captainBreakthroughUnlocked === true ||
    isOpeningWaveRepelled(world)
  );
}

/**
 * Unlocks the starting Captain's battlefield breakthrough once the opening
 * scout wave is repelled, topping up living Ashborn Captains to the Sworn
 * merit, essence, and combat-proof thresholds so they can break through right
 * away.
 * @param world - Sim world
 * @returns Whether the unlock fired on this tick
 */
export function unlockCaptainBattlefieldBreakthrough(
  world: SimWorldState,
): boolean {
  const state = sliceState(world);
  if (state.captainBreakthroughUnlocked === true) return false;
  if (!isOpeningWaveRepelled(world)) return false;
  state.captainBreakthroughUnlocked = true;
  const cultivation = openCultivation(world);
  let grantedAny = false;
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    if (!isStartingCaptain(unit.id) || !cultivation.hasUnit(unit.id)) continue;
    const record = cultivation.getUnitState(unit.id);
    if (record.rank !== "Ashborn") continue;
    if (record.merit < SWORN_MERIT_THRESHOLD) {
      cultivation.awardMerit(unit.id, SWORN_MERIT_THRESHOLD - record.merit);
    }
    if (record.essence < SWORN_ESSENCE_THRESHOLD) {
      cultivation.awardEssence(
        unit.id,
        SWORN_ESSENCE_THRESHOLD - record.essence,
      );
    }
    if (record.combatProof < SWORN_PROOF_THRESHOLD) {
      cultivation.recordCombatProof(
        unit.id,
        SWORN_PROOF_THRESHOLD - record.combatProof,
      );
    }
    grantedAny = true;
  }
  if (grantedAny) {
    saveCultivation(world, cultivation);
  }
  return grantedAny;
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

/** Precomputed lookup of completed Cultivation Halls, globally and per owner. */
export interface CompletedHallIndex {
  anyHall: ReturnType<typeof asBuilding> | null;
  byOwner: Map<string, ReturnType<typeof asBuilding>>;
}

/**
 * Indexes completed Cultivation Halls once per tick so callers can resolve a
 * player's Hall in O(1) instead of scanning `world.buildings` per soldier.
 * @param world - Sim world
 * @returns Lookup matching `completedHall(world, ownerId)` semantics
 */
export function indexCompletedHalls(world: SimWorldState): CompletedHallIndex {
  let anyHall: ReturnType<typeof asBuilding> | null = null;
  const byOwner = new Map<string, ReturnType<typeof asBuilding>>();
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (record.buildingType !== "cultivation_hall" || !record.completed) {
      continue;
    }
    if (anyHall === null) anyHall = record;
    if (record.ownerId !== undefined && !byOwner.has(record.ownerId)) {
      byOwner.set(record.ownerId, record);
    }
  }
  return { anyHall, byOwner };
}

/**
 * Resolves a completed Cultivation Hall from a precomputed index.
 * @param index - Precomputed hall index
 * @param ownerId - Multiplayer owner to match, or undefined for the whole Hold
 * @returns The first matching completed Hall, or null
 */
export function resolveCompletedHall(
  index: CompletedHallIndex,
  ownerId?: string,
): ReturnType<typeof asBuilding> | null {
  if (ownerId === undefined) return index.anyHall;
  return index.byOwner.get(ownerId) ?? null;
}

/**
 * The completed Cultivation Hall, optionally restricted to one player and id.
 * @param world - Sim world
 * @param ownerId - Multiplayer owner to match; omitted for the whole Hold
 * @param hallId - Specific Hall to use; omitted for the first completed Hall
 * @returns The hall record, or null
 */
export function completedHall(
  world: SimWorldState,
  ownerId?: string,
  hallId?: string,
): ReturnType<typeof asBuilding> | null {
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (record.buildingType !== "cultivation_hall") continue;
    if (hallId !== undefined && record.id !== hallId) continue;
    if (ownerId !== undefined && record.ownerId !== ownerId) continue;
    if (record.completed) return record;
  }
  return null;
}

/**
 * Resolves the Hall that grants a Spirit Vein breakthrough bonus for a unit.
 * @param targetHall - Specific Hall selected by id, if `hallId` was provided
 * @param hallId - Specific Hall id filter, if any
 * @param halls - Lazily built hall index when no specific `hallId` is set
 * @param ownerId - Unit owner id
 * @returns Matching completed Hall, or null
 */
function resolveBonusHall(
  targetHall: ReturnType<typeof asBuilding> | null,
  hallId: string | undefined,
  halls: CompletedHallIndex | undefined,
  ownerId: string | undefined,
): ReturnType<typeof asBuilding> | null {
  if (hallId !== undefined) {
    if (targetHall === null) return null;
    if (ownerId !== undefined && targetHall.ownerId !== ownerId) return null;
    return targetHall;
  }
  if (halls === undefined) return null;
  return resolveCompletedHall(halls, ownerId);
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
 * @param bypassHallMaterials - When true, satisfies pill, material, and Hold-tier gates virtually
 * @param hallId - Specific Hall selected for the attempt, if any
 * @returns A port backed by the economy module's records
 */
function stockpilePort(
  world: SimWorldState,
  bypassHallMaterials: boolean,
  hallId?: string,
): CultivationStockpilePort {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const targetHall =
    hallId !== undefined ? completedHall(world, undefined, hallId) : null;
  const hallOwnerId =
    hallId !== undefined ? targetHall?.ownerId : completedHall(world)?.ownerId;
  let unitById: Map<string, SimWorldState["units"][number]> | undefined;
  let halls: CompletedHallIndex | undefined;
  return {
    addItem: (itemId, count = 1) => addItem(host, itemId, count),
    canAffordPop: (delta) => canAffordPop(host, delta),
    consumeItem: (itemId) => {
      if (bypassHallMaterials && itemId === "breakthrough_pill") return true;
      return consumeItem(host, itemId);
    },
    getBreakthroughSuccessBonus: (unitId) => {
      if (unitById === undefined) {
        unitById = new Map(world.units.map((entry) => [entry.id, entry]));
      }
      const unit = unitById.get(unitId);
      if (!unit || !isEconomyUnit(unit)) return 0;
      if (hallId === undefined && halls === undefined) {
        halls = indexCompletedHalls(world);
      }
      const bonus = resolveBonusHall(targetHall, hallId, halls, unit.ownerId)
        ?.bonuses.vein;
      if (bonus?.id !== "breakthrough_success") return 0;
      return Math.max(0, bonus.amount);
    },
    getHallTier: (): HallTier =>
      bypassHallMaterials ? "Outpost" : getHoldTier(host, hallOwnerId),
    getItemCount: (itemId) => {
      if (bypassHallMaterials && itemId === "breakthrough_pill") {
        return Math.max(1, getItemCount(host, itemId));
      }
      return getItemCount(host, itemId);
    },
    getPopulation: () => ({ cap: getPopCap(host), used: getPopUsed(host) }),
    getStockpile: () => readStockpile(host),
    hasResources: (cost) =>
      bypassHallMaterials ? true : canAfford(world.resources, cost),
    releasePopulation: (delta) => releasePopulation(host, delta),
    reservePopulation: (delta) => reservePopulation(host, delta),
    trySpend: (cost) => (bypassHallMaterials ? true : trySpend(host, cost)),
  };
}
