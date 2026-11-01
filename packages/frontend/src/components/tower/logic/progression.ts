import { MAX_ASCENSION } from "./generateTower";
import { DEFAULT_RUN_OPTIONS, findTemplate, type RunOptions } from "./run";
import type {
  CorebornRole,
  RunState,
  TierNumber,
  TowerContent,
} from "./towerTypes";

/**
 * Permanent progress across climbs: Jade Essence earned at the end of each
 * climb buys cultivation upgrades, and beating a tower unlocks its next
 * ascension. Everything here is pure so it can be saved as plain JSON.
 */

/** Version written into saved profiles. Bump when the shape changes. */
const PROFILE_VERSION = 1;

/** Climbs kept in the profile's history, newest first. */
export const HISTORY_LIMIT = 12;

/** Ids of the permanent cultivation upgrades. */
export type UpgradeId =
  | "tempered-body"
  | "wider-calling"
  | "remembered-form"
  | "jade-respite"
  | "kindred-bond"
  | "fates-thread";

/** One permanent upgrade and what each of its ranks costs and grants. */
export interface UpgradeDefinition {
  /** Essence for each rank, first rank first */
  costs: number[];
  /** What one rank grants, written for the upgrade screen */
  effect: string;
  id: UpgradeId;
  lore: string;
  name: string;
}

/** Every upgrade, in the order the cultivation screen shows them. */
export const UPGRADES: UpgradeDefinition[] = [
  {
    costs: [20, 45, 80],
    effect: "+4 maximum health for your cultivator",
    id: "tempered-body",
    lore: "Qi settles into bone and sinew. The climb asks less of you.",
    name: "Tempered Body",
  },
  {
    costs: [25, 55, 100],
    effect: "Survivors recover 3 health after every won battle",
    id: "jade-respite",
    lore: "Between floors, the party breathes with the tower.",
    name: "Jade Respite",
  },
  {
    costs: [30, 70],
    effect: "+1 Coreborn to choose from in the opening draft",
    id: "wider-calling",
    lore: "Your call carries further, and more answer it.",
    name: "Wider Calling",
  },
  {
    costs: [30, 75],
    effect: "Recruited Coreborn gain +3 maximum health",
    id: "kindred-bond",
    lore: "Coreborn who walk beside you stand a little sturdier.",
    name: "Kindred Bond",
  },
  {
    costs: [35, 90],
    effect: "Begin each climb with one extra technique",
    id: "remembered-form",
    lore: "Some forms survive the fall and return with you.",
    name: "Remembered Form",
  },
  {
    costs: [40, 90],
    effect: "Reroll one reward offer each climb",
    id: "fates-thread",
    lore: "Pull a thread, and the tower offers something else.",
    name: "Fate's Thread",
  },
];

/** Ranks the player owns, keyed by upgrade id. Missing means rank 0. */
type UpgradeRanks = Partial<Record<UpgradeId, number>>;

/** Best results on one tower. */
interface TowerRecord {
  /** Highest floor reached, counting the floor the climb ended on */
  bestFloor: number;
  climbs: number;
  /** Highest ascension beaten. -1 until the tower is beaten once. */
  highestAscensionCleared: number;
  title: string;
  victories: number;
}

/** A Coreborn the player has recruited at least once. */
interface CodexCoreborn {
  bestTier: TierNumber;
  name: string;
  portraitUrl?: string;
  role: CorebornRole;
  towerTitle: string;
}

/** An enemy the player has defeated at least once. */
interface CodexEnemy {
  /** Whether it has also been beaten as a Tower Heart */
  bossDefeated: boolean;
  imageUrl?: string;
  name: string;
  towerTitle: string;
}

/** One finished climb, for the chronicle. */
interface ClimbHistoryEntry {
  ascension: number;
  endedAt: number;
  essence: number;
  floor: number;
  floorCount: number;
  outcome: "victory" | "defeat";
  towerId: string;
  towerTitle: string;
}

/** Lifetime counts across every climb. */
interface ProfileTotals {
  climbs: number;
  floorsCleared: number;
  merges: number;
  recruited: number;
  victories: number;
}

