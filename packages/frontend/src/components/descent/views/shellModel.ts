import { BUILDING_TOOLTIPS } from "../data/narrative/tooltips";
import type { CultivationView } from "../logic/cultivation/types";
import { footprintSide } from "../logic/economy/footprint";
import { isFogVisible } from "../logic/fog";
import type {
  BuildingState,
  ResourceId,
  SimSnapshot,
  UnitState,
} from "../logic/types";
import { BOSS_SIZE_SCALE } from "../logic/waves/constants";
import { cuesInSight, effectsInSight, exploredFeatures } from "./fogFilter";
import {
  type BuildingReadout,
  type CropGrowthReadout,
  type DescentPresentation,
  type OnboardingFlags,
  type QiArtReadout,
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
  /** Breakthrough channel progress, 0 to 1, while channeling; otherwise null. */
  breakthroughProgress: number | null;
  /** True when the unit satisfies every requirement to attempt a breakthrough. */
  breakthroughReady: boolean;
  /** Remaining seconds on an active breakthrough channel; otherwise null. */
  breakthroughRemainingSeconds: number | null;
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
  /** Whether a cultivator stands inside a Spirit Gathering Array aura. */
  inSpiritArray: boolean;
  maxHitPoints: number | null;
  /** Maximum Qi pool for cultivators, or null for non-cultivators. */
  maxQi: number | null;
  /** Whether a cultivator is currently meditating in seclusion. */
  meditating: boolean;
  name: string;
  /** Assigned co-op ring color in multiplayer matches. */
  ownerColor?: string;
  /** Owning player id in multiplayer matches. */
  ownerId?: string;
  /** Owning player display name in multiplayer matches. */
  ownerName?: string;
  /** Current Qi pool for cultivators, or null for non-cultivators. */
  qi: number | null;
  /** Active Qi Art available to a cultivator, or null. */
  qiArt: QiArtReadout | null;
  /** Where a Hold unit is headed: current destination, then queued legs. */
  route?: readonly RouteReadout[];
  /** Whether a Spirit Surge combat buff is active. */
  surgeActive: boolean;
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
  /** Assigned co-op ring color in multiplayer matches. */
  ownerColor?: string;
  /** Owning player id in multiplayer matches. */
  ownerId?: string;
  /** Owning player display name in multiplayer matches. */
  ownerName?: string;
  rallyPoint: { nodeId?: string; x: number; y: number } | null;
  tier: string | null;
  trainingQueue: readonly TrainingQueueReadout[];
  x: number;
  y: number;
}

/** Everything the shell renders from one snapshot. */
export interface ShellModel
  extends Omit<
    ReadPresentation,
    | "buildings"
    | "buildOptionsByOwner"
    | "holdTiers"
    | "holdUpgrades"
    | "onboarding"
    | "units"
  > {
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
const EMPTY_ROUTE: readonly RouteReadout[] = [];
const EMPTY_TREASURES: readonly { id: string; name: string }[] = [];
const EMPTY_TRAINING_QUEUE: readonly TrainingQueueReadout[] = [];
const FIRST_RUN_ONBOARDING: OnboardingFlags = {
  pill: true,
  realmGate: true,
  school: true,
};
const EMPTY_ONBOARDING: OnboardingFlags = {
  pill: false,
  realmGate: false,
  school: false,
};
const DEFAULT_VENTS_CACHE = new Map<string, ReadPresentation["vents"]>();

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
  return layerName === "Ashen Gate" ? FIRST_RUN_ONBOARDING : EMPTY_ONBOARDING;
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
  if (buildingType === "stone_quarry") return "Stone Quarry";
  return TOOLTIPS[buildingType]?.name ?? buildingType;
}

/**
 * Keeps only well-formed route points from a published readout.
 * @param route - Published route, if any
 * @returns Finite route points in walking order
 */
