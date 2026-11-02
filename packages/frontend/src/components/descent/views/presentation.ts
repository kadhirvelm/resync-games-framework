import type { CultivationView, PillPreview } from "../logic/cultivation/types";
import type { ClassId, RankTitle, ResourceId, SchoolId } from "../logic/types";

/** Published decoration for one sim unit. The view does not invent these numbers. */
export interface UnitReadout {
  /** Elite affix on a horde body. */
  affix?: string | null;
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
  /** Recovering from a failed breakthrough. */
  injured?: boolean;
  maxHitPoints?: number;
  name?: string;
  rank?: RankTitle;
  /** Horde role: scout, swarm, elite, boss, fodder, ... */
  role?: string;
  school?: SchoolId;
  /** This layer's multiplier for the unit's school. */
  schoolModifier?: number;
  /** What a villager is doing. */
  task?: string;
  treasureSlots?: number;
  treasures?: readonly { id: string; name: string }[];
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
      kind: "ascend" | "collapse" | "death" | "spawn";
      tick: number;
      x: number;
      y: number;
    };

/** The next scheduled wave. The countdown is public; the mix needs an Omen. */
export interface WaveReadout {
  /** Seconds until it spawns, or null once every wave has spawned. */
  etaSeconds: number | null;
  /** 1-based number of the next wave. */
  index: number;
  label: string;
  /** Horde bodies currently on the field. */
  live: number;
  total: number;
  type: "boss" | "elite" | "scout" | "swarm";
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

/** A building the build menu may offer. Unlock and hints are already decided. */
export interface BuildReadout {
  buildingType: string;
  costLabel: string;
  hints: readonly string[];
  job: string;
  lockedReason?: string;
  name: string;
  tier: string;
  unlocked: boolean;
}

/** A class a selected Barracks can train. */
export interface TrainReadout {
  allowed: boolean;
  buildingId: string;
  classId: ClassId;
  detail: string;
  /** Food one trainee costs. Used to price a shift-click batch. */
  food?: number;
  label: string;
  /** Population one trainee reserves. */
  pop?: number;
  reason?: string;
  /** Seconds one order takes. */
  seconds?: number;
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
  costLabel: string;
  currentTier: string;
  reason?: string;
  targetTier: string;
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
  buildings?: Readonly<Record<string, BuildingReadout>>;
  calamities?: readonly CalamityReadout[];
  fx?: readonly FxReadout[];
  hellPressure?: number;
  holdUpgrade?: HoldUpgradeReadout | null;
  marketRates?: readonly MarketReadout[];
  nodes?: readonly NodeReadout[];
  notices?: readonly (NoticeReadout | string)[];
  objectives?: readonly ObjectiveReadout[];
  omen?: OmenReadout | null;
  outcome?: SliceOutcomeReadout | null;
  onboarding?: OnboardingFlags;
  pillFeeds?: readonly PillFeedReadout[];
  pop?: { cap: number; used: number };
  rations?: RationReadout | null;
  revives?: readonly ReviveReadout[];
  stats?: StatsReadout;
  telegraphs?: readonly TelegraphReadout[];
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
  buildings: Readonly<Record<string, BuildingReadout>>;
  calamities: readonly CalamityReadout[];
  fx: readonly FxReadout[];
  hellPressure: number;
  holdUpgrade: HoldUpgradeReadout | null;
  marketRates: readonly MarketReadout[];
  nodes: readonly NodeReadout[];
  notices: readonly NoticeReadout[];
  objectives: readonly ObjectiveReadout[];
  omen: OmenReadout | null;
  outcome: SliceOutcomeReadout | null;
  onboarding: OnboardingFlags | null;
  pillFeeds: readonly PillFeedReadout[];
  pop: { cap: number; used: number } | null;
  rations: RationReadout | null;
  revives: readonly ReviveReadout[];
  stats: StatsReadout | null;
  telegraphs: readonly TelegraphReadout[];
  trainOptions: readonly TrainReadout[];
  treasures: readonly TreasureReadout[];
  units: Readonly<Record<string, UnitReadout>>;
  veins: readonly VeinReadout[];
  vents: readonly VentReadout[];
  wave: WaveReadout | null;
}

const CLASS_IDS = [
  "villager",
  "warden",
  "hunter",
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
  const holdUpgrade = ui.holdUpgrade;
  const outcome = ui.outcome;
  return {
    boss: readObject<BossReadout>(ui.boss),
    bossGateCleared,
    brewOptions: readArray<BrewReadout>(ui.brewOptions),
    buildings: isRecord(ui.buildings)
      ? (ui.buildings as Readonly<Record<string, BuildingReadout>>)
      : {},
    buildOptions: readArray<BuildReadout>(ui.buildOptions),
    calamities: readArray<CalamityReadout>(ui.calamities),
    fx: readArray<FxReadout>(ui.fx),
    hellPressure,
    holdUpgrade:
      holdUpgrade === null || !isRecord(holdUpgrade)
        ? null
        : (holdUpgrade as unknown as HoldUpgradeReadout),
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
    pop: readPop(ui.pop) ?? readPop(meta.economy),
    rations:
      rations === null || !isRecord(rations)
        ? null
        : (rations as unknown as RationReadout),
    revives: readArray<ReviveReadout>(ui.revives),
    stats: readObject<StatsReadout>(ui.stats),
    telegraphs: readArray<TelegraphReadout>(ui.telegraphs),
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