/** Everything that persists between climbs. */
export interface PlayerProfile {
  codex: {
    coreborn: Record<string, CodexCoreborn>;
    enemies: Record<string, CodexEnemy>;
  };
  /** Essence available to spend */
  essence: number;
  /** Climbs, newest first */
  history: ClimbHistoryEntry[];
  /** Essence ever earned, spent or not */
  lifetimeEssence: number;
  totals: ProfileTotals;
  towers: Record<string, TowerRecord>;
  upgrades: UpgradeRanks;
  version: typeof PROFILE_VERSION;
}

/**
 * @returns A profile for a player who has never climbed
 */
export function createProfile(): PlayerProfile {
  return {
    codex: { coreborn: {}, enemies: {} },
    essence: 0,
    history: [],
    lifetimeEssence: 0,
    totals: {
      climbs: 0,
      floorsCleared: 0,
      merges: 0,
      recruited: 0,
      victories: 0,
    },
    towers: {},
    upgrades: {},
    version: PROFILE_VERSION,
  };
}

/**
 * Reads a stored profile, keeping whatever fields are valid and filling the
 * rest with defaults, so a damaged save never blocks the game.
 * @param raw - Parsed JSON from storage
 * @returns A usable profile
 */
export function parseProfile(raw: unknown): PlayerProfile {
  const fresh = createProfile();
  if (!isRecord(raw) || raw.version !== PROFILE_VERSION) {
    return fresh;
  }
  const codex = isRecord(raw.codex) ? raw.codex : {};
  return {
    codex: {
      coreborn: recordOr(codex.coreborn) as PlayerProfile["codex"]["coreborn"],
      enemies: recordOr(codex.enemies) as PlayerProfile["codex"]["enemies"],
    },
    essence: numberOr(raw.essence, 0),
    history: Array.isArray(raw.history)
      ? (raw.history.slice(0, HISTORY_LIMIT) as ClimbHistoryEntry[])
      : [],
    lifetimeEssence: numberOr(raw.lifetimeEssence, 0),
    totals: { ...fresh.totals, ...recordOr(raw.totals) },
    towers: recordOr(raw.towers) as PlayerProfile["towers"],
    upgrades: recordOr(raw.upgrades) as UpgradeRanks,
    version: PROFILE_VERSION,
  };
}

/**
 * @param profile - Player profile
 * @param id - Upgrade id
 * @returns Ranks owned, from 0
 */
export function upgradeRank(profile: PlayerProfile, id: UpgradeId): number {
  return profile.upgrades[id] ?? 0;
}

/**
 * @param id - Upgrade id
 * @returns The upgrade's definition
 */
function findUpgrade(id: UpgradeId): UpgradeDefinition {
  return UPGRADES.find((upgrade) => upgrade.id === id) as UpgradeDefinition;
}

/**
 * @param profile - Player profile
 * @param id - Upgrade id
 * @returns Essence the next rank costs, or `undefined` at the top rank
 */
export function nextUpgradeCost(
  profile: PlayerProfile,
  id: UpgradeId,
): number | undefined {
  return findUpgrade(id).costs[upgradeRank(profile, id)];
}

/**
 * Buys the next rank of an upgrade.
 * @param profile - Player profile
 * @param id - Upgrade to rank up
 * @returns The profile with the rank and less essence, or the same profile
 * when the upgrade is maxed or unaffordable
 */
export function purchaseUpgrade(
  profile: PlayerProfile,
  id: UpgradeId,
): PlayerProfile {
  const cost = nextUpgradeCost(profile, id);
  if (cost === undefined || profile.essence < cost) {
    return profile;
  }
  return {
    ...profile,
    essence: profile.essence - cost,
    upgrades: { ...profile.upgrades, [id]: upgradeRank(profile, id) + 1 },
  };
}

/**
 * @param profile - Player profile
 * @param towerId - Tower content id
 * @returns Highest ascension the player may start this tower at
 */
