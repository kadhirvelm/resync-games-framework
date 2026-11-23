/** Buildings intentionally exposed by the Ashen Gate slice, ordered by Hold tier. */
export const ASHEN_GATE_BUILDINGS = [
  // Camp (Tier 1)
  "housing",
  "storehouse",
  "well",
  "forest",
  "stone_quarry",
  "barracks",
  "wall",
  // Outpost (Tier 2)
  "farm",
  "gate",
  "ward_tower",
  "omen_tower",
  "cultivator_sanctum",
  "spirit_array",
  "cultivation_hall",
  // Stronghold (Tier 3)
  "hell_market",
  "meditation_pavilion",
  // Citadel (Tier 4)
  "spirit_herb_garden",
  "alchemy_furnace",
] as const;

/** Player-facing copy and progression beats for the vertical slice. */
export const ASHEN_GATE_CONTENT = {
  bossId: "cinderjaw",
  bossName: "Cinderjaw",
  bossTitle: "Gatekeeper",
  briefing:
    "Your villagers stand idle at the Camp. Drag to select them and right-click wood, food, or stone to gather. Raiders reach the gate in 90 seconds.",
  defeat:
    "The Hold goes dark. The Gate remains closed, but the autosave still holds the last defensible line.",
  hordeDamageMultiplier: 0.55,
  objectives: [
    "Gather food, water, wood, and stone.",
    "Build a Barracks, train Wardens, and upgrade to an Outpost.",
    "Reach the frontier resources behind the Ember vents.",
    "Repel the scouts to promote your Captain, or build a Cultivation Hall at Outpost.",
    "Survive the scout, swarm, elite, and Cinderjaw waves.",
  ],
  victory:
    "Cinderjaw dies protecting a starving horde. The Hold records the Ashen Gate as secured. Bone Wastes is not part of this slice yet.",
} as const;
