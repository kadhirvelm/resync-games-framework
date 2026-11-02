/**
 * Loads the economy JSON tables. Missing canon ids throw at import so a bad
 * table fails before the first tick.
 */

import rawBuildings from "../../data/buildings.json";
import rawDeepWorks from "../../data/deep_works.json";
import rawMarket from "../../data/market_rates.json";
import rawPills from "../../data/pill_recipes.json";
import rawResources from "../../data/resources.json";
import {
  type ClassId,
  RESOURCE_IDS,
  type ResourceId,
  type ResourceStockpile,
  type SchoolId,
} from "../types";
import type { HoldTier } from "./model";

/** One map node family for a harvested resource. */
export interface NodeTypeDef {
  id: string;
  minDistanceFromCamp: number;
  richness: "near" | "mid" | "far";
}

/** How a resource is carried and which nodes produce it. */
export interface ResourceDef {
  carryAmount: number;
  gatherTicks: number;
  id: ResourceId;
  name: string;
  nodes: NodeTypeDef[];
  slang: string;
}

/** A bonus granted by a neighbor building or a neighboring node. */
export interface AdjacencyRule {
  bonus: { amount: number; id: string };
  partnerBuilding?: string;
  partnerNodeType?: string;
}

/**
 * Mess Hall conversion. One portion of `food` and `water` feeds
 * `unitsPerRation` units for `windowTicks` economy steps. Unfed units are
 * never penalized.
 */
export interface RationDef {
  food: number;
  healthBonus: number;
  regenBonus: number;
  unitsPerRation: number;
  water: number;
  windowTicks: number;
}

/** One placeable building. */
export interface BuildingDef {
  adjacency: AdjacencyRule[];
  auraRadius: number | null;
  blocksAlly: boolean;
  blocksHorde: boolean;
  buildTicks: number;
  constructionHpFraction: number;
  cost: Partial<ResourceStockpile>;
  dropOff: boolean;
  flavor: string;
  id: string;
  job: string;
  maxHp: number;
  name: string;
  overlapBonus: { amount: number; id: string } | null;
  placeholder: boolean;
  popBonus: number;
  ration: RationDef | null;
  respawn: boolean;
  tier: HoldTier;
  veinBonus: { amount: number; id: string } | null;
  veinBonusAtCitadel: { amount: number; id: string } | null;
  volatileDamage: number;
}

/** Cost and timer to enter a hold tier. Camp's cost is unused. */
export interface HoldTierDef {
  id: HoldTier;
  upgradeCost: Partial<ResourceStockpile>;
  upgradeTicks: number;
}

/** One depth of a deep work. Yield is taken from the deposit, not the surface. */
export interface DepthDef {
  deposit: Partial<ResourceStockpile>;
  digCost: Partial<ResourceStockpile>;
  digTicks: number;
  level: number;
  yield: Partial<ResourceStockpile>;
  yieldEveryTicks: number;
}

/** Root Cellar, Deep Mine, or the stretch Essence Borehole. */
export interface DeepWorkDef {
  buildingId: string | null;
  depths: DepthDef[];
  id: string;
  implemented: boolean;
  raidImmune: boolean;
  shaftHead: boolean;
  stretch: boolean;
}

/** Buy prices are worse than sell prices. Coin is the medium, not a row. */
export interface MarketLayerDef {
  buy: Partial<Record<ResourceId, number>>;
  id: string;
  name: string;
  sell: Partial<Record<ResourceId, number>>;
}

/** A coin purchase that is not a Calamity. */
export interface CoinSinkDef {
  amount?: number;
  coin: number;
  grants: string;
  id: string;
}

/** Ingredients and brew time for one pill. Feeding effects live elsewhere. */
export interface PillRecipeDef {
  brewTicks: number;
  id: string;
  ingredients: Partial<ResourceStockpile>;
  name: string;
  school?: SchoolId;
}

interface RawBuilding extends Partial<BuildingDef> {
  buildTicks: number;
  cost: Partial<ResourceStockpile>;
  id: string;
  job: string;
  maxHp: number;
  name: string;
  tier: HoldTier;
}

const HOLD_TIERS: readonly HoldTier[] = ["Camp", "Stronghold", "Citadel"];

const resourceFile = asRecord(rawResources, "resources.json");
const buildingFile = asRecord(rawBuildings, "buildings.json");
const deepFile = asRecord(rawDeepWorks, "deep_works.json");
const marketFile = asRecord(rawMarket, "market_rates.json");
const pillFile = asRecord(rawPills, "pill_recipes.json");

const RESOURCES: readonly ResourceDef[] = readResources(resourceFile);
const BUILDINGS: readonly BuildingDef[] = readBuildings(buildingFile);
const HOLD_TIER_DEFS: readonly HoldTierDef[] = readHoldTiers(buildingFile);
const DEEP_WORKS: readonly DeepWorkDef[] = readDeepWorks(deepFile);
const MARKET_LAYERS: readonly MarketLayerDef[] = readMarketLayers(marketFile);
const COIN_SINKS: readonly CoinSinkDef[] = readCoinSinks(marketFile);
const PILL_RECIPES: readonly PillRecipeDef[] = readRecipes(pillFile);

