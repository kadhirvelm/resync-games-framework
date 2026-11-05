import { BUILDING_TOOLTIPS } from "../data/narrative/tooltips";
import type { CultivationView } from "../logic/cultivation/types";
import { footprintSide } from "../logic/economy/footprint";
import type {
  BuildingState,
  ResourceId,
  SimSnapshot,
  UnitState,
} from "../logic/types";
import { BOSS_SIZE_SCALE } from "../logic/waves/constants";
import {
  cuesInSight,
  effectsInSight,
  exploredFeatures,
  visibleToHold,
} from "./fogFilter";
import {
  type BuildingReadout,
  type CropGrowthReadout,
  type DescentPresentation,
  type OnboardingFlags,
  type ReadPresentation,
  type RouteReadout,
  readPresentation,
  type TrainingQueueReadout,
  type UnitReadout,
} from "./presentation";
import {
  CLASS_LABEL,
  findLayer,
  type LayerBannerCopy,
  layerBannerFor,
} from "./text";

/** A unit the shell can draw and inspect. */
export interface ShellUnit {
  /** What a villager is doing, e.g. "Gathering Wood"; null for soldiers. */
  activity: string | null;
  /** A layer boss, such as Cinderjaw. Drawn larger so it reads as a threat. */
  boss: boolean;
  calamity: boolean;
  /** What a villager is carrying home, or null when empty-handed. */
  carrying: { amount: number; resource: ResourceId } | null;
  classId: UnitState["classId"];
  cultivation: CultivationView | null;
  factionId: "hold" | "horde";
  hero: boolean;
  hitPoints: number | null;
  id: string;
  /** A villager waiting for orders. */
  idle: boolean;
  maxHitPoints: number | null;
  name: string;
  /** Where a Hold unit is headed: current destination, then queued legs. */
  route?: readonly RouteReadout[];
  treasureSlots: number;
  treasures: readonly { id: string; name: string }[];
  x: number;
  y: number;
}

/** How much larger than a normal unit a boss is drawn; matches its body. */
export const BOSS_DISPLAY_SCALE = BOSS_SIZE_SCALE;

/**
 * The battlefield scale for a unit's model, selection ring, and health bar.
 * @param unit - Unit to draw
 * @returns `BOSS_DISPLAY_SCALE` for a boss, otherwise 1
 */
export function unitDisplayScale(unit: Pick<ShellUnit, "boss">): number {
  return unit.boss ? BOSS_DISPLAY_SCALE : 1;
}

/** A building the shell can draw and select. */
export interface ShellBuilding {
  /** What the building is busy with, e.g. "Training Villager". */
  activity: string | null;
  /** Progress of `activity`, 0 to 1. */
  activityProgress: number | null;
  buildingType: string;
  constructing: boolean;
  factionId: "hold" | "horde";
  /** Side of the square of map cells the building covers. */
  footprint: number;
  /** Crop growth for a harvested producer, such as a Spirit Herb Garden. */
  growth: CropGrowthReadout | null;
  hitPoints: number | null;
  id: string;
  maxHitPoints: number | null;
  name: string;
  rallyPoint: { nodeId?: string; x: number; y: number } | null;
  tier: string | null;
  trainingQueue: readonly TrainingQueueReadout[];
  x: number;
  y: number;
}

/** Everything the shell renders from one snapshot. */
export interface ShellModel
  extends Omit<ReadPresentation, "buildings" | "onboarding" | "units"> {
  banner: LayerBannerCopy;
  buildings: readonly ShellBuilding[];
  map: SimSnapshot["map"];
  onboarding: OnboardingFlags;
  paused: boolean;
  resources: SimSnapshot["resources"];
  scale: number;
  speed: number;
  tick: number;
  units: readonly ShellUnit[];
}

const TOOLTIPS: Record<string, { name: string }> = BUILDING_TOOLTIPS;

/**
 * Pixels per map unit. A 128-wide map is about 1024 pixels across.
 * @param width - Map width in sim units
 * @returns The display scale
 */
export function mapDisplayScale(width: number): number {
  if (!(width > 0)) return 8;
  return 1024 / width;
}

/**
 * Chooses coach flags. Ashen Gate starts with all three pending.
 * @param flags - Published flags, or null when the snapshot omitted them
 * @param layerName - Banner name
 * @returns The flags the coach uses
 */
function resolveOnboarding(
  flags: OnboardingFlags | null,
  layerName: string,
): OnboardingFlags {
  if (flags !== null) return flags;
  const firstRun = layerName === "Ashen Gate";
  return { pill: firstRun, realmGate: firstRun, school: firstRun };
}

/**
 * Names a building from the readout or the narrative tooltip table.
 * @param buildingType - Sim building type
 * @param readout - Optional published decoration
 * @returns The name to show
 */
function buildingName(
  buildingType: string,
  readout: BuildingReadout | undefined,
): string {
  if (readout?.name !== undefined && readout.name.length > 0)
    return readout.name;
  return TOOLTIPS[buildingType]?.name ?? buildingType;
}

/**
 * Keeps only well-formed route points from a published readout.
 * @param route - Published route, if any
 * @returns Finite route points in walking order
 */
function readRoute(route: unknown): RouteReadout[] {
  if (!Array.isArray(route)) return [];
  return route.filter(
    (point): point is RouteReadout =>
      typeof point === "object" &&
      point !== null &&
      Number.isFinite((point as RouteReadout).x) &&
      Number.isFinite((point as RouteReadout).y),
  );
}

