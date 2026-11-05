import { LAYER_TABLE } from "./layerTable";
import type {
  CircleVolume,
  EnvironmentEffect,
  HazardConfig,
  HazardId,
  LayerBuilding,
  LayerTable,
  LayerUnit,
  SchoolId,
} from "./layerTypes";

/** Everything a hazard query needs to know about the current layer and map. */
export interface EnvironmentContext {
  readonly table: LayerTable;
  readonly activeHazards: readonly HazardId[];
  readonly ventVolumes: readonly CircleVolume[];
  readonly buildings: readonly LayerBuilding[];
}

/** A unit's vent burn for one step. */
export interface HazardBurn {
  readonly unitId: string;
  readonly damage: number;
}

type HazardOfKind<K extends HazardId> = Extract<HazardConfig, { kind: K }>;

/**
 * Returns a hazard's config when it is active, narrowed to its kind.
 * @param context - Current environment.
 * @param kind - Hazard to look up.
 * @returns The config, or null when the hazard is not active.
 */
function activeHazard<K extends HazardId>(
  context: EnvironmentContext,
  kind: K,
): HazardOfKind<K> | null {
  if (!context.activeHazards.includes(kind)) {
    return null;
  }
  const config = context.table.hazards[kind];
  if (config.kind !== kind) {
    return null;
  }
  return config as HazardOfKind<K>;
}

/**
 * Reports whether a point lies inside a circle (edge inclusive).
 * @param volume - Circle to test.
 * @param x - Point x in tiles.
 * @param y - Point y in tiles.
 * @returns True when the point is inside.
 */
export function isInsideVolume(
  volume: CircleVolume,
  x: number,
  y: number,
): boolean {
  const dx = x - volume.x;
  const dy = y - volume.y;
  return dx * dx + dy * dy <= volume.radius * volume.radius;
}

/**
 * Reports whether a finished building of a type covers a point.
 * @param buildings - Buildings on the map.
 * @param buildingType - Building id to look for.
 * @param radiusFor - Coverage radius for one matching building.
 * @param x - Point x in tiles.
 * @param y - Point y in tiles.
 * @returns True when any constructed matching building covers the point.
 */
function isCoveredBy(
  buildings: readonly LayerBuilding[],
  buildingType: string,
  radiusFor: (building: LayerBuilding) => number,
  x: number,
  y: number,
): boolean {
  return buildings.some(
    (building) =>
      building.constructed &&
      building.buildingType === buildingType &&
      isInsideVolume(
        { radius: radiusFor(building), x: building.x, y: building.y },
        x,
        y,
      ),
  );
}

/**
 * Returns an Omen Tower's fog-clearing radius, larger once range-upgraded.
 * @param context - Current environment.
 * @param building - The Omen Tower.
 * @returns Radius in tiles.
 */
function omenRadius(
  context: EnvironmentContext,
  building: LayerBuilding,
): number {
  const omen = context.table.answers.omenTower;
  const upgraded = building.upgrades?.includes(omen.rangeUpgrade) ?? false;
  if (upgraded) {
    return omen.upgradedRadius;
  }
  return omen.radius;
}

/**
 * Vent burn per sim-second at a point. Standing in any vent burns; a
 * constructed fire-ward wall covering the point mitigates it.
 * @param context - Current environment.
 * @param x - Point x in tiles.
 * @param y - Point y in tiles.
 * @returns Burn damage per sim-second (0 when no vent applies).
 */
export function ventBurnPerSecondAt(
  context: EnvironmentContext,
  x: number,
  y: number,
): number {
  const vents = activeHazard(context, "ember_vents");
  if (vents === null) {
    return 0;
  }
  const onVent = context.ventVolumes.some((volume) =>
    isInsideVolume(volume, x, y),
  );
  if (!onVent) {
    return 0;
  }
  const wall = context.table.answers.fireWardWall;
  const warded = isCoveredBy(
    context.buildings,
    wall.buildingType,
    () => wall.radius,
    x,
    y,
  );
  if (!warded) {
    return vents.burnPerSecond;
  }
  return vents.burnPerSecond * (1 - vents.fireWardMitigation);
}

