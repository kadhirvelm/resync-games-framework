import type { CultivationView, PillPreview } from "../logic/cultivation/types";
import { type FogOfWarState, isFogOfWarState } from "../logic/fog";
import type { TerrainFeatureKind } from "../logic/layers";
import type { PlayerScoreBreakdown } from "../logic/scoring";
import type {
  ClassId,
  RankTitle,
  ResourceId,
  ResourceStockpile,
  SchoolId,
} from "../logic/types";

/** Active Qi Art summary published for a selected cultivator. */
export interface QiArtReadout {
  cooldownSeconds: number;
  description: string;
  name: string;
  qiCost: number;
  ready: boolean;
  school?: SchoolId;
}

/** Published decoration for one sim unit. The view does not invent these numbers. */
export interface UnitReadout {
  /** Elite affix on a horde body. */
  affix?: string | null;
  /** Completed Cultivation Hall id for breakthrough, omitted for Captain battlefield breakthrough. */
  breakthroughHallId?: string;
  /** Whether this unit currently satisfies every breakthrough requirement. */
  breakthroughReady?: boolean;
  /** Seconds remaining on an active breakthrough channel, when channeling. */
  breakthroughRemainingSeconds?: number;
  calamity?: boolean;
  /** Resource a villager is carrying home. */
  carrying?: ResourceId | null;
  /** How much of `carrying` the villager holds. */
  carryingAmount?: number;
  /** Breakthrough channel progress, 0 to 1, while channeling. */
  channel?: number;
  cultivation?: CultivationView;
  factionId?: "hold" | "horde";
  /** Whether rations are active on this unit. */
  fed?: boolean;
  hero?: boolean;
  hitPoints?: number;
  /** A villager with no job and no shelter, waiting for orders. */
  idle?: boolean;
  /** Whether a cultivator stands inside a Spirit Gathering Array aura. */
  inSpiritArray?: boolean;
  /** Recovering from a failed breakthrough. */
  injured?: boolean;
  maxHitPoints?: number;
  /** Maximum Qi pool for cultivators. */
  maxQi?: number;
  /** Whether a cultivator is currently meditating in seclusion. */
  meditating?: boolean;
  name?: string;
  /** Assigned co-op ring color in multiplayer matches. */
  ownerColor?: string;
  /** Owning player id in multiplayer matches. */
  ownerId?: string;
  /** Owning player display name in multiplayer matches. */
  ownerName?: string;
  /** Current Qi pool for cultivators. */
  qi?: number;
  /** Active Qi Art available to a cultivator. */
  qiArt?: QiArtReadout;
  rank?: RankTitle;
  /**
   * Where a Hold unit is headed: its current destination, then each
   * shift-queued leg. Omitted while it stands still.
   */
  route?: readonly RouteReadout[];
  /** Horde role: scout, swarm, elite, boss, fodder, ... */
  role?: string;
  school?: SchoolId;
  /** This layer's multiplier for the unit's school. */
  schoolModifier?: number;
  /** Whether a Spirit Surge buff is currently active. */
  surgeActive?: boolean;
  /** What a villager is doing. */
  task?: string;
  treasureSlots?: number;
  treasures?: readonly { id: string; name: string }[];
}

/** One point on a unit's route. */
export interface RouteReadout {
  /** Whether the leg is an attack-move. */
  attack: boolean;
  x: number;
  y: number;
}

/** Published decoration for one sim building. */
export interface BuildingReadout {
  /** What the building is busy with, e.g. "Training 5 Wardens". */
  activity?: string;
  constructing?: boolean;
  factionId?: "hold" | "horde";
  hitPoints?: number;
  maxHitPoints?: number;
  name?: string;
  /** Assigned co-op ring color in multiplayer matches. */
  ownerColor?: string;
  /** Owning player id in multiplayer matches. */
  ownerId?: string;
  /** Owning player display name in multiplayer matches. */
  ownerName?: string;
  /** Crop growth for a harvested producer; ripe crops wait for a villager. */
  growth?: CropGrowthReadout;
  /** Whether it sits on a Spirit Vein. */
  onVein?: boolean;
  /** Progress of `activity`, 0 to 1. */
  progress?: number;
  /** Batches queued, including the one in progress. */
  queue?: number;
  /** Destination assigned to units as they finish training. */
  rallyPoint?: { nodeId?: string; x: number; y: number };
  tier?: string;
  /** Ordered training batches, with the head carrying live progress. */
  trainingQueue?: readonly TrainingQueueReadout[];
}

