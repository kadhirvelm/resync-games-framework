/** Canonical player-facing cultivation ranks, ordered from lowest to highest. */
export const RANK_TITLES = [
  "Ashborn",
  "Sworn",
  "Veteran",
  "Champion",
  "Ascended",
] as const;

/** Player-facing cultivation rank. */
export type RankTitle = (typeof RANK_TITLES)[number];

/** Cultivation school chosen at Sworn rank. */
export type SchoolId = "ember" | "rime" | "blood";

/** Hold tier used by the Cultivation Hall gate. */
export type HallTier = "Camp" | "Stronghold" | "Citadel";

/** Resource ids the cultivation chunk can ask the economy stockpile to spend. */
export type CultivationResourceId =
  | "food"
  | "water"
  | "wood"
  | "stone"
  | "iron"
  | "coin"
  | "spirit_herbs"
  | "essence";

/** Sparse resource cost consumed by a breakthrough. */
export type ResourceCost = Partial<Record<CultivationResourceId, number>>;

/** Data for one rank's transition to the next rank. */
export interface BreakthroughDefinition {
  targetRank: RankTitle;
  merit: number;
  essence: number;
  combatProof: number;
  materials: ResourceCost;
  hallTier: HallTier;
  baseSuccessChance: number;
  channelSeconds: number;
  kind: "channel" | "tribulation";
}

/** Data-driven definition for one cultivation realm. */
export interface RealmDefinition {
  id:
    | "qi_gathering"
    | "foundation"
    | "core_formation"
    | "nascent_soul"
    | "ascension";
  rank: RankTitle;
  realm: string;
  statMultiplier: number;
  population: number;
  passives: string[];
  breakthrough?: BreakthroughDefinition;
}

/** Data-driven pill role. Battle pills deliberately have no runtime behavior. */
export type PillRole = "permanent" | "dao" | "breakthrough" | "battle";

/** One numerical pill effect. */
export interface PillEffectDefinition {
  stat: string;
  amount: number;
}

/** Data-driven definition for one pill. */
export interface PillDefinition {
  id: string;
  name: string;
  role: PillRole;
  school?: SchoolId;
  effect: PillEffectDefinition;
  description: string;
}

/** Data-driven definition for one treasure type. */
export interface TreasureDefinition {
  id: string;
  name: string;
  school?: SchoolId;
  effect: string;
}

/** A forged, individually equipable treasure. */
export interface TreasureInstance {
  instanceId: string;
  definitionId: string;
  essenceGrade: number;
}

/** A pill effect already applied to a unit. */
export interface AppliedPillEffect {
  pillId: string;
  role: "permanent" | "dao";
  realm: RankTitle;
  stat: string;
  amount: number;
  schoolMatch?: boolean;
}

/** In-progress channel owned by cultivation and advanced by simulation time. */
export interface ActiveBreakthrough {
  sourceRank: RankTitle;
  targetRank: RankTitle;
  kind: "channel" | "tribulation";
  remainingSeconds: number;
  successChance: number;
  reservedPopulation: number;
}

/** Serializable cultivation state for one combat unit. */
export interface CultivationUnitState {
  unitId: string;
  rank: RankTitle;
  isHero: boolean;
  merit: number;
  essence: number;
  combatProof: number;
  school?: SchoolId;
  appliedPills: AppliedPillEffect[];
  equippedTreasures: TreasureInstance[];
  activeBreakthrough?: ActiveBreakthrough;
}

/** Input used when a combat unit first joins cultivation. */
export interface RegisterCultivationUnitInput {
  unitId: string;
  rank?: RankTitle;
  isHero?: boolean;
  merit?: number;
  essence?: number;
  combatProof?: number;
  school?: SchoolId;
  maxHealth?: number;
}

/** Read model consumed by the unit panel. */
export interface CultivationView {
  rank: RankTitle;
  merit: number;
  meritToNext: number;
  essence: number;
  essenceToNext: number;
  school?: SchoolId;
  toxicity: number;
  toxicityCap: number;
  successChance: number;
  missingRequirements: string[];
  passives: string[];
}

/** Non-mutating pill projection shown before the player commits. */
export interface PillPreview {
  pillId: string;
  canFeed: boolean;
  reason?: string;
  projectedAmount: number;
  effectivenessMultiplier: number;
  schoolMatch?: boolean;
  toxicity: number;
  toxicityAfter: number;
  toxicityCap: number;
}

/** Success result for cultivation commands. */
export interface CultivationSuccess<T> {
  ok: true;
  value: T;
}

/** Rejection result for cultivation commands. */
export interface CultivationFailure {
  ok: false;
  error: string;
}

/** Result returned by all cultivation mutations. */
export type CultivationResult<T> = CultivationSuccess<T> | CultivationFailure;

/** Outcome emitted when an active breakthrough resolves. */
export interface BreakthroughOutcome {
  unitId: string;
  sourceRank: RankTitle;
  targetRank: RankTitle;
  succeeded: boolean;
  kind: "channel" | "tribulation";
}

/**
 * Deterministic 0..1 breakthrough rolls: a record by unit id (a missing
 * entry fails) or a function asked once per finishing channel.
 */
export type BreakthroughRolls =
  | Readonly<Record<string, number>>
  | ((unitId: string) => number);

/** JSON-safe cultivation state stored on the sim world. */
export interface CultivationSystemState {
  groundTreasures: TreasureInstance[];
  inventoryTreasures: TreasureInstance[];
  units: CultivationUnitState[];
}

/** Options for the cultivation system. */
export interface CultivationSystemOptions {
  maxRankForLayer: () => RankTitle;
}
