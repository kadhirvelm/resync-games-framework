/**
 * Painted HUD icons for every building in the economy tables, plus the later
 * layer structures that can still be selected.
 */
export const BUILDING_ICON_SRC = {
  alchemy_furnace: "/descent/building-icons/alchemy_furnace.png",
  artifact_forge: "/descent/building-icons/artifact_forge.png",
  barracks: "/descent/building-icons/barracks.png",
  bone_reclaimer: "/descent/building-icons/bone_reclaimer.png",
  calamity_altar: "/descent/building-icons/calamity_altar.png",
  camp: "/descent/building-icons/camp.png",
  cultivation_hall: "/descent/building-icons/cultivation_hall.png",
  deep_mine: "/descent/building-icons/deep_mine.png",
  ember_forge: "/descent/building-icons/ember_forge.png",
  farm: "/descent/building-icons/farm.svg",
  fire_ward_wall: "/descent/building-icons/fire_ward_wall.png",
  forest: "/descent/building-icons/forest.svg",
  forward_shrine: "/descent/building-icons/forward_shrine.png",
  gate: "/descent/building-icons/gate.png",
  hearth_ward: "/descent/building-icons/hearth_ward.png",
  hell_market: "/descent/building-icons/hell_market.png",
  hero_hall: "/descent/building-icons/hero_hall.png",
  housing: "/descent/building-icons/housing.png",
  mess_hall: "/descent/building-icons/mess_hall.png",
  omen_tower: "/descent/building-icons/omen_tower.png",
  root_cellar: "/descent/building-icons/root_cellar.png",
  spirit_herb_garden: "/descent/building-icons/spirit_herb_garden.svg",
  storehouse: "/descent/building-icons/storehouse.png",
  training_yard: "/descent/building-icons/training_yard.png",
  trap: "/descent/building-icons/trap.png",
  wall: "/descent/building-icons/wall.png",
  ward: "/descent/building-icons/ward.png",
  ward_tower: "/descent/building-icons/ward_tower.png",
  well: "/descent/building-icons/well.svg",
} as const;

/**
 * Painted icon for a building.
 * @param buildingType - Building id from the economy tables or a layer structure
 * @returns Public icon path, or null when that type has no painted icon
 */
export function buildingIconSrc(buildingType: string): string | null {
  if (!Object.hasOwn(BUILDING_ICON_SRC, buildingType)) return null;
  return BUILDING_ICON_SRC[buildingType as keyof typeof BUILDING_ICON_SRC];
}
