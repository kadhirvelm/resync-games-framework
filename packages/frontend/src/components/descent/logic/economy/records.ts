/**
 * Constructors and lookups for the records stored on the sim world.
 */

import { worldVentVolumes } from "../layers/hazards";
import type { SimWorldState } from "../sim/world";
import {
  type BuildingState,
  type ClassId,
  RESOURCE_IDS,
  type ResourceId,
  type UnitState,
} from "../types";
import type {
  BuildingInit,
  DeepWorkRuntime,
  EconomyBuilding,
  EconomyHost,
  EconomyMeta,
  EconomyUnit,
  HoldTier,
  ResourceNode,
  SpiritVein,
  UnitInit,
} from "./model";
import { emptyStockpile } from "./stockpile";
import { buildingDef } from "./tables";

const HOLD_TIERS: readonly HoldTier[] = ["Camp", "Stronghold", "Citadel"];

/** Meta objects already checked, so per-call hosts skip the deep scan. */
const NORMALIZED = new WeakSet<object>();

/**
 * Creates the empty economy bag stored on a new world.
 * @returns Meta with Camp tier, no nodes, and no works
 */
export function createEconomyMeta(): EconomyMeta {
  return {
    items: {},
    mercenarySerial: 0,
    nodes: [],
    pendingTraining: [],
    popReserved: 0,
    rejection: null,
    tier: "Camp",
    upgrade: null,
    veins: [],
    works: [],
  };
}

/**
 * Reads `world.meta.economy`. A new world gets an empty Camp. A saved bag is
 * repaired field by field: valid fields are kept, and missing or malformed
 * fields fall back to their defaults instead of wiping the whole Hold.
 * @param world - Sim world
 * @returns The economy bag stored on that world
 */
export function ensureEconomyMeta(world: SimWorldState): EconomyMeta {
  const current = world.meta.economy;
  if (isPlainObject(current)) {
    if (NORMALIZED.has(current)) return current as unknown as EconomyMeta;
    const repaired = normalizeEconomyMeta(current);
    NORMALIZED.add(repaired);
    return repaired;
  }
  const created = createEconomyMeta();
  NORMALIZED.add(created);
  world.meta.economy = created;
  return created;
}

/**
 * Repairs a saved economy bag in place so its identity survives.
 * @param bag - Saved object of unknown shape
 * @returns The same object, now shaped as `EconomyMeta`
 */
export function normalizeEconomyMeta(
  bag: Record<string, unknown>,
): EconomyMeta {
  const defaults = createEconomyMeta();
  bag.tier = isHoldTier(bag.tier) ? bag.tier : defaults.tier;
  bag.nodes = arrayOf(bag.nodes, isResourceNode);
  bag.veins = arrayOf(bag.veins, isSpiritVein);
  bag.works = arrayOf(bag.works, isDeepWork);
  bag.items = numericRecord(bag.items);
  bag.pendingTraining = arrayOf(
    bag.pendingTraining,
    (entry): entry is ClassId => typeof entry === "string",
  );
  bag.popReserved = nonNegative(bag.popReserved);
  bag.mercenarySerial = Math.floor(nonNegative(bag.mercenarySerial));
  bag.rejection = typeof bag.rejection === "string" ? bag.rejection : null;
  bag.upgrade = isUpgrade(bag.upgrade) ? bag.upgrade : null;
  return bag as unknown as EconomyMeta;
}

/**
 * Wraps a sim world so economy systems can read the live tick and layer.
 * @param world - Sim world
 * @param stepEveryTicks - Sim ticks per economy step; `tick()` counts steps
 * @returns A host whose collections are the world's own arrays
 */
export function economyHost(
  world: SimWorldState,
  stepEveryTicks = 1,
): EconomyHost {
  const economy = ensureEconomyMeta(world);
  const every = Math.max(1, Math.floor(stepEveryTicks));
  return {
    buildings: world.buildings,
    economy,
    getLayerId: () => world.layerId,
    getVentVolumes: () => worldVentVolumes(world),
    map: world.map,
    resources: world.resources,
    setLayerId(layerId) {
      world.layerId = layerId;
    },
    tick: () => Math.floor(world.tick / every),
    units: world.units,
  };
}

/**
 * @param building - Any building record
 * @returns The same object with economy fields
 */
export function asBuilding(building: BuildingState): EconomyBuilding {
  return building as EconomyBuilding;
}

/**
 * @param unit - Any unit record
 * @returns The same object with economy fields
 */
export function asUnit(unit: UnitState): EconomyUnit {
  return unit as EconomyUnit;
}

/**
 * Distinguishes Hold economy records from lightweight horde units that share
 * the sim's `world.units` collection.
 * @param unit - Any sim unit
 * @returns Whether economy-owned fields are present
 */
export function isEconomyUnit(unit: UnitState): unit is EconomyUnit {
  const candidate = unit as Partial<EconomyUnit>;
  return (
    typeof candidate.hp === "number" &&
    typeof candidate.maxHp === "number" &&
    Array.isArray(candidate.modifiers) &&
    typeof candidate.garrisoned === "boolean" &&
    typeof candidate.popKind === "string"
  );
}

/**
 * @param host - World to search
 * @param buildingId - Building id
 * @returns The building, or null when it is gone
 */
export function findBuilding(
  host: EconomyHost,
  buildingId: string,
): EconomyBuilding | null {
  const building = host.buildings.find((entry) => entry.id === buildingId);
  if (!building) return null;
  return asBuilding(building);
}

/**
 * @param host - World to search
 * @param buildingType - Building id from the table
 * @returns The first completed building of that type
 */