/** How far a harvested producer's crop has grown. */
export interface CropGrowthReadout {
  /** Growth from 0 to 1. */
  progress: number;
  /** Whether it is fully grown and waiting for a harvester. */
  ripe: boolean;
}

/** One order shown in a training building's queue. */
export interface TrainingQueueReadout {
  classId: ClassId;
  count: number;
  /** Training job id, used to cancel this order. */
  id: string;
  label: string;
  /** Zero for waiting batches; live 0–1 progress for the head. */
  progress: number;
}

/** A toast with a stable id so the view shows it once. */
export interface NoticeReadout {
  id: number;
  text: string;
  tone: "bad" | "good" | "info" | "warn";
}

/** A short-lived visual cue. Positions are map units; `tick` is sim time. */
export type FxReadout =
  | {
      from: { x: number; y: number };
      id: number;
      kind: "heal" | "melee" | "projectile";
      /** Distinguishes arrows from cultivation bolts for audio. */
      sound?: "magic" | "projectile";
      tick: number;
      to: { x: number; y: number };
    }
  | {
      amount: number;
      critical: boolean;
      id: number;
      kind: "damage";
      tick: number;
      x: number;
      y: number;
    }
  | {
      id: number;
      kind: "ascend" | "collapse" | "death";
      /** Distinguishes a destroyed structure from a boss ground impact. */
      sound?: "building" | "impact";
      tick: number;
      x: number;
      y: number;
    }
  | {
      id: number;
      kind: "spawn";
      /** Which kind of unit was born, so each gets its own audio cue. */
      sound?: "soldier" | "villager";
      tick: number;
      x: number;
      y: number;
    }
  | {
      id: number;
      kind: "qi_nova";
      radius: number;
      school?: SchoolId;
      tick: number;
      x: number;
      y: number;
    };

/** The next scheduled wave. The countdown is public; the mix needs an Omen. */
export interface WaveReadout {
  /** Whether the player may call the next wave early for a supply bonus. */
  canCallEarly: boolean;
  /** Formatted resource bonus awarded when calling the next wave early now. */
  earlyCallBonusLabel?: string;
  /** Seconds until it spawns, or null once every wave has spawned. */
  etaSeconds: number | null;
  /** 1-based number of the next wave. */
  index: number;
  label: string;
  /** Horde bodies currently on the field. */
  live: number;
  total: number;
  type: "boss" | "elite" | "scout" | "swarm";
  /** Whether the wave clock is paused by an external hold (e.g. tutorial). */
  waveHeld?: boolean;
}

/** The living boss, for the boss bar. */
export interface BossReadout {
  hitPoints: number;
  maxHitPoints: number;
  name: string;
  title: string;
  unitId: string;
}

/** One teaching objective. */
export interface ObjectiveReadout {
  done: boolean;
  id: string;
  label: string;
}

/** Run totals. */
export interface StatsReadout {
  elapsedSeconds: number;
  kills: number;
  lost: number;
}

/** A building the build menu offers, including disabled tier/resource states. */
export interface BuildReadout {
  /** Whether the current stockpile pays for it; omitted by older previews. */
  affordable?: boolean;
  buildingType: string;
  /** Resource amounts, for icon cost rows. */
  cost?: Partial<ResourceStockpile>;
  costLabel: string;
  hints: readonly string[];
  job: string;
  /** Player-facing tier or resource blocker, when one applies. */
  lockedReason?: string;
  name: string;
  tier: string;
  /** Whether the Hold tier allows it, independent of affordability. */
  unlocked: boolean;
}

/** A class a selected Barracks can train. */
export interface TrainReadout {
  allowed: boolean;
  buildingId: string;
  classId: ClassId;
  /** Resource amounts one order costs, for icon cost rows. */
  cost?: Partial<ResourceStockpile>;
  /** Trainees one order produces. */
  count?: number;
  detail: string;
  /** Food one trainee costs. Used to price a shift-click batch. */
  food?: number;
  label: string;
  /** Population one trainee reserves. */
  pop?: number;
  reason?: string;
  /** Seconds one order takes. */
  seconds?: number;
  /** Blocked only by resources or population, which the cost row shows. */
  shortfall?: boolean;
  /** Water one trainee costs. */
  water?: number;
}