const BASE_POP_CAP = readNumber(buildingFile.basePopCap, "basePopCap");
const REPAIR_HP = readNumber(buildingFile.repairHpPerTick, "repairHpPerTick");
const WORKER_BONUS = readNumber(
  buildingFile.workerBuildBonus,
  "workerBuildBonus",
);
const TRAINING = readTraining(buildingFile.trainingCosts);

/**
 * @returns The eight harvested resources in canon order
 */
export function listResources(): readonly ResourceDef[] {
  return RESOURCES;
}

/**
 * @param resourceId - Harvested resource id
 * @returns That resource's carry and node table, if the id is known
 */
export function resourceDef(resourceId: ResourceId): ResourceDef | undefined {
  return RESOURCES.find((resource) => resource.id === resourceId);
}

/**
 * @param buildingType - Building id from `buildings.json`
 * @returns The building table row, if the id is known
 */
export function buildingDef(buildingType: string): BuildingDef | undefined {
  return BUILDINGS.find((building) => building.id === buildingType);
}

/**
 * @returns Every placeable building
 */
export function listBuildingDefs(): readonly BuildingDef[] {
  return BUILDINGS;
}

/**
 * @param tier - Hold tier being entered
 * @returns Its upgrade cost and timer
 */
export function holdTierDef(tier: HoldTier): HoldTierDef | undefined {
  return HOLD_TIER_DEFS.find((entry) => entry.id === tier);
}

/**
 * @returns Population cap before housing
 */
export function basePopCap(): number {
  return BASE_POP_CAP;
}

/**
 * @returns Hit points a villager restores per economy step while repairing
 */
export function repairHpPerTick(): number {
  return REPAIR_HP;
}

/**
 * @returns Construction progress each adjacent builder adds per economy step
 */
export function workerBuildBonus(): number {
  return WORKER_BONUS;
}

/**
 * @param classId - Class being trained
 * @returns Food and water for one trainee, if the class is known
 */
export function trainingCost(
  classId: ClassId,
): Partial<ResourceStockpile> | undefined {
  return TRAINING[classId];
}

/**
 * @param workId - Deep work id
 * @returns The work, including the unimplemented borehole
 */
export function deepWorkDef(workId: string): DeepWorkDef | undefined {
  return DEEP_WORKS.find((work) => work.id === workId);
}

/**
 * @param buildingType - Building that digs
 * @returns The implemented work for that building
 */
export function deepWorkForBuilding(
  buildingType: string,
): DeepWorkDef | undefined {
  return DEEP_WORKS.find(
    (work) => work.implemented && work.buildingId === buildingType,
  );
}

/**
 * @returns Every deep work, including the stretch borehole
 */
export function listDeepWorkDefs(): readonly DeepWorkDef[] {
  return DEEP_WORKS;
}

/**
 * @param layerId - Current layer, or null
 * @returns That layer's prices, or Ashen Gate when the id is unknown
 */
export function marketRates(layerId: string | null): MarketLayerDef {
  const found = MARKET_LAYERS.find((layer) => layer.id === layerId);
  if (found) return found;
  const fallback = MARKET_LAYERS.find((layer) => layer.id === "ashen_gate");
  if (!fallback) {
    throw new Error("market_rates.json is missing ashen_gate");
  }
  return fallback;
}

/**
 * @returns One price table per shipped layer
 */
export function listMarketLayers(): readonly MarketLayerDef[] {
  return MARKET_LAYERS;
}

/**
 * @param sinkId - Coin sink id
 * @returns The sink, or undefined for unknown and Calamity ids
 */
export function coinSinkDef(sinkId: string): CoinSinkDef | undefined {
  if (sinkId === "calamity") return undefined;
  const sink = COIN_SINKS.find((entry) => entry.id === sinkId);
  if (!sink || sink.grants === "calamity") return undefined;
  return sink;
}

/**
 * @returns Every coin sink except Calamity, which economy never sells
 */
export function listCoinSinks(): readonly CoinSinkDef[] {
  return COIN_SINKS;
}

/**
 * @param pillId - Pill id shared with cultivation
 * @returns The recipe, if economy knows how to brew it
 */
export function pillRecipe(pillId: string): PillRecipeDef | undefined {
  return PILL_RECIPES.find((recipe) => recipe.id === pillId);
}

/**
 * @returns Every brew recipe
 */
export function listPillRecipes(): readonly PillRecipeDef[] {
  return PILL_RECIPES;
}

/**
 * @param value - Imported JSON
 * @param label - File name used in the error
 * @returns The same value as a record
 */
function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Descent economy data ${label} is unreadable`);
  }
  return value as Record<string, unknown>;
}

/**
 * @param value - JSON number
 * @param label - Field name used in the error
 * @returns The number when it is finite
 */
function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Descent economy data is missing ${label}`);
  }
  return value;
}