/**
 * Vision multiplier at a point. Fog shrinks vision except inside Ward
 * Tower range or Omen Tower range.
 * @param context - Current environment.
 * @param x - Point x in tiles.
 * @param y - Point y in tiles.
 * @returns Multiplier for unit vision (1 when no fog applies).
 */
export function visionMultiplierAt(
  context: EnvironmentContext,
  x: number,
  y: number,
): number {
  const fog = activeHazard(context, "fog");
  if (fog === null) {
    return 1;
  }
  const { omenTower, wardTower } = context.table.answers;
  const inTowerRange = isCoveredBy(
    context.buildings,
    wardTower.buildingType,
    () => wardTower.radius,
    x,
    y,
  );
  const inOmenRange = isCoveredBy(
    context.buildings,
    omenTower.buildingType,
    (building) => omenRadius(context, building),
    x,
    y,
  );
  if (inTowerRange || inOmenRange) {
    return 1;
  }
  return fog.visionMultiplier;
}

/**
 * Move and gather multipliers at a point. Cold slows both outside Hearth
 * Ward coverage.
 * @param context - Current environment.
 * @param x - Point x in tiles.
 * @param y - Point y in tiles.
 * @returns Move and gather multipliers (1 when no cold applies).
 */
export function coldMultipliersAt(
  context: EnvironmentContext,
  x: number,
  y: number,
): { readonly move: number; readonly gather: number } {
  const cold = activeHazard(context, "cold");
  if (cold === null) {
    return { gather: 1, move: 1 };
  }
  const ward = context.table.answers.hearthWard;
  const warmed = isCoveredBy(
    context.buildings,
    ward.buildingType,
    () => ward.radius,
    x,
    y,
  );
  if (warmed) {
    return { gather: 1, move: 1 };
  }
  return { gather: cold.gatherMultiplier, move: cold.moveMultiplier };
}

/**
 * Healing received multiplier. Lifedrain cuts healing unless the recipient
 * belongs to the hazard's immune school.
 * @param context - Current environment.
 * @param recipientSchool - School of the unit being healed, if chosen.
 * @returns Multiplier for incoming healing (1 when no lifedrain applies).
 */
export function healingMultiplierFor(
  context: EnvironmentContext,
  recipientSchool: SchoolId | null | undefined,
): number {
  const lifedrain = activeHazard(context, "lifedrain");
  if (lifedrain === null) {
    return 1;
  }
  if (recipientSchool === lifedrain.immuneSchool) {
    return 1;
  }
  return lifedrain.healingMultiplier;
}

/**
 * Base essence restored per enemy kill under lifedrain, before grade.
 * @param context - Current environment.
 * @returns Base essence per kill (0 when no lifedrain applies).
 */
export function baseEssencePerKill(context: EnvironmentContext): number {
  const lifedrain = activeHazard(context, "lifedrain");
  if (lifedrain === null) {
    return 0;
  }
  return lifedrain.essencePerKill;
}

/**
 * Collects every environment effect at one position for one unit.
 * @param context - Current environment.
 * @param unit - Position and optional school of the unit.
 * @returns Burn, vision, move, gather, and healing values.
 */
export function environmentAt(
  context: EnvironmentContext,
  unit: Pick<LayerUnit, "x" | "y" | "school">,
): EnvironmentEffect {
  const cold = coldMultipliersAt(context, unit.x, unit.y);
  return {
    burnPerSecond: ventBurnPerSecondAt(context, unit.x, unit.y),
    gatherMultiplier: cold.gather,
    healingMultiplier: healingMultiplierFor(context, unit.school),
    moveMultiplier: cold.move,
    visionMultiplier: visionMultiplierAt(context, unit.x, unit.y),
  };
}