/** A pill a selected Alchemy Furnace can brew. */
export interface BrewReadout {
  allowed: boolean;
  detail: string;
  furnaceId: string;
  name: string;
  pillId: string;
  reason?: string;
}

/**
 * A pill feed the cultivation system has already projected.
 * `schoolMatchLabel` is display copy for `preview.schoolMatch`.
 */
export interface PillFeedReadout {
  pillName: string;
  preview: PillPreview;
  schoolMatchLabel: string;
  unitId: string;
}

/** A fallen hero the Hero Hall can revive. There is no revive command on the queue. */
export interface ReviveReadout {
  allowed: boolean;
  costLabel: string;
  hallId: string;
  heroId: string;
  name: string;
  reasons: readonly string[];
}

/** A Calamity the selected Altar can summon. */
export interface CalamityReadout {
  allowed: boolean;
  altarId: string;
  calamityId: string;
  costLabel: string;
  name: string;
  reasons: readonly string[];
  school: SchoolId;
}

/** Rations a selected Mess Hall can issue. */
export interface RationReadout {
  allowed: boolean;
  detail: string;
  messHallId: string;
  reason?: string;
  unitIds: readonly string[];
}

/** Camp-to-Stronghold progress published by the economy bridge. */
export interface HoldUpgradeReadout {
  allowed: boolean;
  /** Resource amounts, for icon cost rows. */
  cost?: Partial<ResourceStockpile>;
  costLabel: string;
  currentTier: string;
  /** The running upgrade to `targetTier`, or null when none has started. */
  inProgress?: { progress: number; secondsLeft: number } | null;
  reason?: string;
  /** Blocked only by resources, which the cost row shows. */
  shortfall?: boolean;
  targetTier: string;
  /** Buildings and units newly unlocked by reaching `targetTier`. */
  unlocks?: string;
}

/** Terminal result of the currently loaded playable slice. */
export interface SliceOutcomeReadout {
  body: string;
  kind: "defeat" | "victory";
  title: string;
}

/** One Hell Market rate, already priced by the economy. */
export interface MarketReadout {
  buy: ResourceId;
  label: string;
  sell: ResourceId;
}

/** A treasure the player can equip. The slot check is already in `allowed`. */
export interface TreasureReadout {
  allowed: boolean;
  name: string;
  reason?: string;
  treasureId: string;
  unitId: string;
}

/** Map node marker. Remaining yield is a label, not a gather rule. */
export interface NodeReadout {
  /** Villagers currently assigned to work this node. */
  gatherers?: number;
  id: string;
  label: string;
  /** Yield left before the node runs dry. */
  remaining?: number;
  resource: ResourceId;
  x: number;
  y: number;
}

/** Hazard vent marker copied from the layer table or a map loader. */
export interface VentReadout {
  id: string;
  label: string;
  radius: number;
  x: number;
  y: number;
}

/** Battlefield terrain landmark: an impassable ridge, spire, wall, fissure, or river, or a walkable bridge. */
export interface TerrainReadout {
  /** Bridges only: deck rotation in radians from the map's +x axis. */
  angle?: number;
  height: number;
  id: string;
  /** Terrain obstacles, plus the walkable "bridge" laid across rivers. */
  kind: TerrainFeatureKind | "bridge";
  label?: string;
  /** Bridges only: `radius` is half the span; this is the deck width. */
  radius: number;
  width?: number;
  x: number;
  y: number;
}

/** Fixed Spirit Vein. `radius` is the published pickup radius for the cursor hint. */
export interface VeinReadout {
  id: string;
  radius: number;
  x: number;
  y: number;
}

/** Boss wind-up or Tribulation ring supplied by another chunk. */
export interface TelegraphReadout {
  id: string;
  kind: "boss_windup" | "tribulation";
  label: string;
  radius: number;
  x: number;
  y: number;
}

/** Next wave preview. `etaSeconds` is sim time, never a wall clock. */
export interface OmenReadout {
  composition: Partial<Record<ClassId, number>>;
  etaSeconds: number;
}

/** One player entry and live score published for multiplayer HUD rosters. */
export interface PlayerRosterReadout {
  color: string;
  id: string;
  name: string;
  /** Current Age of Empires-inspired score and category breakdown. */
  score: PlayerScoreBreakdown;
  slotIndex: number;
}

/** Which Ashen Gate coach marks are still pending. */
export interface OnboardingFlags {
  pill: boolean;
  realmGate: boolean;
  school: boolean;
}

