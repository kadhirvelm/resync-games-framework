/** Buildings intentionally exposed by the Ashen Gate slice. */
export const ASHEN_GATE_BUILDINGS = [
  "barracks",
  "housing",
  "ward_tower",
  "storehouse",
  "mess_hall",
  "omen_tower",
  "wall",
  "gate",
  "fire_ward_wall",
  "root_cellar",
  "alchemy_furnace",
  "cultivation_hall",
  "hero_hall",
  "artifact_forge",
  "ember_forge",
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
    "Build a Barracks and Omen Tower, then train Wardens.",
    "Reach the frontier resources behind the Ember vents.",
    "Raise a Cultivation Hall and make one Sworn.",
    "Survive the scout, swarm, elite, and Cinderjaw waves.",
  ],
  victory:
    "Cinderjaw dies protecting a starving horde. The Hold records the Ashen Gate as secured. Bone Wastes is not part of this slice yet.",
} as const;
