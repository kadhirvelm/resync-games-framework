import type {
  BuildingInit,
  EconomyInit,
  UnitInit,
} from "../../../logic/economy";
import type { ResourceNode, SpiritVein } from "../../../logic/economy/model";
import type { CircleVolume, TerrainFeature } from "../../../logic/layers";
import { ASHEN_GATE_STOCKPILE } from "../ashen_gate/map";

/** One co-op player assigned a Hold on the Ashen Crucible map. */
export interface AshenCruciblePlayer {
  color: string;
  id: string;
  name: string;
  slotIndex: number;
}

/** A named defensive choke point on the Ashen Crucible multiplayer map. */
export interface AshenCrucibleChokePoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** Complete, data-only map package for a 1–4 player Ashen Crucible match. */
export interface AshenCrucibleMap {
  buildings: readonly BuildingInit[];
  chokePoints: readonly AshenCrucibleChokePoint[];
  height: number;
  nodes: readonly ResourceNode[];
  obstacles: readonly TerrainFeature[];
  stockpile: NonNullable<EconomyInit["stockpile"]>;
  units: readonly UnitInit[];
  veins: readonly SpiritVein[];
  vents: readonly CircleVolume[];
  width: number;
}

/** Shared contested resource slot in the mid-field or frontier. */
export interface AshenCrucibleSharedSlot {
  band: "frontier" | "mid" | "outer";
  id: string;
  nodeType: string;
  remaining: number;
  resourceId: ResourceNode["resourceId"];
  /** Preferred column as a share of map width (0..1). */
  targetX: number;
  /** Preferred row as a share of map height (0..1). */
  targetY: number;
}

/**
 * Larger co-op battlefield (288×216) so up to four allied Camps fit along
 * the western ridge with room for shared mid-field lanes and flanks.
 */
export const ASHEN_CRUCIBLE_MAP_SIZE = { height: 216, width: 288 } as const;

/** Starting villagers granted to each player at their Camp. */
export const ASHEN_CRUCIBLE_STARTING_VILLAGERS = 3;

/** Opening resources guaranteed around every player's Camp. */
export const ASHEN_CRUCIBLE_STARTER_NODES: readonly {
  key: string;
  nodeType: string;
  remaining: number;
  resourceId: ResourceNode["resourceId"];
}[] = [
  {
    key: "food",
    nodeType: "fungus_grove",
    remaining: 900,
    resourceId: "food",
  },
  {
    key: "water",
    nodeType: "spirit_spring",
    remaining: 900,
    resourceId: "water",
  },
  {
    key: "wood",
    nodeType: "dead_tree",
    remaining: 420,
    resourceId: "wood",
  },
  {
    key: "stone",
    nodeType: "rock_vein",
    remaining: 420,
    resourceId: "stone",
  },
];

/** Shared contested deposits across the Crucible's three lanes and flanks. */
export const ASHEN_CRUCIBLE_SHARED_SLOTS: readonly AshenCrucibleSharedSlot[] = [
  {
    band: "mid",
    id: "crucible-coin-north",
    nodeType: "ruins",
    remaining: 240,
    resourceId: "coin",
    targetX: 0.34,
    targetY: 0.24,
  },
  {
    band: "mid",
    id: "crucible-herbs-north",
    nodeType: "ember_patch",
    remaining: 260,
    resourceId: "spirit_herbs",
    targetX: 0.36,
    targetY: 0.38,
  },
  {
    band: "mid",
    id: "crucible-coin-south",
    nodeType: "ruins",
    remaining: 240,
    resourceId: "coin",
    targetX: 0.34,
    targetY: 0.76,
  },
  {
    band: "mid",
    id: "crucible-herbs-south",
    nodeType: "ember_patch",
    remaining: 260,
    resourceId: "spirit_herbs",
    targetX: 0.36,
    targetY: 0.62,
  },
  {
    band: "frontier",
    id: "crucible-iron-north",
    nodeType: "deep_vein",
    remaining: 360,
    resourceId: "iron",
    targetX: 0.56,
    targetY: 0.26,
  },
  {
    band: "frontier",
    id: "crucible-essence-center",
    nodeType: "essence_well",
    remaining: 300,
    resourceId: "essence",
    targetX: 0.54,
    targetY: 0.5,
  },
  {
    band: "frontier",
    id: "crucible-iron-south",
    nodeType: "deep_vein",
    remaining: 360,
    resourceId: "iron",
    targetX: 0.56,
    targetY: 0.74,
  },
  {
    band: "frontier",
    id: "crucible-essence-north",
    nodeType: "essence_well",
    remaining: 260,
    resourceId: "essence",
    targetX: 0.68,
    targetY: 0.34,
  },
  {
    band: "frontier",
    id: "crucible-essence-south",
    nodeType: "essence_well",
    remaining: 260,
    resourceId: "essence",
    targetX: 0.68,
    targetY: 0.66,
  },
  {
    band: "outer",
    id: "crucible-food-north",
    nodeType: "fungus_grove",
    remaining: 750,
    resourceId: "food",
    targetX: 0.45,
    targetY: 0.14,
  },
  {
    band: "outer",
    id: "crucible-water-south",
    nodeType: "spirit_spring",
    remaining: 750,
    resourceId: "water",
    targetX: 0.45,
    targetY: 0.86,
  },
  {
    band: "outer",
    id: "crucible-wood-north",
    nodeType: "dead_tree",
    remaining: 420,
    resourceId: "wood",
    targetX: 0.64,
    targetY: 0.16,
  },
  {
    band: "outer",
    id: "crucible-stone-south",
    nodeType: "rock_vein",
    remaining: 420,
    resourceId: "stone",
    targetX: 0.64,
    targetY: 0.84,
  },
  {
    band: "outer",
    id: "crucible-iron-ridge",
    nodeType: "deep_vein",
    remaining: 320,
    resourceId: "iron",
    targetX: 0.76,
    targetY: 0.24,
  },
  {
    band: "outer",
    id: "crucible-coin-ridge",
    nodeType: "ruins",
    remaining: 240,
    resourceId: "coin",
    targetX: 0.76,
    targetY: 0.76,
  },
];

/**
 * Scales the opening co-op stockpile for the number of participating players
 * so each player can raise an opening Barracks and squad.
 * @param playerCount - Number of players (1..4)
 * @returns Opening resource stockpile
 */
export function ashenCrucibleStockpile(
  playerCount: number,
): AshenCrucibleMap["stockpile"] {
  const count = Math.max(1, Math.min(4, Math.floor(playerCount)));
  return {
    coin: ASHEN_GATE_STOCKPILE.coin ?? 0,
    essence: ASHEN_GATE_STOCKPILE.essence ?? 0,
    food: (ASHEN_GATE_STOCKPILE.food ?? 160) * count,
    iron: ASHEN_GATE_STOCKPILE.iron ?? 0,
    spirit_herbs: ASHEN_GATE_STOCKPILE.spirit_herbs ?? 0,
    stone: (ASHEN_GATE_STOCKPILE.stone ?? 50) * count,
    water: (ASHEN_GATE_STOCKPILE.water ?? 83) * count,
    wood: (ASHEN_GATE_STOCKPILE.wood ?? 60) * count,
  };
}