/**
 * Optional panel data carried on `SimSnapshot.meta`.
 * The view reads `meta.ui` first. When a field is absent it also accepts:
 * `meta.layers.bossGateCleared`, `meta.waves.hellPressure`, `meta.waves.omen`,
 * and `meta.economy` pop (`used`/`cap` or `popUsed`/`popCap`).
 * Those values are displayed as published. This module does not compute them.
 */
export interface DescentPresentation {
  boss?: BossReadout | null;
  bossGateCleared?: boolean;
  brewOptions?: readonly BrewReadout[];
  buildOptions?: readonly BuildReadout[];
  /** Co-op build menus keyed by owner; `buildOptions` remains the solo default. */
  buildOptionsByOwner?: Readonly<Record<string, readonly BuildReadout[]>>;
  buildings?: Readonly<Record<string, BuildingReadout>>;
  calamities?: readonly CalamityReadout[];
  /** What the Hold has explored and can see now; null shows everything. */
  fog?: FogOfWarState | null;
  fx?: readonly FxReadout[];
  hellPressure?: number;
  /** Current tier even at Citadel, where there is no next upgrade readout. */
  holdTier?: string;
  /** Current co-op tiers keyed by owner, including owners without a Camp. */
  holdTiers?: Readonly<Record<string, string>>;
  holdUpgrade?: HoldUpgradeReadout | null;
  /** Independent co-op upgrade readouts keyed by owner. */
  holdUpgrades?: Readonly<Record<string, HoldUpgradeReadout | null>>;
  marketRates?: readonly MarketReadout[];
  nodes?: readonly NodeReadout[];
  notices?: readonly (NoticeReadout | string)[];
  objectives?: readonly ObjectiveReadout[];
  omen?: OmenReadout | null;
  outcome?: SliceOutcomeReadout | null;
  onboarding?: OnboardingFlags;
  pillFeeds?: readonly PillFeedReadout[];
  players?: readonly PlayerRosterReadout[];
  pop?: { cap: number; used: number };
  rations?: RationReadout | null;
  /** Per-Mess-Hall actions, scoped to each building owner's soldiers. */
  rationOptions?: readonly RationReadout[];
  revives?: readonly ReviveReadout[];
  stats?: StatsReadout;
  telegraphs?: readonly TelegraphReadout[];
  terrain?: readonly TerrainReadout[];
  trainOptions?: readonly TrainReadout[];
  treasures?: readonly TreasureReadout[];
  units?: Readonly<Record<string, UnitReadout>>;
  veins?: readonly VeinReadout[];
  vents?: readonly VentReadout[];
  wave?: WaveReadout | null;
}

/** Presentation after missing bags are replaced with empty collections. */
export interface ReadPresentation {
  boss: BossReadout | null;
  bossGateCleared: boolean;
  brewOptions: readonly BrewReadout[];
  buildOptions: readonly BuildReadout[];
  buildOptionsByOwner: Readonly<Record<string, readonly BuildReadout[]>>;
  buildings: Readonly<Record<string, BuildingReadout>>;
  calamities: readonly CalamityReadout[];
  fog: FogOfWarState | null;
  fx: readonly FxReadout[];
  hellPressure: number;
  holdTier: string | null;
  holdTiers: Readonly<Record<string, string>>;
  holdUpgrade: HoldUpgradeReadout | null;
  holdUpgrades: Readonly<Record<string, HoldUpgradeReadout | null>>;
  marketRates: readonly MarketReadout[];
  nodes: readonly NodeReadout[];
  notices: readonly NoticeReadout[];
  objectives: readonly ObjectiveReadout[];
  omen: OmenReadout | null;
  outcome: SliceOutcomeReadout | null;
  onboarding: OnboardingFlags | null;
  pillFeeds: readonly PillFeedReadout[];
  players: readonly PlayerRosterReadout[];
  pop: { cap: number; used: number } | null;
  rations: RationReadout | null;
  rationOptions: readonly RationReadout[];
  revives: readonly ReviveReadout[];
  stats: StatsReadout | null;
  telegraphs: readonly TelegraphReadout[];
  terrain: readonly TerrainReadout[];
  trainOptions: readonly TrainReadout[];
  treasures: readonly TreasureReadout[];
  units: Readonly<Record<string, UnitReadout>>;
  veins: readonly VeinReadout[];
  vents: readonly VentReadout[];
  wave: WaveReadout | null;
}

