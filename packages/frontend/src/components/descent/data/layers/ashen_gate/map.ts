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

/** Complete, data-only map package for the Layer 1 vertical slice. */
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
 * Ashen Gate starts compact, then pulls workers through the center choke to
 * two deposits of every resource across the near, middle, and frontier bands.
 */
export const ASHEN_GATE_MAP: AshenGateMap = {
  buildings: [
    { buildingType: "camp", completed: true, id: "ashen-camp", x: 6, y: 20 },
  ],
  chokePoints: [
    { id: "west-choke", label: "Hold approach", x: 18, y: 20 },
    { id: "vent-choke", label: "Ember crossing", x: 29, y: 20 },
  ],
  height: 80,
  nodes: [
    {
      id: "ashen-food-near",
      nodeType: "fungus_grove",
      remaining: 900,
      resourceId: "food",
      x: 10,
      y: 13,
    },
    {
      id: "ashen-water-near",
      nodeType: "spirit_spring",
      remaining: 900,
      resourceId: "water",
      x: 10,
      y: 27,
    },
    {
      id: "ashen-wood-near",
      nodeType: "dead_tree",
      remaining: 360,
      resourceId: "wood",
      x: 14,
      y: 9,
    },
    {
      id: "ashen-stone-near",
      nodeType: "rock_vein",
      remaining: 360,
      resourceId: "stone",
      x: 15,
      y: 31,
    },
    {
      id: "ashen-coin-mid",
      nodeType: "ruins",
      remaining: 180,
      resourceId: "coin",
      x: 24,
      y: 9,
    },
    {
      id: "ashen-herbs-mid",
      nodeType: "ember_patch",
      remaining: 220,
      resourceId: "spirit_herbs",
      x: 25,
      y: 30,
    },
    {
      id: "ashen-iron-far",
      nodeType: "deep_vein",
      remaining: 300,
      resourceId: "iron",
      x: 33,
      y: 10,
    },
    {
      id: "ashen-essence-far",
      nodeType: "essence_well",
      remaining: 220,
      resourceId: "essence",
      x: 35,
      y: 30,
    },
    {
      id: "ashen-food-grove",
      nodeType: "fungus_grove",
      remaining: 600,
      resourceId: "food",
      x: 38,
      y: 14,
    },
    {
      id: "ashen-water-spring",
      nodeType: "spirit_spring",
      remaining: 600,
      resourceId: "water",
      x: 36,
      y: 66,
    },
    {
      id: "ashen-wood-grove",
      nodeType: "dead_tree",
      remaining: 300,
      resourceId: "wood",
      x: 52,
      y: 10,
    },
    {
      id: "ashen-stone-shelf",
      nodeType: "rock_vein",
      remaining: 300,
      resourceId: "stone",
      x: 50,
      y: 70,
    },
    {
      id: "ashen-coin-ruin",
      nodeType: "ruins",
      remaining: 140,
      resourceId: "coin",
      x: 68,
      y: 14,
    },
    {
      id: "ashen-herbs-patch",
      nodeType: "ember_patch",
      remaining: 180,
      resourceId: "spirit_herbs",
      x: 70,
      y: 66,
    },
    {
      id: "ashen-iron-ridge",
      nodeType: "deep_vein",
      remaining: 240,
      resourceId: "iron",
      x: 90,
      y: 18,
    },
    {
      id: "ashen-essence-well",
      nodeType: "essence_well",
      remaining: 180,
      resourceId: "essence",
      x: 94,
      y: 62,
    },
  ],
  stockpile: {
    coin: 10,
    essence: 12,
    food: 500,
    iron: 20,
    spirit_herbs: 4,
    stone: 160,
    water: 300,
    wood: 260,
  },
  units: [
    {
      classId: "warden",
      id: "ashen-captain",
      maxHp: 140,
      popKind: "soldier",
      realmId: "qi_gathering",
      x: 12,
      y: 20,
    },
    ...Array.from(
      { length: 3 },
      (_, index): UnitInit => ({
        id: `ashen-villager-${index + 1}`,
        x: 8,
        y: 18 + index * 2,
      }),
    ),
  ],
  veins: [
    { id: "ashen-vein-hold", x: 13, y: 20 },
    { id: "ashen-vein-choke", x: 48, y: 40 },
    { id: "ashen-vein-frontier", x: 88, y: 40 },
  ],
  vents: [
    { radius: 2.25, x: 22, y: 14 },
    { radius: 2.5, x: 29, y: 20 },
    { radius: 2.25, x: 35, y: 27 },
  ],
  width: 128,
};
