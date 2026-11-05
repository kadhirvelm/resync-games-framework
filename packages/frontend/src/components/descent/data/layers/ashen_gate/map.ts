import type {
  BuildingInit,
  EconomyInit,
  UnitInit,
} from "../../../logic/economy";
import type { ResourceNode, SpiritVein } from "../../../logic/economy/model";
import type { CircleVolume } from "../../../logic/layers";

/** A named defensive lane on the Ashen Gate teaching map. */
export interface AshenGateChokePoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Complete, data-only map package for one Layer 1 run. */
export interface AshenGateMap {
  buildings: readonly BuildingInit[];
  chokePoints: readonly AshenGateChokePoint[];
  height: number;
  nodes: readonly ResourceNode[];
  stockpile: NonNullable<EconomyInit["stockpile"]>;
  units: readonly UnitInit[];
  veins: readonly SpiritVein[];
  vents: readonly CircleVolume[];
  width: number;
}

/**
 * Distance band a resource deposit is generated in, measured from the Camp
 * toward the horde gate:
 * - `near`: a short walk around the Camp, on the Hold side of the vents
 * - `mid`: beside the Ember crossing
 * - `frontier`: just behind the vents
 * - `outer`: out on the flanks of the horde's lane
 */
export type AshenGateBand = "frontier" | "mid" | "near" | "outer";

/** One resource deposit the generator must place. */
export interface AshenGateNodeSlot {
  band: AshenGateBand;
  id: string;
  nodeType: string;
  /** Slots sharing a pair go on opposite flanks of the horde's lane. */
  pair?: string;
  remaining: number;
  resourceId: ResourceNode["resourceId"];
  /** Outer slots only: preferred column as a share of the map width. */
  targetX?: number;
}

/**
 * Map bounds in tiles: 1.5× the old 168×104 on each side, so most of the
 * layer starts under fog and has to be scouted.
 */
export const ASHEN_GATE_MAP_SIZE = { height: 156, width: 252 } as const;

/** Villagers standing at the Camp when a run starts. */
export const ASHEN_GATE_STARTING_VILLAGERS = 3;

/**
 * Two deposits of every resource. Ids are stable across runs; only their
 * positions are generated.
 */
export const ASHEN_GATE_NODE_SLOTS: readonly AshenGateNodeSlot[] = [
  {
    band: "near",
    id: "ashen-food-near",
    nodeType: "fungus_grove",
    remaining: 900,
    resourceId: "food",
  },
  {
    band: "near",
    id: "ashen-water-near",
    nodeType: "spirit_spring",
    remaining: 900,
    resourceId: "water",
  },
  {
    band: "near",
    id: "ashen-wood-near",
    nodeType: "dead_tree",
    remaining: 360,
    resourceId: "wood",
  },
  {
    band: "near",
    id: "ashen-stone-near",
    nodeType: "rock_vein",
    remaining: 360,
    resourceId: "stone",
  },
  {
    band: "mid",
    id: "ashen-coin-mid",
    nodeType: "ruins",
    pair: "mid",
    remaining: 180,
    resourceId: "coin",
  },
  {
    band: "mid",
    id: "ashen-herbs-mid",
    nodeType: "ember_patch",
    pair: "mid",
    remaining: 220,
    resourceId: "spirit_herbs",
  },
  {
    band: "frontier",
    id: "ashen-iron-far",
    nodeType: "deep_vein",
    pair: "frontier",
    remaining: 300,
    resourceId: "iron",
  },
  {
    band: "frontier",
    id: "ashen-essence-far",
    nodeType: "essence_well",
    pair: "frontier",
    remaining: 220,
    resourceId: "essence",
  },
  {
    band: "outer",
    id: "ashen-food-grove",
    nodeType: "fungus_grove",
    pair: "outer-1",
    remaining: 600,
    resourceId: "food",
    targetX: 0.34,
  },
  {
    band: "outer",
    id: "ashen-water-spring",
    nodeType: "spirit_spring",
    pair: "outer-1",
    remaining: 600,
    resourceId: "water",
    targetX: 0.34,
  },
  {
    band: "outer",
    id: "ashen-wood-grove",
    nodeType: "dead_tree",
    pair: "outer-2",
    remaining: 300,
    resourceId: "wood",
    targetX: 0.46,
  },
  {
    band: "outer",
    id: "ashen-stone-shelf",
    nodeType: "rock_vein",
    pair: "outer-2",
    remaining: 300,
    resourceId: "stone",
    targetX: 0.46,
  },
  {
    band: "outer",
    id: "ashen-coin-ruin",
    nodeType: "ruins",
    pair: "outer-3",
    remaining: 140,
    resourceId: "coin",
    targetX: 0.6,
  },
  {
    band: "outer",
    id: "ashen-herbs-patch",
    nodeType: "ember_patch",
    pair: "outer-3",
    remaining: 180,
    resourceId: "spirit_herbs",
    targetX: 0.6,
  },
  {
    band: "outer",
    id: "ashen-iron-ridge",
    nodeType: "deep_vein",
    pair: "outer-4",
    remaining: 240,
    resourceId: "iron",
    targetX: 0.74,
  },
  {
    band: "outer",
    id: "ashen-essence-well",
    nodeType: "essence_well",
    pair: "outer-4",
    remaining: 180,
    resourceId: "essence",
    targetX: 0.74,
  },
];

/**
 * Funds the opening checklist exactly: one villager, a Barracks, five
 * Wardens, and an Omen Tower. Everything beyond that must be gathered.
 */
export const ASHEN_GATE_STOCKPILE: AshenGateMap["stockpile"] = {
  coin: 0,
  essence: 0,
  food: 160,
  iron: 0,
  spirit_herbs: 0,
  stone: 50,
  water: 83,
  wood: 60,
};