const CLASS_IDS = [
  "villager",
  "cultivator",
  "warden",
  "hunter",
  "rider",
  "raider",
  "breaker",
  "adept",
] as const satisfies readonly ClassId[];

/**
 * Narrows a value to a plain object.
 * @param value - Unknown snapshot or meta field
 * @returns Whether the value is a non-null, non-array object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns an array field, or an empty list when the bag omitted it.
 * @param value - Candidate array
 * @returns The same array, or an empty readonly array
 */
function readArray<TValue>(value: unknown): readonly TValue[] {
  if (!Array.isArray(value)) return [];
  return value as readonly TValue[];
}

/**
 * Reads roster entries from both current and pre-scoring presentations. Older
 * saves did not publish scores, so they receive a zeroed breakdown until the
 * next simulation presentation refresh.
 * @param value - Candidate roster array
 * @returns Roster entries with a safe score breakdown
 */
function readPlayers(value: unknown): readonly PlayerRosterReadout[] {
  return readArray<PlayerRosterReadout>(value).map((player) => ({
    ...player,
    score: player.score ?? {
      cultivation: 0,
      economy: 0,
      military: 0,
      total: 0,
    },
  }));
}

/**
 * Copies class counts the wave director actually published.
 * @param value - Candidate composition record
 * @returns Counts for known class ids
 */
function readComposition(value: unknown): Partial<Record<ClassId, number>> {
  if (!isRecord(value)) return {};
  const composition: Partial<Record<ClassId, number>> = {};
  for (const classId of CLASS_IDS) {
    const count = value[classId];
    if (typeof count === "number") composition[classId] = count;
  }
  return composition;
}

/**
 * Reads an Omen payload.
 * @param value - Candidate omen object
 * @returns The omen, or null when the countdown was not published
 */
function readOmen(value: unknown): OmenReadout | null {
  if (!isRecord(value)) return null;
  if (typeof value.etaSeconds !== "number") return null;
  return {
    composition: readComposition(value.composition),
    etaSeconds: value.etaSeconds,
  };
}

/**
 * Reads a population pair from either UI or economy field names.
 * @param value - Candidate pop object
 * @returns Used and cap, or null
 */
function readPop(value: unknown): { cap: number; used: number } | null {
  if (!isRecord(value)) return null;
  if (typeof value.used === "number" && typeof value.cap === "number") {
    return { cap: value.cap, used: value.used };
  }
  if (typeof value.popUsed === "number" && typeof value.popCap === "number") {
    return { cap: value.popCap, used: value.popUsed };
  }
  return null;
}

/**
 * Reads coach flags. An omitted flag stays pending.
 * @param value - Candidate onboarding object
 * @returns Flags, or null when the bag has no onboarding object
 */
function readOnboarding(value: unknown): OnboardingFlags | null {
  if (!isRecord(value)) return null;
  return {
    pill: value.pill !== false,
    realmGate: value.realmGate !== false,
    school: value.school !== false,
  };
}

/**
 * Reads failure strings another system asked the shell to show.
 * @param value - Candidate notice list
 * @returns String notices only
 */
function readNotices(value: unknown): readonly NoticeReadout[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((notice, index): NoticeReadout[] => {
    if (typeof notice === "string") {
      return [{ id: -(index + 1), text: notice, tone: "info" }];
    }
    if (!isRecord(notice)) return [];
    if (typeof notice.id !== "number" || typeof notice.text !== "string") {
      return [];
    }
    const tone = notice.tone;
    const known = tone === "bad" || tone === "good" || tone === "warn";
    return [{ id: notice.id, text: notice.text, tone: known ? tone : "info" }];
  });
}

/**
 * Reads an optional object field.
 * @param value - Candidate value
 * @returns The value as the given type, or null when absent
 */
function readObject<TValue>(value: unknown): TValue | null {
  if (!isRecord(value)) return null;
  return value as unknown as TValue;
}

/**
 * Normalizes `snapshot.meta` into the panel bag the shell renders.
 * @param meta - Sim snapshot meta, including optional `ui` and module saves
 * @returns Display data with empty collections instead of missing fields
 */
