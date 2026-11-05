/**
 * Economy shapes. Shared ids and the minimal unit/building records come from
 * `logic/types.ts`. Extra fields live on those records so the sim can save
 * them with the world.
 */

import type { CircleVolume } from "../layers/layerTypes";
import type {
  BuildingState,
  ClassId,
  MapBounds,
  RealmId,
  ResourceId,
  ResourceStockpile,
  UnitState,
} from "../types";

/** Hold ladder. A higher tier satisfies every lower building gate. */
export type HoldTier = "Camp" | "Stronghold" | "Citadel";

/** Who a unit's population weight belongs to. */
export type PopKind = "villager" | "soldier" | "hero" | "calamity";

/** A numeric placement or production bonus. */
export interface BonusFlag {
  amount: number;
  id: string;
  partnerId: string | null;
}

/** Temporary unit modifier. Fed is the only one economy applies. */
export interface UnitModifier {
  healthBonus: number;
  id: string;
  regenBonus: number;
  untilTick: number;
}

/** Resources a villager is walking back to a drop-off. */
export interface CarryLoad {
  amount: number;
  resourceId: ResourceId;
}

/** What an idle villager was told to do. */
export type VillagerTask =
  | { buildingId: string; kind: "build" }
  | { buildingId: string; kind: "carry" }
  | { buildingId: string; kind: "harvest" }
  | { buildingId: string; kind: "garrison" }
  | { gatherTicksLeft: number; kind: "gather"; nodeId: string }
  | { kind: "move"; x: number; y: number }
  | { buildingId: string; kind: "repair" }
  | { buildingId: string; kind: "work" };

/** One furnace batch. Progress is in the same units as `required`. */
export interface BrewJob {
  pillId: string;
  progress: number;
  required: number;
}

/** One automatic building conversion whose inputs have already been paid. */
export interface ProductionJob {
  progress: number;
}

/** Unit fields this chunk adds on top of `UnitState`. */
export interface EconomyUnit extends UnitState {
  carry: CarryLoad | null;
  garrisoned: boolean;
  hp: number;
  maxHp: number;
  modifiers: UnitModifier[];
  popKind: PopKind;
  /** Node the player sent this villager to; it returns there after each load. */
  preferredNodeId?: string | null;
  realmId: RealmId | null;
  task: VillagerTask | null;
  /** Producer the player sent this villager to work or harvest; it returns there after each load and after shelter. */
  workplaceId?: string | null;
  /** Nodes and buildings this villager could not path to, skipped until `untilTick`. */
  unreachable?: UnreachableTarget[];
}

/** A target a villager gave up on. `untilTick` counts economy steps. */
export interface UnreachableTarget {
  targetId: string;
  untilTick: number;
}

/** Building fields this chunk adds on top of `BuildingState`. */
export interface EconomyBuilding extends BuildingState {
  bonuses: { adjacency: BonusFlag[]; vein: BonusFlag | null };
  brew: BrewJob | null;
  buildTicks: number;
  buildTicksDone: number;
  completed: boolean;
  constructing: boolean;
  hp: number;
  maxHp: number;
  onSpiritVein: boolean;
  placeholder: boolean;
  production: ProductionJob | null;
  tier: HoldTier;
}

/** Renderer-facing building. Construction progress is 0 to 1. */
export interface EconomyBuildingView extends BuildingState {
  bonuses: { adjacency: BonusFlag[]; vein: BonusFlag | null };
  brew: BrewJob | null;
  completed: boolean;
  constructing: boolean;
  constructionProgress: number;
  hp: number;
  id: string;
  maxHp: number;
  onSpiritVein: boolean;
  placeholder: boolean;
  production: ProductionJob | null;
  tier: HoldTier;
  x: number;
  y: number;
}

/** A finite surface node. Good nodes sit farther from Camp; the map decides where. */
export interface ResourceNode {
  id: string;
  nodeType: string;
  remaining: number;
  resourceId: ResourceId;
  x: number;
  y: number;
}

/** A fixed map node. A building on the same cell receives that building's vein bonus. */
export interface SpiritVein {
  id: string;
  x: number;
  y: number;
}

/** Underground work. Yield comes from `deposit`, never from surface nodes. */
export interface DeepWorkRuntime {
  buildingId: string;
  cooldown: number;
  deposit: ResourceStockpile;
  depth: number;
  digStartedTick: number | null;
  digTicksLeft: number;
  digging: boolean;
  kind: string;
  raidImmune: boolean;
  shaftHead: boolean;
}

/** Copy of a deep work for readers. */
export interface DeepWorkView {
  buildingId: string;
  cooldown: number;
  deposit: ResourceStockpile;
  depth: number;
  digTicksLeft: number;
  digging: boolean;
  kind: string;
  raidImmune: boolean;
  shaftHead: boolean;
}

/** Saved economy bag under `world.meta.economy`. */
export interface EconomyMeta {
  items: Record<string, number>;
  /** Mercenaries hired so far; the next hire's id uses this serial. */
  mercenarySerial: number;
  nodes: ResourceNode[];
  pendingTraining: ClassId[];
  popReserved: number;
  /** Why the last placement failed, or null after a success. */
  rejection: string | null;
  tier: HoldTier;
  upgrade: { startedTick: number; target: HoldTier; ticksLeft: number } | null;
  veins: SpiritVein[];
  works: DeepWorkRuntime[];
}

/**
 * Live world slice the economy mutates. `tick` and layer id are read through
 * functions so a long-lived host still sees sim updates.
 */
export interface EconomyHost {
  readonly buildings: BuildingState[];
  readonly economy: EconomyMeta;
  /** @returns The current layer id, or null before the first descent. */
  getLayerId(): string | null;
  /** @returns Vent disks that burn in this world; empty when none are active. */
  getVentVolumes(): readonly CircleVolume[];
  readonly map: MapBounds;
  readonly resources: ResourceStockpile;
  /** @param layerId - Layer whose ground and prices now apply. */
  setLayerId(layerId: string | null): void;
  /** @returns The tick index currently being processed, or the next tick between steps. */
  tick(): number;
  readonly units: UnitState[];
}

/** A building passed to `createEconomy`. */
export interface BuildingInit {
  buildingType: string;
  completed?: boolean;
  hp?: number;
  id: string;
  x: number;
  y: number;
}

/** A unit passed to `createEconomy`. Omitted class and kind become a villager. */
export interface UnitInit {
  classId?: ClassId;
  hp?: number;
  id: string;
  maxHp?: number;
  popKind?: PopKind;
  realmId?: RealmId | null;
  x: number;
  y: number;
}

/** Scenario data for a headless economy. Omitted collections start empty. */
export interface EconomyInit {
  buildings?: BuildingInit[];
  height?: number;
  layerId?: string;
  nodes?: ResourceNode[];
  seed?: number;
  stockpile?: Partial<ResourceStockpile>;
  tier?: HoldTier;
  units?: UnitInit[];
  veins?: SpiritVein[];
  width?: number;
}

/** Grid coordinate. */
export interface Point {
  x: number;
  y: number;
}