export function findCompletedByType(
  host: EconomyHost,
  buildingType: string,
): EconomyBuilding | null {
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (record.buildingType !== buildingType) continue;
    if (!record.completed) continue;
    return record;
  }
  return null;
}

/**
 * Builds a placed building. Completed buildings start at full health unless
 * `hp` is set.
 * @param input - Identity, cell, and whether construction is already finished
 * @returns The record to push onto the world
 */
export function createBuildingRecord(input: BuildingInit): EconomyBuilding {
  const def = buildingDef(input.buildingType);
  if (!def) {
    throw new Error(`Unknown Descent building: ${input.buildingType}`);
  }
  const completed = input.completed ?? false;
  const floorHp = Math.max(
    1,
    Math.floor(def.maxHp * def.constructionHpFraction),
  );
  return {
    bonuses: { adjacency: [], vein: null },
    brew: null,
    buildingType: def.id,
    buildTicks: def.buildTicks,
    buildTicksDone: completed ? def.buildTicks : 0,
    completed,
    constructing: !completed,
    hp: input.hp ?? (completed ? def.maxHp : floorHp),
    id: input.id,
    maxHp: def.maxHp,
    onSpiritVein: false,
    placeholder: def.placeholder,
    production: null,
    tier: def.tier,
    x: input.x,
    y: input.y,
  };
}

/**
 * Builds a unit. Omitted class and kind become a villager.
 * @param input - Identity, cell, and optional combat fields
 * @returns The record to push onto the world
 */
export function createUnitRecord(input: UnitInit): EconomyUnit {
  const classId = input.classId ?? "villager";
  const popKind =
    input.popKind ?? (classId === "villager" ? "villager" : "soldier");
  const maxHp = input.maxHp ?? (popKind === "villager" ? 40 : 100);
  return {
    carry: null,
    classId,
    garrisoned: false,
    hp: input.hp ?? maxHp,
    id: input.id,
    maxHp,
    modifiers: [],
    popKind,
    preferredNodeId: null,
    realmId: input.realmId ?? null,
    task: null,
    workplaceId: null,
    x: input.x,
    y: input.y,
  };
}

/**
 * @param current - Hold tier the player has reached
 * @param required - Minimum tier a building needs
 * @returns Whether the building may be placed
 */
export function tierAllows(current: HoldTier, required: HoldTier): boolean {
  return HOLD_TIERS.indexOf(current) >= HOLD_TIERS.indexOf(required);
}

/**
 * @param tier - Current hold tier
 * @returns The next tier, or null at Citadel
 */
export function nextHoldTier(tier: HoldTier): HoldTier | null {
  const rank = HOLD_TIERS.indexOf(tier);
  return HOLD_TIERS[rank + 1] ?? null;
}

/**
 * @param value - Any value
 * @returns Whether it is a non-array object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param value - Any value
 * @returns Whether it is a finite number
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * @param value - Saved number candidate
 * @returns The value when it is a finite non-negative number, otherwise 0
 */
function nonNegative(value: unknown): number {
  if (!isFiniteNumber(value) || value < 0) return 0;
  return value;
}

/**
 * @param value - Saved tier candidate
 * @returns Whether it names a hold tier
 */
function isHoldTier(value: unknown): value is HoldTier {
  return HOLD_TIERS.includes(value as HoldTier);
}

/**
 * @param value - Saved array candidate
 * @param accept - Element shape check
 * @returns The well-formed elements, or an empty array when `value` is not an array
 */
function arrayOf<T>(
  value: unknown,
  accept: (entry: unknown) => entry is T,
): T[] {
  if (!Array.isArray(value)) return [];
  return value.filter(accept);
}

/**
 * @param value - Saved item-count candidate
 * @returns A record with only its finite numeric entries
 */
function numericRecord(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!isPlainObject(value)) return result;
  for (const [key, amount] of Object.entries(value)) {
    if (!isFiniteNumber(amount)) continue;
    result[key] = amount;
  }
  return result;
}

/**
 * @param value - Saved node candidate
 * @returns Whether it has every surface-node field
 */
function isResourceNode(value: unknown): value is ResourceNode {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.nodeType === "string" &&
    isFiniteNumber(value.remaining) &&
    RESOURCE_IDS.includes(value.resourceId as ResourceId) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

/**
 * @param value - Saved vein candidate
 * @returns Whether it has an id and a cell
 */
function isSpiritVein(value: unknown): value is SpiritVein {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y)
  );
}

/**
 * Checks a deep work and fills a missing deposit with zeros.
 * @param value - Saved work candidate
 * @returns Whether it has every deep-work field
 */
function isDeepWork(value: unknown): value is DeepWorkRuntime {
  if (!isPlainObject(value)) return false;
  const valid =
    typeof value.buildingId === "string" &&
    typeof value.kind === "string" &&
    isFiniteNumber(value.depth) &&
    isFiniteNumber(value.cooldown) &&
    isFiniteNumber(value.digTicksLeft) &&
    typeof value.digging === "boolean" &&
    typeof value.raidImmune === "boolean" &&
    typeof value.shaftHead === "boolean";
  if (!valid) return false;
  value.deposit = { ...emptyStockpile(), ...numericRecord(value.deposit) };
  if (!isFiniteNumber(value.digStartedTick)) value.digStartedTick = null;
  return true;
}

/**
 * @param value - Saved upgrade candidate
 * @returns Whether it is a running tier upgrade
 */
function isUpgrade(value: unknown): value is EconomyMeta["upgrade"] {
  if (!isPlainObject(value)) return false;
  return (
    isFiniteNumber(value.startedTick) &&
    isFiniteNumber(value.ticksLeft) &&
    isHoldTier(value.target)
  );
}