export function unlockedAscension(
  profile: PlayerProfile,
  towerId: string,
): number {
  const cleared = profile.towers[towerId]?.highestAscensionCleared ?? -1;
  return Math.min(MAX_ASCENSION, cleared + 1);
}

/**
 * Turns the player's upgrades into the bonuses a new climb starts with.
 * @param profile - Player profile
 * @param ascension - Ascension chosen for this climb
 * @returns Options for `startRun`
 */
export function runOptionsFor(
  profile: PlayerProfile,
  ascension: number,
): RunOptions {
  return {
    ...DEFAULT_RUN_OPTIONS,
    ascension,
    cultivatorBonusHitPoints: 4 * upgradeRank(profile, "tempered-body"),
    extraDraftOptions: upgradeRank(profile, "wider-calling"),
    extraTechniques: upgradeRank(profile, "remembered-form"),
    modifiers: {
      corebornBonusHitPoints: 3 * upgradeRank(profile, "kindred-bond"),
      rerollsLeft: upgradeRank(profile, "fates-thread"),
      respiteHealing: 3 * upgradeRank(profile, "jade-respite"),
    },
  };
}

/** Essence for each floor cleared. */
export const ESSENCE_PER_FLOOR = 5;

/** Essence for quieting the Tower Heart. */
export const ESSENCE_VICTORY_BONUS = 30;

/** Extra share of essence for each ascension level. */
export const ESSENCE_ASCENSION_BONUS = 0.25;

/** How a climb's essence adds up, for the end screen tally. */
export interface EssenceBreakdown {
  ascensionBonus: number;
  floors: number;
  merges: number;
  recruits: number;
  total: number;
  victory: number;
}

/**
 * @param run - Finished climb
 * @returns Essence earned and where each part came from
 */
export function climbEssence(run: RunState): EssenceBreakdown {
  const floors = run.stats.battlesWon * ESSENCE_PER_FLOOR;
  const victory = run.phase === "victory" ? ESSENCE_VICTORY_BONUS : 0;
  const merges = run.stats.merges * 3;
  const recruits = run.stats.recruited;
  const base = floors + victory + merges + recruits;
  const ascensionBonus = Math.round(
    base * run.ascension * ESSENCE_ASCENSION_BONUS,
  );
  return {
    ascensionBonus,
    floors,
    merges,
    recruits,
    total: base + ascensionBonus,
    victory,
  };
}

/** What a finished climb changed, for the end screen. */
export interface ClimbSummary {
  essence: EssenceBreakdown;
  /** Whether this climb reached a higher floor than any before on this tower */
  newBestFloor: boolean;
  /** Ascension unlocked by this victory, when it opened a new one */
  unlockedAscension?: number;
}

/**
 * Records new Coreborn and defeated enemies from the climb so far. Safe to
 * call after every change: it only ever adds or raises entries.
 * @param profile - Player profile
 * @param content - Tower content
 * @param run - Current climb
 * @returns The profile with any new discoveries, or the same object when
 * nothing changed
 */
export function recordDiscoveries(
  profile: PlayerProfile,
  content: TowerContent,
  run: RunState,
): PlayerProfile {
  let coreborn = profile.codex.coreborn;
  let enemies = profile.codex.enemies;

  for (const member of run.party) {
    const template = findTemplate(content, member.templateId);
    if (member.kind !== "coreborn" || !template) {
      continue;
    }
    const key = `${content.id}:${template.id}`;
    const known = coreborn[key];
    if (known && known.bestTier >= member.tier) {
      continue;
    }
    coreborn = {
      ...coreborn,
      [key]: {
        bestTier: member.tier,
        name: template.name,
        portraitUrl:
          template.tiers[member.tier - 1]?.portraitUrl ?? known?.portraitUrl,
        role: template.role,
        towerTitle: content.title,
      },
    };
  }

  run.rooms.forEach((room, index) => {
    if (!isRoomCleared(run, index)) {
      return;
    }
    for (const enemy of room.enemies) {
      const key = `${content.id}:${enemy.templateId}`;
      const known = enemies[key];
      if (known && (known.bossDefeated || !enemy.isBoss)) {
        continue;
      }
      const template = content.enemies.find(
        (entry) => entry.id === enemy.templateId,
      );
      enemies = {
        ...enemies,
        [key]: {
          bossDefeated: enemy.isBoss || (known?.bossDefeated ?? false),
          imageUrl: enemy.imageUrl,
          name: template?.name ?? enemy.name,
          towerTitle: content.title,
        },
      };
    }
  });

  if (
    coreborn === profile.codex.coreborn &&
    enemies === profile.codex.enemies
  ) {
    return profile;
  }
  return { ...profile, codex: { coreborn, enemies } };
}