/**
 * Computes vent burn for every unit over one sim step. Units off vents are
 * omitted. A tick processor feeds the result to combat's damage path.
 * @param context - Current environment.
 * @param units - Units to test.
 * @param stepSeconds - Sim-seconds covered by this step.
 * @returns One entry per burning unit.
 */
export function collectVentBurns(
  context: EnvironmentContext,
  units: readonly LayerUnit[],
  stepSeconds: number,
): HazardBurn[] {
  return units
    .map((unit) => ({
      damage: ventBurnPerSecondAt(context, unit.x, unit.y) * stepSeconds,
      unitId: unit.id,
    }))
    .filter((burn) => burn.damage > 0);
}

/**
 * Vent disks that burn on this layer. Empty when ember vents are not active.
 * Movement treats these disks as ground to walk around.
 * @param layerId - Current layer, or null before the first descent
 * @returns The layer's vent volumes
 */
export function activeVentVolumes(
  layerId: string | null,
): readonly CircleVolume[] {
  if (layerId === null) return [];
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === layerId);
  if (!layer) return [];
  if (!layer.hazards.includes("ember_vents")) return [];
  return layer.ventVolumes;
}

/** `world.meta` key for terrain generated for the current run. */
export const LAYER_TERRAIN_META_KEY = "layerTerrain";

/** Terrain a layer generated for one run, saved with the world. */
export interface LayerTerrain {
  layerId: string;
  ventVolumes: CircleVolume[];
}

/** The parts of a sim world the terrain helpers read and write. */
interface TerrainHolder {
  layerId: string | null;
  meta: Record<string, unknown>;
}

/**
 * Records a run's generated terrain so hazards, movement, and the renderer
 * use it instead of the layer table's fixed fallback.
 * @param world - Sim world
 * @param terrain - Generated terrain for the current layer
 */
export function setLayerTerrain(
  world: TerrainHolder,
  terrain: LayerTerrain,
): void {
  world.meta[LAYER_TERRAIN_META_KEY] = {
    layerId: terrain.layerId,
    ventVolumes: terrain.ventVolumes.map((vent) => ({ ...vent })),
  } satisfies LayerTerrain;
}

/**
 * Vent disks that burn in this world: the run's generated vents when they
 * belong to the current layer, else the layer table's. Empty when ember
 * vents are not active.
 * @param world - Sim world (or any object with its layer id and meta)
 * @returns Vent volumes in effect
 */
export function worldVentVolumes(
  world: TerrainHolder,
): readonly CircleVolume[] {
  if (!hasEmberVents(world.layerId)) return [];
  const terrain = world.meta[LAYER_TERRAIN_META_KEY];
  if (!isLayerTerrain(terrain) || terrain.layerId !== world.layerId) {
    return activeVentVolumes(world.layerId);
  }
  return terrain.ventVolumes;
}

/**
 * @param layerId - Layer to check
 * @returns Whether the layer burns with ember vents
 */
function hasEmberVents(layerId: string | null): boolean {
  const layer = LAYER_TABLE.layers.find((entry) => entry.id === layerId);
  return layer?.hazards.includes("ember_vents") ?? false;
}

/**
 * Narrows terrain loaded from a save.
 * @param value - Candidate meta value
 * @returns Whether it is well-formed generated terrain
 */
function isLayerTerrain(value: unknown): value is LayerTerrain {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<LayerTerrain>;
  if (typeof candidate.layerId !== "string") return false;
  if (!Array.isArray(candidate.ventVolumes)) return false;
  return candidate.ventVolumes.every(
    (vent: unknown) =>
      typeof vent === "object" &&
      vent !== null &&
      Number.isFinite((vent as CircleVolume).x) &&
      Number.isFinite((vent as CircleVolume).y) &&
      Number.isFinite((vent as CircleVolume).radius),
  );
}