function readRoute(route: unknown): readonly RouteReadout[] {
  if (!Array.isArray(route) || route.length === 0) return EMPTY_ROUTE;
  const result: RouteReadout[] = [];
  for (let i = 0; i < route.length; i += 1) {
    const point = route[i] as RouteReadout | null;
    if (
      typeof point === "object" &&
      point !== null &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y)
    ) {
      result.push(point);
    }
  }
  return result.length === 0 ? EMPTY_ROUTE : result;
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
  const result: ShellUnit = {
    activity: typeof readout?.task === "string" ? readout.task : null,
    boss: readout?.role === "boss",
    breakthroughProgress:
      typeof readout?.channel === "number"
        ? Math.max(0, Math.min(1, readout.channel))
        : null,
    breakthroughReady: readout?.breakthroughReady === true,
    breakthroughRemainingSeconds:
      typeof readout?.breakthroughRemainingSeconds === "number"
        ? Math.max(0, Math.ceil(readout.breakthroughRemainingSeconds))
        : null,
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
    inSpiritArray: readout?.inSpiritArray === true,
    maxHitPoints:
      typeof readout?.maxHitPoints === "number" ? readout.maxHitPoints : null,
    maxQi: typeof readout?.maxQi === "number" ? readout.maxQi : null,
    meditating: readout?.meditating === true,
    name: readout?.name ?? CLASS_LABEL[unit.classId],
    qi: typeof readout?.qi === "number" ? readout.qi : null,
    qiArt: readout?.qiArt ?? null,
    route: readRoute(readout?.route),
    surgeActive: readout?.surgeActive === true,
    treasureSlots: readout?.treasureSlots ?? 0,
    treasures: readout?.treasures ?? EMPTY_TREASURES,
    x: unit.x,
    y: unit.y,
  };
  if (readout?.ownerColor !== undefined) {
    result.ownerColor = readout.ownerColor;
  }
  const ownerId = unit.ownerId ?? readout?.ownerId;
  if (ownerId !== undefined) {
    result.ownerId = ownerId;
  }
  if (readout?.ownerName !== undefined) {
    result.ownerName = readout.ownerName;
  }
  return result;
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
  const hitPoints =
    typeof readout?.hitPoints === "number" ? readout.hitPoints : null;
  const maxHitPoints =
    typeof readout?.maxHitPoints === "number" ? readout.maxHitPoints : null;
  const result: ShellBuilding = {
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
    trainingQueue: readout?.trainingQueue ?? EMPTY_TRAINING_QUEUE,
    x: building.x,
    y: building.y,
  };
  if (readout?.ownerColor !== undefined) {
    result.ownerColor = readout.ownerColor;
  }
  const ownerId = building.ownerId ?? readout?.ownerId;
  if (ownerId !== undefined) {
    result.ownerId = ownerId;
  }
  if (readout?.ownerName !== undefined) {
    result.ownerName = readout.ownerName;
  }
  return result;
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
  if (layerId === null) return [];
  const cached = DEFAULT_VENTS_CACHE.get(layerId);
  if (cached !== undefined) return cached;
  const layer = findLayer(layerId);
  if (layer === undefined) return [];
  const label = layer.hazards.includes("ember_vents") ? "Ember vent" : "Vent";
  const vents = layer.ventVolumes.map((vent, index) => ({
    id: `${layer.id}-vent-${index}`,
    label,
    radius: vent.radius,
    x: vent.x,
    y: vent.y,
  }));
  DEFAULT_VENTS_CACHE.set(layerId, vents);
  return vents;
}

/**
 * Reads one sim snapshot into the shell model. Numbers stay as published.
 * Fog of war is applied here, so every renderer, panel, and the minimap
 * only ever sees what the Hold has discovered. In co-op, Hold-specific
 * readouts are selected for the local owner without hiding allied entities.
 * @param snapshot - Frozen sim snapshot
 * @param localPlayerId - Local co-op owner, or undefined in solo play
 * @returns The render model
 */
export function buildShellModel(
  snapshot: SimSnapshot,
  localPlayerId?: string,
): ShellModel {
  const presentation = readPresentation(snapshot.meta);
  const { buildOptionsByOwner, holdTiers, holdUpgrades, ...shared } =
    presentation;
  const holdTier =
    localPlayerId !== undefined && Object.hasOwn(holdTiers, localPlayerId)
      ? (holdTiers[localPlayerId] ?? shared.holdTier)
      : shared.holdTier;
  const holdUpgrade =
    localPlayerId !== undefined && Object.hasOwn(holdUpgrades, localPlayerId)
      ? (holdUpgrades[localPlayerId] ?? null)
      : shared.holdUpgrade;
  const buildOptions =
    localPlayerId === undefined
      ? shared.buildOptions
      : (buildOptionsByOwner[localPlayerId] ?? shared.buildOptions);
  const banner = layerBannerFor(snapshot.layerId);
  const { fog } = shared;

  const buildings: ShellBuilding[] = [];
  for (let i = 0; i < snapshot.buildings.length; i += 1) {
    const building = snapshot.buildings[i];
    if (building === undefined) continue;
    const readout = presentation.buildings[building.id];
    if (
      fog !== null &&
      readout?.factionId === "horde" &&
      !isFogVisible(fog, building)
    ) {
      continue;
    }
    buildings.push(decorateBuilding(building, readout));
  }

  const units: ShellUnit[] = [];
  for (let i = 0; i < snapshot.units.length; i += 1) {
    const unit = snapshot.units[i];
    if (unit === undefined) continue;
    const readout = presentation.units[unit.id];
    if (
      fog !== null &&
      readout?.factionId === "horde" &&
      !isFogVisible(fog, unit)
    ) {
      continue;
    }
    units.push(decorateUnit(unit, readout));
  }

  return {
    ...shared,
    banner,
    buildings,
    buildOptions,
    fx: effectsInSight(presentation.fx, fog),
    holdTier,
    holdUpgrade,
    map: snapshot.map,
    nodes: exploredFeatures(presentation.nodes, fog),
    onboarding: resolveOnboarding(presentation.onboarding, banner.name),
    paused: snapshot.paused,
    resources: snapshot.resources,
    scale: mapDisplayScale(snapshot.map.width),
    speed: snapshot.speed,
    telegraphs: cuesInSight(presentation.telegraphs, fog),
    terrain: exploredFeatures(presentation.terrain, fog),
    tick: snapshot.tick,
    units,
    veins: exploredFeatures(presentation.veins, fog),
    vents: exploredFeatures(
      ventsFor(snapshot.layerId, presentation.vents),
      fog,
    ),
  };
}

export type { DescentPresentation };