/**
 * @param run - Current climb
 * @param index - Room index
 * @returns Whether that room's battle has been won
 */
function isRoomCleared(run: RunState, index: number): boolean {
  if (index < run.floorIndex) {
    return true;
  }
  return (
    index === run.floorIndex &&
    (run.phase === "reward" || run.phase === "victory")
  );
}

/**
 * Banks a finished climb: essence, totals, the tower's record, the history
 * line, and any last discoveries.
 * @param profile - Player profile
 * @param content - Tower content
 * @param run - Climb that ended in victory or defeat
 * @param endedAt - Timestamp in milliseconds
 * @returns The updated profile and what changed
 */
export function settleClimb(
  profile: PlayerProfile,
  content: TowerContent,
  run: RunState,
  endedAt: number,
): { profile: PlayerProfile; summary: ClimbSummary } {
  const essence = climbEssence(run);
  const victory = run.phase === "victory";
  const floor = run.floorIndex + 1;
  const previous = profile.towers[content.id];
  const clearedBefore = previous?.highestAscensionCleared ?? -1;
  const highestAscensionCleared = victory
    ? Math.max(clearedBefore, run.ascension)
    : clearedBefore;
  const record: TowerRecord = {
    bestFloor: Math.max(previous?.bestFloor ?? 0, floor),
    climbs: (previous?.climbs ?? 0) + 1,
    highestAscensionCleared,
    title: content.title,
    victories: (previous?.victories ?? 0) + (victory ? 1 : 0),
  };
  const entry: ClimbHistoryEntry = {
    ascension: run.ascension,
    endedAt,
    essence: essence.total,
    floor,
    floorCount: run.rooms.length,
    outcome: victory ? "victory" : "defeat",
    towerId: content.id,
    towerTitle: content.title,
  };
  const discovered = recordDiscoveries(profile, content, run);
  const opened =
    highestAscensionCleared > clearedBefore &&
    highestAscensionCleared < MAX_ASCENSION
      ? highestAscensionCleared + 1
      : undefined;
  return {
    profile: {
      ...discovered,
      essence: profile.essence + essence.total,
      history: [entry, ...profile.history].slice(0, HISTORY_LIMIT),
      lifetimeEssence: profile.lifetimeEssence + essence.total,
      totals: {
        climbs: profile.totals.climbs + 1,
        floorsCleared: profile.totals.floorsCleared + run.stats.battlesWon,
        merges: profile.totals.merges + run.stats.merges,
        recruited: profile.totals.recruited + run.stats.recruited,
        victories: profile.totals.victories + (victory ? 1 : 0),
      },
      towers: { ...profile.towers, [content.id]: record },
    },
    summary: {
      essence,
      newBestFloor: floor > (previous?.bestFloor ?? 0),
      unlockedAscension: opened,
    },
  };
}

/** Name and one-line description for each ascension level. */
export const ASCENSION_NAMES = [
  "The First Climb",
  "Restless Stone",
  "Thorned Halls",
  "Hungering Roots",
  "Withered Light",
  "Heart of Thorns",
] as const;

/**
 * @param value - Anything
 * @returns Whether it is a plain object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param value - Anything
 * @returns The value when it is a plain object, otherwise an empty one
 */
function recordOr(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/**
 * @param value - Anything
 * @param fallback - Value for anything that is not a finite number
 * @returns A finite, non-negative number
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}
