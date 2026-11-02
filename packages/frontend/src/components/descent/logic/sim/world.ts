import {
  type BuildingState,
  type MapBounds,
  RESOURCE_IDS,
  type ResourceStockpile,
  type StampedCommand,
  type UnitState,
} from "../types";
import { DEFAULT_MAP_BOUNDS, type SimSpeed } from "./constants";
import { normalizeSeed } from "./rng";

/**
 * The complete, JSON-safe sim state. Serialization writes exactly this
 * object, so anything a module needs after load must live here (usually in
 * `meta[moduleId]`).
 */
export interface SimWorldState {
  buildings: BuildingState[];
  /** Next value used for `seq` when stamping a command. */
  commandSeq: number;
  layerId: string | null;
  map: MapBounds;
  meta: Record<string, unknown>;
  /** Next suffix for deterministic entity ids. */
  nextEntitySeq: number;
  paused: boolean;
  pendingCommands: StampedCommand[];
  resources: ResourceStockpile;
  /** Live RNG cursor; the "seed cursor" restored on load. */
  rngState: number;
  seed: number;
  speed: SimSpeed;
  /** Ticks completed so far. The next tick processed has this index. */
  tick: number;
  units: UnitState[];
}

/** Options for a brand-new world. */
export interface WorldOptions {
  layerId?: string | null;
  map?: MapBounds;
  seed: number;
}

/**
 * Builds a stockpile with every resource at zero.
 * @returns A fresh zeroed stockpile
 */
export function createEmptyStockpile(): ResourceStockpile {
  const stockpile = {} as ResourceStockpile;
  for (const resourceId of RESOURCE_IDS) {
    stockpile[resourceId] = 0;
  }
  return stockpile;
}

/**
 * Creates the minimal empty world other chunks attach to.
 * @param options - Seed, optional starting layer, and map bounds
 * @returns A world at tick 0 with empty collections and zero resources
 */
export function createWorldState(options: WorldOptions): SimWorldState {
  const seed = normalizeSeed(options.seed);
  return {
    buildings: [],
    commandSeq: 0,
    layerId: options.layerId ?? null,
    map: { ...(options.map ?? DEFAULT_MAP_BOUNDS) },
    meta: {},
    nextEntitySeq: 1,
    paused: false,
    pendingCommands: [],
    resources: createEmptyStockpile(),
    rngState: seed,
    seed,
    speed: 1,
    tick: 0,
    units: [],
  };
}