/**
 * @param file - `resources.json`
 * @returns The eight resource rows
 */
function readResources(file: Record<string, unknown>): ResourceDef[] {
  const rows = file.resources;
  if (!Array.isArray(rows)) {
    throw new Error("resources.json is missing resources");
  }
  const resources = rows.map((row) => row as ResourceDef);
  for (const resourceId of RESOURCE_IDS) {
    if (!resources.some((resource) => resource.id === resourceId)) {
      throw new Error(`resources.json is missing ${resourceId}`);
    }
  }
  return resources;
}

/**
 * @param file - `buildings.json`
 * @returns Placeable buildings with defaults filled in
 */
function readBuildings(file: Record<string, unknown>): BuildingDef[] {
  const rows = file.buildings;
  if (!Array.isArray(rows)) {
    throw new Error("buildings.json is missing buildings");
  }
  return rows.map((row) => normalizeBuilding(row as RawBuilding));
}

/**
 * @param raw - One building object
 * @returns A building definition with defaults for omitted fields
 */
function normalizeBuilding(raw: RawBuilding): BuildingDef {
  return {
    adjacency: raw.adjacency ?? [],
    auraRadius: raw.auraRadius ?? null,
    blocksAlly: raw.blocksAlly ?? true,
    blocksHorde: raw.blocksHorde ?? false,
    buildTicks: raw.buildTicks,
    constructionHpFraction: raw.constructionHpFraction ?? 0.25,
    cost: raw.cost,
    dropOff: raw.dropOff ?? false,
    flavor: raw.flavor ?? "",
    id: raw.id,
    job: raw.job,
    maxHp: raw.maxHp,
    name: raw.name,
    overlapBonus: raw.overlapBonus ?? null,
    placeholder: raw.placeholder ?? false,
    popBonus: raw.popBonus ?? 0,
    ration: raw.ration ? normalizeRation(raw.ration) : null,
    respawn: raw.respawn ?? false,
    tier: raw.tier,
    veinBonus: raw.veinBonus ?? null,
    veinBonusAtCitadel: raw.veinBonusAtCitadel ?? null,
    volatileDamage: raw.volatileDamage ?? 0,
  };
}

/**
 * @param raw - Ration row from `buildings.json`
 * @returns The ration with `unitsPerRation` defaulting to 5
 */
function normalizeRation(raw: Partial<RationDef>): RationDef {
  return {
    food: raw.food ?? 0,
    healthBonus: raw.healthBonus ?? 0,
    regenBonus: raw.regenBonus ?? 0,
    unitsPerRation: raw.unitsPerRation ?? 5,
    water: raw.water ?? 0,
    windowTicks: raw.windowTicks ?? 0,
  };
}

/**
 * @param file - `buildings.json`
 * @returns Camp, Stronghold, and Citadel in ladder order
 */
function readHoldTiers(file: Record<string, unknown>): HoldTierDef[] {
  const rows = file.holdTiers;
  if (!Array.isArray(rows) || rows.length !== HOLD_TIERS.length) {
    throw new Error(
      "buildings.json hold tiers must be Camp, Stronghold, Citadel",
    );
  }
  return rows as HoldTierDef[];
}

/**
 * @param file - `deep_works.json`
 * @returns Deep work rows
 */
function readDeepWorks(file: Record<string, unknown>): DeepWorkDef[] {
  const rows = file.works;
  if (!Array.isArray(rows)) throw new Error("deep_works.json is missing works");
  return rows as DeepWorkDef[];
}

/**
 * @param file - `market_rates.json`
 * @returns Per-layer prices
 */
function readMarketLayers(file: Record<string, unknown>): MarketLayerDef[] {
  const rows = file.layers;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("market_rates.json is missing layers");
  }
  return rows as MarketLayerDef[];
}

/**
 * @param file - `market_rates.json`
 * @returns Coin sinks, excluding any Calamity row
 */
function readCoinSinks(file: Record<string, unknown>): CoinSinkDef[] {
  const rows = file.coinSinks;
  if (!Array.isArray(rows)) return [];
  return (rows as CoinSinkDef[]).filter((sink) => sink.grants !== "calamity");
}

/**
 * @param file - `pill_recipes.json`
 * @returns Brew recipes
 */
function readRecipes(file: Record<string, unknown>): PillRecipeDef[] {
  const rows = file.recipes;
  if (!Array.isArray(rows))
    throw new Error("pill_recipes.json is missing recipes");
  return rows as PillRecipeDef[];
}

/**
 * @param value - `trainingCosts` object
 * @returns A cost for every class
 */
function readTraining(
  value: unknown,
): Record<ClassId, Partial<ResourceStockpile>> {
  if (!value || typeof value !== "object") {
    throw new Error("buildings.json is missing trainingCosts");
  }
  return value as Record<ClassId, Partial<ResourceStockpile>>;
}