export function readPresentation(
  meta: Readonly<Record<string, unknown>>,
): ReadPresentation {
  const ui = isRecord(meta.ui) ? meta.ui : {};
  const waves = isRecord(meta.waves) ? meta.waves : null;
  const layers = isRecord(meta.layers) ? meta.layers : null;
  const omen =
    ui.omen === null
      ? null
      : (readOmen(ui.omen) ?? (waves === null ? null : readOmen(waves.omen)));
  let hellPressure = 0;
  if (typeof ui.hellPressure === "number") hellPressure = ui.hellPressure;
  else if (waves !== null && typeof waves.hellPressure === "number") {
    hellPressure = waves.hellPressure;
  }
  let bossGateCleared = false;
  if (typeof ui.bossGateCleared === "boolean") {
    bossGateCleared = ui.bossGateCleared;
  } else if (layers !== null && typeof layers.bossGateCleared === "boolean") {
    bossGateCleared = layers.bossGateCleared;
  }
  const rations = ui.rations;
  const parsedRations =
    rations === null || !isRecord(rations)
      ? null
      : (rations as unknown as RationReadout);
  const publishedRationOptions = readArray<RationReadout>(ui.rationOptions);
  const rationOptions =
    publishedRationOptions.length > 0 || parsedRations === null
      ? publishedRationOptions
      : [parsedRations];
  const holdUpgrade = ui.holdUpgrade;
  const outcome = ui.outcome;
  const buildOptionsByOwner = isRecord(ui.buildOptionsByOwner)
    ? (ui.buildOptionsByOwner as Readonly<
        Record<string, readonly BuildReadout[]>
      >)
    : {};
  const holdUpgrades = isRecord(ui.holdUpgrades)
    ? (ui.holdUpgrades as Readonly<Record<string, HoldUpgradeReadout | null>>)
    : {};
  const holdTiers = isRecord(ui.holdTiers)
    ? (ui.holdTiers as Readonly<Record<string, string>>)
    : {};
  return {
    boss: readObject<BossReadout>(ui.boss),
    bossGateCleared,
    brewOptions: readArray<BrewReadout>(ui.brewOptions),
    buildings: isRecord(ui.buildings)
      ? (ui.buildings as Readonly<Record<string, BuildingReadout>>)
      : {},
    buildOptions: readArray<BuildReadout>(ui.buildOptions),
    buildOptionsByOwner,
    calamities: readArray<CalamityReadout>(ui.calamities),
    fog: isFogOfWarState(ui.fog) ? ui.fog : null,
    fx: readArray<FxReadout>(ui.fx),
    hellPressure,
    holdTier: typeof ui.holdTier === "string" ? ui.holdTier : null,
    holdTiers,
    holdUpgrade:
      holdUpgrade === null || !isRecord(holdUpgrade)
        ? null
        : (holdUpgrade as unknown as HoldUpgradeReadout),
    holdUpgrades,
    marketRates: readArray<MarketReadout>(ui.marketRates),
    nodes: readArray<NodeReadout>(ui.nodes),
    notices: readNotices(ui.notices),
    objectives: readArray<ObjectiveReadout>(ui.objectives),
    omen,
    onboarding: readOnboarding(ui.onboarding),
    outcome:
      outcome === null || !isRecord(outcome)
        ? null
        : (outcome as unknown as SliceOutcomeReadout),
    pillFeeds: readArray<PillFeedReadout>(ui.pillFeeds),
    players: readPlayers(ui.players),
    pop: readPop(ui.pop) ?? readPop(meta.economy),
    rationOptions,
    rations: parsedRations,
    revives: readArray<ReviveReadout>(ui.revives),
    stats: readObject<StatsReadout>(ui.stats),
    telegraphs: readArray<TelegraphReadout>(ui.telegraphs),
    terrain: readArray<TerrainReadout>(ui.terrain),
    trainOptions: readArray<TrainReadout>(ui.trainOptions),
    treasures: readArray<TreasureReadout>(ui.treasures),
    units: isRecord(ui.units)
      ? (ui.units as Readonly<Record<string, UnitReadout>>)
      : {},
    veins: readArray<VeinReadout>(ui.veins),
    vents: readArray<VentReadout>(ui.vents),
    wave: readObject<WaveReadout>(ui.wave),
  };
}

/**
 * Width of a terrain marker across its long axis: a bridge is a narrow deck,
 * every other feature is a disk.
 * @param feature - Terrain readout
 * @returns Marker extent perpendicular to its length, in map tiles
 */
export function terrainAcross(feature: TerrainReadout): number {
  return feature.kind === "bridge"
    ? (feature.width ?? 3.6)
    : feature.radius * 2;
}
