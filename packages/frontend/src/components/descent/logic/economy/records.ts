/**
 * Constructors and lookups for the records stored on the sim world.
 */

import {
  worldTerrainHills,
  worldTerrainObstacles,
  worldVentVolumes,
} from "../layers/hazards";
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
  HoldUpgrade,
  ResourceNode,
  SpiritVein,
  UnitInit,
} from "./model";
import { emptyStockpile } from "./stockpile";
import { buildingDef, holdTierDef } from "./tables";

const HOLD_TIERS: readonly HoldTier[] = [
  "Camp",
  "Outpost",
  "Stronghold",
  "Citadel",
];

/** Meta objects already checked, so per-call hosts skip the deep scan. */
const NORMALIZED = new WeakSet<object>();

/**
 * Creates the empty economy bag stored on a new world.
 * @returns Meta with Camp tier, no nodes, and no works
 */
export function createEconomyMeta(): EconomyMeta {
  return {
    explorationClaims: [],
    items: {},
    mercenarySerial: 0,
    nodes: [],
    ownerTiers: {},
    ownerUpgrades: {},
    pendingTraining: [],
    playerCount: 1,
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
    // Older co-op saves predate the explicit per-player allowance.
    if (current.playerCount === undefined) {
      current.playerCount = legacyPlayerCount(world);
    }
    cancelLegacyCoopUpgrade(world, current);
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
 * Cancels the ambiguous shared timer written by pre-owner-scoped co-op saves.
 * Its cost returns to the shared stockpile because the initiating owner cannot
 * be recovered; new co-op timers always live in `ownerUpgrades` instead.
 * @param world - Saved world with owned co-op Camps and a resource stockpile
 * @param bag - Economy save being normalized
 */
function cancelLegacyCoopUpgrade(
  world: SimWorldState,
  bag: Record<string, unknown>,
): void {
  if (!isUpgrade(bag.upgrade)) return;
  const coop = (world.buildings ?? []).some(
    (building) =>
      building.buildingType === "camp" && building.ownerId !== undefined,
  );
  if (!coop) return;
  const definition = holdTierDef(bag.upgrade.target);
  if (definition !== undefined) {
    for (const resourceId of RESOURCE_IDS) {
      world.resources[resourceId] += definition.upgradeCost[resourceId] ?? 0;
    }
  }
  bag.upgrade = null;
}

/**
 * Recovers the original allied allowance, including eliminated owners.
 * @param world - Legacy save without an explicit economy player count
 * @returns Roster size, falling back to surviving Hold ownership or solo
 */
function legacyPlayerCount(world: SimWorldState): number {
  const slice = world.meta.ashenGateSlice;
  if (isPlainObject(slice) && isPlainObject(slice.players)) {
    return Math.max(1, Object.keys(slice.players).length);
  }
  const owners = [...(world.units ?? []), ...(world.buildings ?? [])]
    .filter(
      (record) => !("factionId" in record) || record.factionId !== "horde",
    )
    .map((record) => record.ownerId)
    .filter((ownerId) => ownerId !== undefined);
  return Math.max(1, new Set(owners).size);
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
  bag.explorationClaims = arrayOf(
    bag.explorationClaims,
    (entry): entry is EconomyMeta["explorationClaims"][number] => {
      if (!isPlainObject(entry)) return false;
      if (
        typeof entry.campId !== "string" ||
        typeof entry.dropOffId !== "string"
      ) {
        return false;
      }
      const hasDeliveryDetails =
        entry.nodeId !== undefined ||
        entry.resourceId !== undefined ||
        entry.amount !== undefined;
      if (!hasDeliveryDetails) return true;
      return (
        typeof entry.nodeId === "string" &&
        RESOURCE_IDS.includes(entry.resourceId as ResourceId) &&
        isFiniteNumber(entry.amount) &&
        entry.amount > 0
      );
    },
  );
  bag.nodes = arrayOf(bag.nodes, isResourceNode);
  bag.veins = arrayOf(bag.veins, isSpiritVein);
  bag.works = arrayOf(bag.works, isDeepWork);
  bag.items = numericRecord(bag.items);
  bag.pendingTraining = arrayOf(
    bag.pendingTraining,
    (entry): entry is ClassId => typeof entry === "string",
  );
  bag.playerCount = Math.max(1, Math.floor(nonNegative(bag.playerCount)));
  bag.popReserved = nonNegative(bag.popReserved);
  bag.mercenarySerial = Math.floor(nonNegative(bag.mercenarySerial));
  bag.rejection = typeof bag.rejection === "string" ? bag.rejection : null;
  bag.upgrade = isUpgrade(bag.upgrade) ? bag.upgrade : null;
  bag.ownerTiers = holdTierRecord(bag.ownerTiers);
  bag.ownerUpgrades = upgradeRecord(bag.ownerUpgrades);
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
    getTerrainHills: () => worldTerrainHills(world),
    getTerrainObstacles: () => worldTerrainObstacles(world),
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
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
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
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.ownerId === undefined ? {} : { ownerId: input.ownerId }),
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
 * Repairs saved co-op tier overrides.
 * @param value - Saved owner-to-tier record candidate
 * @returns Only entries that name valid Hold tiers
 */
function holdTierRecord(value: unknown): Record<string, HoldTier> {
  const result: Record<string, HoldTier> = {};
  if (!isPlainObject(value)) return result;
  for (const [ownerId, tier] of Object.entries(value)) {
    if (isHoldTier(tier)) result[ownerId] = tier;
  }
  return result;
}

/**
 * Repairs saved co-op upgrade timers.
 * @param value - Saved owner-to-upgrade record candidate
 * @returns Only entries with complete, valid upgrade state
 */
function upgradeRecord(value: unknown): Record<string, HoldUpgrade> {
  const result: Record<string, HoldUpgrade> = {};
  if (!isPlainObject(value)) return result;
  for (const [ownerId, upgrade] of Object.entries(value)) {
    if (isUpgrade(upgrade)) result[ownerId] = upgrade;
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
function isUpgrade(value: unknown): value is HoldUpgrade {
  if (!isPlainObject(value)) return false;
  return (
    isFiniteNumber(value.startedTick) &&
    isFiniteNumber(value.ticksLeft) &&
    isHoldTier(value.target)
  );
}
