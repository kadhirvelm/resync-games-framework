import type { ClassId, RankTitle, ResourceStockpile } from "../types";
import type { CombatClassId, NarrativeBossId, WaveRole } from "../waves/types";

/** Saved-state version for the self-paced exploration scenario. */
export const EXPLORATION_STATE_VERSION = 1;

/** A resource, pill, or rescued-unit prize guarded by one camp. */
export interface ExplorationReward {
  /** Pills added to the Hold's shared inventory. */
  pills?: Readonly<Record<string, number>>;
  /** Stockpile resources hauled home in one cache per resource type. */
  resources?: Partial<ResourceStockpile>;
  /** Living allies who join beside the first receiving storage building. */
  units?: readonly ExplorationRescuedUnit[];
}

/** One group of prisoners who join the Hold after a rescue. */
export interface ExplorationRescuedUnit {
  classId: ClassId;
  count: number;
  /** Rescued soldiers normally start Ashborn; explicit ranks support scenario data. */
  rank?: RankTitle;
}

/** Static combat specification for one camp guard. */
export interface ExplorationGuard {
  bossId?: NarrativeBossId;
  classId: CombatClassId;
  /** Fixed HP/damage scale. Exploration never adds Essence or Pressure scaling. */
  statScale: number;
  role: WaveRole;
}

/** One discovered or undiscovered guarded prize on the map. */
export interface ExplorationCampState {
  /** Whether pills and rescued allies have already reached storage. */
  bonusCollected?: boolean;
  /** Whether resource caches spawned after guards died (or in an old save). */
  cacheSpawned?: boolean;
  cleared: boolean;
  discovered: boolean;
  /** Whether every resource cache reached storage and the camp is complete. */
  rewardCollected?: boolean;
  guards: readonly ExplorationGuard[];
  id: string;
  name: string;
  reward: ExplorationReward;
  /** 1-based player-facing difficulty, not a hidden stat multiplier. */
  threat: number;
  /** Stable wave-clock id shared by every guard in this camp. */
  waveId: string;
  x: number;
  y: number;
}

/** JSON-safe exploration state saved inside the Ashen Gate slice. */
export interface ExplorationState {
  camps: ExplorationCampState[];
  version: typeof EXPLORATION_STATE_VERSION;
}

/** A camp definition before the generator chooses its map position. */
export interface ExplorationCampBlueprint
  extends Omit<ExplorationCampState, "cleared" | "discovered" | "x" | "y"> {
  /** Camps marked by the opening scout report appear before being scouted. */
  rumored?: boolean;
  /** Relative map position; `fromCamp` is used by the nearby tutorial camp. */
  target: {
    fromCamp?: { x: number; y: number };
    x?: number;
    y?: number;
  };
}

/** Ordered, progressively stronger camps. Only the last contains the layer boss. */
export const EXPLORATION_CAMP_BLUEPRINTS: readonly ExplorationCampBlueprint[] =
  [
    {
      guards: [
        { classId: "raider", role: "scout", statScale: 0.38 },
        { classId: "raider", role: "scout", statScale: 0.38 },
      ],
      id: "ashen-scavengers",
      name: "Ashen Scavengers",
      reward: {
        resources: { food: 90, water: 60, wood: 80 },
      },
      rumored: true,
      target: { fromCamp: { x: 22, y: -16 } },
      threat: 1,
      waveId: "exploration:ashen-scavengers",
    },
    {
      guards: [
        { classId: "raider", role: "scout", statScale: 0.52 },
        { classId: "raider", role: "scout", statScale: 0.52 },
        { classId: "hunter", role: "scout", statScale: 0.48 },
      ],
      id: "bound-workers",
      name: "Bound Workers",
      reward: {
        resources: { food: 60, wood: 60 },
        units: [{ classId: "villager", count: 2 }],
      },
      target: { x: 0.34, y: 0.76 },
      threat: 2,
      waveId: "exploration:bound-workers",
    },
    {
      guards: [
        { classId: "warden", role: "swarm", statScale: 0.62 },
        { classId: "raider", role: "swarm", statScale: 0.62 },
        { classId: "raider", role: "swarm", statScale: 0.62 },
        { classId: "hunter", role: "swarm", statScale: 0.58 },
      ],
      id: "pillkeeper-refuge",
      name: "Pillkeeper's Refuge",
      reward: {
        pills: { body_pill: 1, ember_dao_pill: 1, wind_pill: 1 },
        resources: { essence: 35, spirit_herbs: 20 },
      },
      target: { x: 0.47, y: 0.23 },
      threat: 3,
      waveId: "exploration:pillkeeper-refuge",
    },
    {
      guards: [
        { classId: "warden", role: "elite", statScale: 0.78 },
        { classId: "warden", role: "swarm", statScale: 0.72 },
        { classId: "hunter", role: "swarm", statScale: 0.72 },
        { classId: "hunter", role: "swarm", statScale: 0.72 },
        { classId: "adept", role: "escort", statScale: 0.62 },
      ],
      id: "ember-monastery",
      name: "Ember Monastery",
      reward: {
        pills: { body_pill: 1, wind_pill: 1 },
        resources: { essence: 60, iron: 25, spirit_herbs: 30 },
      },
      target: { x: 0.61, y: 0.75 },
      threat: 4,
      waveId: "exploration:ember-monastery",
    },
    {
      guards: [
        { classId: "warden", role: "elite", statScale: 0.9 },
        { classId: "raider", role: "swarm", statScale: 0.84 },
        { classId: "raider", role: "swarm", statScale: 0.84 },
        { classId: "hunter", role: "swarm", statScale: 0.82 },
        { classId: "hunter", role: "swarm", statScale: 0.82 },
        { classId: "rider", role: "escort", statScale: 0.78 },
      ],
      id: "ashbound-prison",
      name: "Ashbound Prison",
      reward: {
        pills: { blood_dao_pill: 1 },
        resources: { essence: 80 },
        units: [
          { classId: "warden", count: 1 },
          { classId: "hunter", count: 1 },
          { classId: "sword_sage", count: 1 },
        ],
      },
      target: { x: 0.76, y: 0.24 },
      threat: 5,
      waveId: "exploration:ashbound-prison",
    },
    {
      guards: [
        {
          bossId: "cinderjaw",
          classId: "raider",
          role: "boss",
          statScale: 1,
        },
        { classId: "raider", role: "escort", statScale: 0.9 },
        { classId: "raider", role: "escort", statScale: 0.9 },
        { classId: "raider", role: "escort", statScale: 0.9 },
        { classId: "hunter", role: "escort", statScale: 0.86 },
        { classId: "hunter", role: "escort", statScale: 0.86 },
      ],
      id: "cinderjaw-hoard",
      name: "Cinderjaw's Hoard",
      reward: {
        pills: { blood_dao_pill: 1, ember_dao_pill: 1, rime_dao_pill: 1 },
        resources: { essence: 150, iron: 40, stone: 60 },
        units: [{ classId: "formation_master", count: 1 }],
      },
      target: { x: 0.9, y: 0.5 },
      threat: 6,
      waveId: "exploration:cinderjaw-hoard",
    },
  ];

