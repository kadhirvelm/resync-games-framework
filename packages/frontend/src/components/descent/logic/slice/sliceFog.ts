import { getUnitDefinition } from "../combat/unitCatalog";
import { footprintRadius } from "../economy/footprint";
import { asBuilding, isEconomyUnit } from "../economy/records";
import {
  createFogOfWar,
  type FogOfWarState,
  fogMatchesBounds,
  isFogOfWarState,
  revealFogOfWar,
  type SightSource,
} from "../fog";
import type { SimWorldState } from "../sim/world";

/** Meta key holding the saved fog grid. */
export const FOG_OF_WAR_META_KEY = "fogOfWar";

/** Ticks between fog updates: five times a sim second. */
export const FOG_UPDATE_TICKS = 4;

/** How far a villager sees, in tiles. */
export const VILLAGER_SIGHT = 6;

/** Sight of a building still under construction. */
const CONSTRUCTION_SIGHT = 3;

/** Sight of a completed building with no entry below. */
const DEFAULT_BUILDING_SIGHT = 6;

/**
 * Sight of completed buildings. The Camp sees its opening deposits; the
 * towers are the Hold's lookouts.
 */
const BUILDING_SIGHT: Readonly<Record<string, number>> = {
  camp: 14,
  meditation_pavilion: 8,
  omen_tower: 16,
  spirit_array: 10,
  ward_tower: 11,
};

/**
 * Reads the saved fog grid.
 * @param world - Sim world
 * @returns The fog, or null before the first update
 */
export function readFogOfWar(world: SimWorldState): FogOfWarState | null {
  const fog = world.meta[FOG_OF_WAR_META_KEY];
  if (!isFogOfWarState(fog)) return null;
  if (!fogMatchesBounds(fog, world.map)) return null;
  return fog;
}

/**
 * Caches the exact sight sources that produced a given frozen `FogOfWarState`
 * so unchanged sight lists can skip `revealFogOfWar` completely.
 */
const lastSightSourcesByFog = new WeakMap<
  FogOfWarState,
  readonly SightSource[]
>();

/**
 * Checks whether two sight source lists are bit-for-bit identical in order,
 * position, and radius.
 * @param previous - Previously stamped sight sources
 * @param next - Current sight sources
 * @returns True when every source has the exact same coordinates and radius
 */
function sameSightSources(
  previous: readonly SightSource[],
  next: readonly SightSource[],
): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    const a = previous[index] as SightSource;
    const b = next[index] as SightSource;
    if (a.x !== b.x || a.y !== b.y || a.radius !== b.radius) return false;
  }
  return true;
}

/**
 * Recomputes what the Hold sees. Runs every `FOG_UPDATE_TICKS`, or at once
 * when forced or when no grid exists yet (a new run or an older save).
 * @param world - Sim world
 * @param force - Update even off the regular cadence
 * @returns The current fog
 */
export function updateFogOfWar(
  world: SimWorldState,
  force = false,
): FogOfWarState {
  const current = readFogOfWar(world);
  const due = force || world.tick % FOG_UPDATE_TICKS === 0;
  if (current !== null && !due) return current;
  const sources = holdSightSources(world);
  const previousSources =
    current === null ? undefined : lastSightSourcesByFog.get(current);
  if (
    current !== null &&
    previousSources !== undefined &&
    sameSightSources(previousSources, sources)
  ) {
    return current;
  }
  const next = revealFogOfWar(current ?? createFogOfWar(world.map), sources);
  lastSightSourcesByFog.set(next, sources);
  world.meta[FOG_OF_WAR_META_KEY] = next;
  return next;
}

/**
 * Every living Hold unit and standing Hold building, with its sight.
 * @param world - Sim world
 * @returns Sight sources
 */
export function holdSightSources(world: SimWorldState): SightSource[] {
  const sources: SightSource[] = [];
  for (const unit of world.units) {
    if (!isEconomyUnit(unit) || unit.hp <= 0) continue;
    sources.push({ radius: unitSight(unit.classId), x: unit.x, y: unit.y });
  }
  for (const building of world.buildings) {
    const record = asBuilding(building);
    if (!(record.hp > 0)) continue;
    sources.push({
      radius:
        buildingSight(record.buildingType, record.completed) +
        footprintRadius(record.buildingType),
      x: record.x,
      y: record.y,
    });
  }
  return sources;
}

/**
 * @param classId - Hold unit class
 * @returns How far the unit sees, in tiles
 */
function unitSight(classId: string): number {
  if (classId === "villager") return VILLAGER_SIGHT;
  try {
    return getUnitDefinition(classId as Parameters<typeof getUnitDefinition>[0])
      .vision;
  } catch {
    return VILLAGER_SIGHT;
  }
}

/**
 * @param buildingType - Building type
 * @param completed - Whether construction is finished
 * @returns How far the building sees, in tiles
 */
function buildingSight(buildingType: string, completed: boolean): number {
  if (!completed) return CONSTRUCTION_SIGHT;
  return BUILDING_SIGHT[buildingType] ?? DEFAULT_BUILDING_SIGHT;
}