/**
 * Decorates a sim unit with published cultivation and faction data.
 * @param unit - Unit from the sim snapshot
 * @param readout - Matching `meta.ui` decoration, if any
 * @returns The drawable unit
 */
function decorateUnit(
  unit: UnitState,
  readout: UnitReadout | undefined,
): ShellUnit {
  return {
    activity: typeof readout?.task === "string" ? readout.task : null,
    boss: readout?.role === "boss",
    calamity: readout?.calamity === true,
    carrying: carriedLoad(readout),
    classId: unit.classId,
    cultivation: readout?.cultivation ?? null,
    factionId: readout?.factionId === "horde" ? "horde" : "hold",
    hero: readout?.hero === true,
    hitPoints:
      typeof readout?.hitPoints === "number" ? readout.hitPoints : null,
    id: unit.id,
    idle: readout?.idle === true,
    maxHitPoints:
      typeof readout?.maxHitPoints === "number" ? readout.maxHitPoints : null,
    name: readout?.name ?? CLASS_LABEL[unit.classId],
    route: readRoute(readout?.route),
    treasureSlots: readout?.treasureSlots ?? 0,
    treasures: readout?.treasures ?? [],
    x: unit.x,
    y: unit.y,
  };
}

/**
 * A villager's published load, if it holds anything.
 * @param readout - The unit's decoration, if any
 * @returns Resource and amount, or null when empty-handed
 */
function carriedLoad(readout: UnitReadout | undefined): ShellUnit["carrying"] {
  const resource = readout?.carrying;
  if (resource === undefined || resource === null) return null;
  const amount = readout?.carryingAmount ?? 0;
  if (!(amount > 0)) return null;
  return { amount, resource };
}

/**
 * Decorates a sim building.
 * @param building - Building from the sim snapshot
 * @param readout - Matching decoration, if any
 * @returns The drawable building
 */
function decorateBuilding(
  building: BuildingState,
  readout: BuildingReadout | undefined,
): ShellBuilding {
  let hitPoints: number | null = null;
  if (typeof readout?.hitPoints === "number") hitPoints = readout.hitPoints;
  let maxHitPoints: number | null = null;
  if (typeof readout?.maxHitPoints === "number") {
    maxHitPoints = readout.maxHitPoints;
  }
  return {
    activity: typeof readout?.activity === "string" ? readout.activity : null,
    activityProgress:
      typeof readout?.progress === "number" ? readout.progress : null,
    buildingType: building.buildingType,
    constructing: readout?.constructing === true,
    factionId: readout?.factionId === "horde" ? "horde" : "hold",
    footprint: footprintSide(building.buildingType),
    growth: readout?.growth ?? null,
    hitPoints,
    id: building.id,
    maxHitPoints,
    name: buildingName(building.buildingType, readout),
    rallyPoint: readout?.rallyPoint ?? null,
    tier: readout?.tier ?? null,
    trainingQueue: readout?.trainingQueue ?? [],
    x: building.x,
    y: building.y,
  };
}

/**
 * Vents to draw. A published list wins; otherwise the layer table's volumes.
 * @param layerId - Snapshot layer id
 * @param published - Vents from `meta.ui`, possibly empty
 * @returns Vent markers
 */
function ventsFor(
  layerId: string | null,
  published: ReadPresentation["vents"],
): ReadPresentation["vents"] {
  if (published.length > 0) return published;
  const layer = findLayer(layerId);
  if (layer === undefined) return [];
  const label = layer.hazards.includes("ember_vents") ? "Ember vent" : "Vent";
  return layer.ventVolumes.map((vent, index) => ({
    id: `${layer.id}-vent-${index}`,
    label,
    radius: vent.radius,
    x: vent.x,
    y: vent.y,
  }));
}

/**
 * Reads one sim snapshot into the shell model. Numbers stay as published.
 * Fog of war is applied here, so every renderer, panel, and the minimap
 * only ever sees what the Hold has discovered.
 * @param snapshot - Frozen sim snapshot
 * @returns The render model
 */
export function buildShellModel(snapshot: SimSnapshot): ShellModel {
  const presentation = readPresentation(snapshot.meta);
  const banner = layerBannerFor(snapshot.layerId);
  const { fog } = presentation;
  return {
    ...presentation,
    banner,
    buildings: visibleToHold(
      snapshot.buildings.map((building) =>
        decorateBuilding(building, presentation.buildings[building.id]),
      ),
      fog,
    ),
    fx: effectsInSight(presentation.fx, fog),
    map: snapshot.map,
    nodes: exploredFeatures(presentation.nodes, fog),
    onboarding: resolveOnboarding(presentation.onboarding, banner.name),
    paused: snapshot.paused,
    resources: snapshot.resources,
    scale: mapDisplayScale(snapshot.map.width),
    speed: snapshot.speed,
    telegraphs: cuesInSight(presentation.telegraphs, fog),
    tick: snapshot.tick,
    units: visibleToHold(
      snapshot.units.map((unit) =>
        decorateUnit(unit, presentation.units[unit.id]),
      ),
      fog,
    ),
    veins: exploredFeatures(presentation.veins, fog),
    vents: exploredFeatures(
      ventsFor(snapshot.layerId, presentation.vents),
      fog,
    ),
  };
}

export type { DescentPresentation };