/** Readable class names used by reward summaries. */
const CLASS_NAMES: Readonly<Partial<Record<ClassId, string>>> = {
  cultivator: "Sword Cultivator",
  formation_master: "Formation Master",
  hunter: "Hunter",
  sword_sage: "Flying-Sword Cultivator",
  villager: "Villager",
  warden: "Warden",
};

/** Readable resource names in stable stockpile order. */
const RESOURCE_NAMES: Readonly<Record<string, string>> = {
  coin: "Coin",
  essence: "Essence",
  food: "Food",
  iron: "Iron",
  spirit_herbs: "Spirit Herbs",
  stone: "Stone",
  water: "Water",
  wood: "Wood",
};

/** Readable pill names for prizes the player can inspect before fighting. */
const PILL_NAMES: Readonly<Record<string, string>> = {
  blood_dao_pill: "Blood Dao Pill",
  body_pill: "Body Pill",
  breakthrough_pill: "Breakthrough Pill",
  ember_dao_pill: "Ember Dao Pill",
  rime_dao_pill: "Rime Dao Pill",
  spirit_pill: "Spirit Pill",
  wind_pill: "Wind Pill",
};

/**
 * Formats every part of a camp prize for its tracker, inspection card, and toast.
 * @param reward - Guarded resources, pills, and rescued allies
 * @returns One compact player-facing summary
 */
export function formatExplorationReward(reward: ExplorationReward): string {
  const parts: string[] = [];
  for (const [resource, amount] of Object.entries(reward.resources ?? {})) {
    if (amount === undefined || amount <= 0) continue;
    parts.push(`+${amount} ${RESOURCE_NAMES[resource] ?? resource}`);
  }
  for (const [pillId, count] of Object.entries(reward.pills ?? {})) {
    if (count <= 0) continue;
    parts.push(
      `${PILL_NAMES[pillId] ?? pillId}${count === 1 ? "" : ` ×${count}`}`,
    );
  }
  for (const group of reward.units ?? []) {
    if (group.count <= 0) continue;
    const name =
      CLASS_NAMES[group.classId] ?? group.classId.replaceAll("_", " ");
    parts.push(`Rescue ${group.count} ${name}${group.count === 1 ? "" : "s"}`);
  }
  return parts.length === 0 ? "No published reward" : parts.join(" · ");
}

/**
 * Counts guard classes for an at-a-glance camp inspection.
 * @param camp - Camp whose static guard roster is read
 * @returns Class totals in first-appearance order
 */
export function explorationGuardComposition(
  camp: Pick<ExplorationCampState, "guards">,
): Partial<Record<ClassId, number>> {
  const composition: Partial<Record<ClassId, number>> = {};
  for (const guard of camp.guards) {
    composition[guard.classId] = (composition[guard.classId] ?? 0) + 1;
  }
  return composition;
}
