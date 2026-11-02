import type { BuildingTooltip, TreasureTooltip } from "./types";

/** Lore-only tooltip copy for the Hold's core and layer-specific structures. */
export const BUILDING_TOOLTIPS = {
  alchemy_furnace: {
    buildingId: "alchemy_furnace",
    lore: "Tamsin measures every pill twice and records its essence once. He will not explain the missing entry.",
    name: "Alchemy Furnace",
  },
  artifact_forge: {
    buildingId: "artifact_forge",
    lore: "Hollis Marrow says a treasure is only a tool that remembers too much.",
    name: "Artifact Forge",
  },
  barracks: {
    buildingId: "barracks",
    lore: "The Hold teaches five ways to survive below. None begin with standing alone.",
    name: "Barracks",
  },
  bone_reclaimer: {
    buildingId: "bone_reclaimer",
    lore: "Edda forbids the old euphemism salvage. Every piece recovered here belonged to someone.",
    name: "Bone Reclaimer",
  },
  calamity_altar: {
    buildingId: "calamity_altar",
    lore: "One beacon, one boss core, one enormous answer. The Altar permits no second shadow.",
    name: "Calamity Altar",
  },
  cultivation_hall: {
    buildingId: "cultivation_hall",
    lore: "Ashborn enter carrying ambition. The Sworn and Veterans leave carrying consequences.",
    name: "Cultivation Hall",
  },
  deep_mine: {
    buildingId: "deep_mine",
    lore: "The shaft protects its ore from raiders, not its miners from what knocks below.",
    name: "Deep Mine",
  },
  ember_forge: {
    buildingId: "ember_forge",
    lore: "Ashen Gate fire, taught to hold a shape instead of consuming one.",
    name: "Ember Forge",
  },
  fire_ward_wall: {
    buildingId: "fire_ward_wall",
    lore: "Its seals turn an ember vent from a death sentence into a boundary.",
    name: "Fire-Ward Wall",
  },
  forward_shrine: {
    buildingId: "forward_shrine",
    lore: "A frontier lamp for the living and a road marker for those the First Gate sends back.",
    name: "Forward Shrine",
  },
  gate: {
    buildingId: "gate",
    lore: "It opens for the Hold and closes on everything the Hold is afraid to name.",
    name: "Gate",
  },
  hearth_ward: {
    buildingId: "hearth_ward",
    lore: "A small circle of remembered summer, carried one careful frontier at a time.",
    name: "Hearth Ward",
  },
  hell_market: {
    buildingId: "hell_market",
    lore: "Shortages acquire manners at the counter. The Market calls the difference between need and price a tithe.",
    name: "Hell Market",
  },
  hero_hall: {
    buildingId: "hero_hall",
    lore: "Its lanterns mark Great Souls caught by the First Gate before Hell can close its hand.",
    name: "Hero Hall",
  },
  housing: {
    buildingId: "housing",
    lore: "Four walls, a warm bunk, and a name on the door keep a soldier from becoming a number too soon.",
    name: "Housing",
  },
  mess_hall: {
    buildingId: "mess_hall",
    lore: "Rations are readiness, never a tax on the hungry. Every bowl says the Hold expects its people home.",
    name: "Mess Hall",
  },
  omen_tower: {
    buildingId: "omen_tower",
    lore: "An Omen is sixty seconds of mercy, provided someone has built high enough to read it.",
    name: "Omen Tower",
  },
  root_cellar: {
    buildingId: "root_cellar",
    lore: "A slow spring and a stubborn crop: proof that the Hold can live without taking every flame it finds.",
    name: "Root Cellar",
  },
  storehouse: {
    buildingId: "storehouse",
    lore: "The stock ledger begins with supplies and ends with the names of those sent to fetch them.",
    name: "Storehouse",
  },
  wall: {
    buildingId: "wall",
    lore: "Stone buys time. The Hold's work is deciding who receives it.",
    name: "Wall",
  },
  ward_tower: {
    buildingId: "ward_tower",
    lore: "A lamp in Hell is also a promise: someone will see the next wave coming.",
    name: "Ward Tower",
  },
} as const satisfies Record<string, BuildingTooltip>;

/** Tooltip copy for the five MVP treasures, including visible provenance. */
export const TREASURE_TOOLTIPS = {
  blood_chalice: {
    lore: "The empty cup grows warm near the wounded and cold near an essence furnace.",
    name: "Blood Chalice",
    previousOwnerLine:
      "Previous owner: Surgeon Lio Fen, who refused to list patients as furnace loss.",
    treasureId: "blood_chalice",
  },
  cinder_banner: {
    lore: "A scorched company standard that still strains toward the nearest open gate.",
    name: "Cinder Banner",
    previousOwnerLine:
      "Previous owner: Captain Rhun Vale, who held the Ashen retreat until the roster stopped counting him.",
    treasureId: "cinder_banner",
  },
  rime_chain: {
    lore: "Each silver link is etched with one clause of the forgotten Ember Compact.",
    name: "Rime Chain",
    previousOwnerLine:
      "Previous owner: Envoy Maela Sorn, last Hold witness to Queen Isolde's terms.",
    treasureId: "rime_chain",
  },
  twin_gong: {
    lore: "One face calls the living to formation. The other answers from below.",
    name: "Twin Gong",
    previousOwnerLine:
      "Previous owner: Sera Quill, who carried it out when the Sable Watch fell silent.",
    treasureId: "twin_gong",
  },
  wardstone: {
    lore: "A command seal polished smooth by a thumb that kept finding the same old oath.",
    name: "Wardstone",
    previousOwnerLine:
      "Previous owner: Marshal Orrec Vane, Bone Warden of the companies the Hold abandoned.",
    treasureId: "wardstone",
  },
} as const satisfies Record<string, TreasureTooltip>;
