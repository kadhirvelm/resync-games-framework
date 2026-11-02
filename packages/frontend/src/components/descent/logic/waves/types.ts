/**
 * Wave, omen, elite, and boss types. Names follow the shared Descent contract.
 * Narrative consumes `boss_intro` by boss id; this module never carries lines.
 */

import type { NarrativeBossId } from "../../data/narrative/types";
import type { CombatClassId } from "../combat/types";
import type { HazardId, LayerId } from "../layers/layerTypes";
import type { ClassId, SchoolId } from "../types";

export type { CombatClassId, LayerId, NarrativeBossId };

/** One readable elite affix. A wave elite has exactly one. */
export type EliteAffixId = "armored" | "summoner" | "berserker" | "siphon";

/** Scheduled wave kinds, in the order a layer applies pressure. */
export type WaveType = "scout" | "swarm" | "elite" | "boss";

/** How a spawned body is treated by later ticks. */
export type WaveRole =
  | "scout"
  | "swarm"
  | "escort"
  | "elite"
  | "boss"
  | "fodder"
  | "vent_imp";

/** Damage category armored elites care about. */
export type DamageKind = "physical" | "spell";

/** What a unit tries to hit first. Siege bodies prefer walls. */
export type PreferredTarget = "unit" | "wall";

/** Boss phase behavior. Wind-ups are data; dialogue is not. */
export type BossTwist =
  | "imps_from_vents"
  | "arena_fog"
  | "mobility"
  | "freezing_ground"
  | "hunger"
  | "rotate_rule";

/** A class count inside a wave or a phase spawn. */
export interface ClassCount {
  classId: CombatClassId;
  count: number;
  /**
   * Hit point and damage scale for these bodies. Omitted means full class
   * stats; the opening scouts use it so one Warden can hold the first wave.
   */
  statScale?: number;
}

/** One scheduled wave on a layer. Times are sim seconds from layer start. */
export interface WaveDefinition {
  bossId: NarrativeBossId | null;
  composition: readonly ClassCount[];
  elite: { affix: EliteAffixId; classId: CombatClassId } | null;
  id: string;
  spawnAtSeconds: number;
  type: WaveType;
}

/** One layer's fixed schedule. */
export interface WaveSchedule {
  id: LayerId;
  lifestealClasses: readonly CombatClassId[];
  siegeSwarmPortion: number;
  waves: readonly WaveDefinition[];
}

/** One boss phase, already ordered by the catalog. */
export interface BossPhase {
  damageMultiplier: number | null;
  id: string;
  rotatedRule: HazardId | null;
  spawn: readonly ClassCount[];
  speedMultiplier: number | null;
  threshold: number;
  twist: BossTwist;
  visionMultiplier: number | null;
}

/** Mechanical boss record. Names match the layer table; there is no script. */
export interface BossDefinition {
  allyDeathHealFraction: number;
  aoeRadius: number | null;
  armor: number;
  bossCoreId: string;
  classId: CombatClassId;
  damage: number;
  essenceBase: number;
  id: NarrativeBossId;
  layerId: LayerId;
  lifesteal: boolean;
  maxHitPoints: number;
  name: string;
  phases: readonly BossPhase[];
  school: SchoolId | null;
  speed: number;
  title: string;
  treasureChoice: readonly string[];
  vision: number;
  windupSeconds: number;
}

/**
 * What the Omen Tower shows. Null when the tower is down or the next wave
 * is still more than 60 sim-seconds away.
 */
export interface OmenPreview {
  /** Boss that arrives with the wave, or null. Absent on older readers. */
  bossId?: NarrativeBossId | null;
  composition: Partial<Record<ClassId, number>>;
  /** The wave's elite and its affix, or null. Absent on older readers. */
  elite?: { affix: EliteAffixId; classId: CombatClassId } | null;
  etaSeconds: number;
}

/** Rewards granted only by killing the layer boss. */
export interface BossDrops {
  bossCoreId: string;
  essence: number;
  treasureChoice: string[];
}

/**
 * Arena modifiers from boss phases. `moveSpeedMultiplier` is a Hold-facing
 * rule (the Warden's cold): the horde's own speeds never include it.
 */
export interface EncounterState {
  lifedrain: boolean;
  moveSpeedMultiplier: number;
  rotatedRule: HazardId | null;
  visionMultiplier: number;
}

/** A telegraphed ground effect left by a boss phase. */
export interface ArenaHazard {
  id: string;
  kind: "ember_vent" | "freezing_ground";
  radius: number;
  source: "boss" | "rotated_rule";
  x: number;
  y: number;
}

/** One horde body. Stats are stubs; combat resolves the fight. */
export interface WaveUnit {
  affix: EliteAffixId | null;
  allyDeathHealFraction: number;
  aoeRadius: number | null;
  armor: number;
  barkKey: string;
  baseDamage: number;
  baseMaxHitPoints: number;
  baseSpeed: number;
  bossId: NarrativeBossId | null;
  classId: CombatClassId;
  damage: number;
  definitionId: string;
  factionId: string;
  hitPoints: number;
  id: string;
  lifesteal: boolean;
  maxHitPoints: number;
  preferredTarget: PreferredTarget;
  role: WaveRole;
  school: SchoolId | null;
  speed: number;
  speedMultiplier: number;
  vision: number;
  waveId: string;
  x: number;
  y: number;
}

/** A single planned body before it is placed on the clock. */
export interface SpawnPlan {
  affix: EliteAffixId | null;
  allyDeathHealFraction: number;
  aoeRadius: number | null;
  armor: number;
  bossId: NarrativeBossId | null;
  classId: CombatClassId;
  damage: number;
  lifesteal: boolean;
  maxHitPoints: number;
  preferredTarget: PreferredTarget;
  role: WaveRole;
  school: SchoolId | null;
  speed: number;
  statScale: number;
  useBossStats: boolean;
  vision: number;
}

/** Playable map size a spawn must stay inside, in map tiles. */
export interface SpawnBounds {
  height: number;
  width: number;
}

/** Numbers a spawn needs from the live clock. */
export interface WaveSpawnContext {
  bounds: SpawnBounds;
  collectedEssence: number;
  fallenAllies: number;
  grade: number;
  hellPressure: number;
  layerId: LayerId;
  waveId: string;
}

/** Clock output for UI, audio, and the narrative `boss_intro` hook. */
export type WaveEvent =
  | { cue: "omen" | "spawn"; type: "horn"; waveId: string }
  | { bossId: NarrativeBossId; layerId: LayerId; type: "boss_intro" }
  | {
      bossId: NarrativeBossId;
      phaseId: string;
      seconds: number;
      type: "boss_windup";
    }
  | {
      bossId: NarrativeBossId;
      phaseId: string;
      twist: BossTwist;
      type: "boss_phase";
    }
  | { bossId: NarrativeBossId; drops: BossDrops; type: "boss_killed" }
  | { eliteId: string; type: "summoner_spawn"; unitIds: string[] }
  | {
      amount: number;
      siphoned: boolean;
      type: "essence_payout";
      unitId: string;
    }
  | { pressure: number; type: "hell_pressure" }
  | { buildingId: string; type: "building_fell" }
  | { type: "wave_spawned"; unitIds: string[]; waveId: string };

/** A phase wind-up waiting on the sim clock. */
export interface PendingTwist {
  bossId: NarrativeBossId;
  phaseId: string;
  remainingTicks: number;
  telegraphed: boolean;
}

/**
 * JSON-safe wave clock. The sim module keeps this object in `meta.waves`.
 * `completedTick` is the sim tick this layer clock has resolved through.
 */
export interface WaveClockState {
  announcedOmenWaveId: string | null;
  bossDrops: BossDrops | null;
  bossGateCleared: boolean;
  collectedEssence: number;
  completedTick: number;
  encounter: EncounterState;
  fallenAlliesByWave: Record<string, number>;
  hazards: ArenaHazard[];
  hellPressure: number;
  killEssence: number;
  layerId: LayerId | null;
  layerStartedTick: number;
  /** Map height spawns fit inside. Missing on old saves; a default applies. */
  mapHeight?: number;
  /** Map width spawns fit inside. Missing on old saves; a default applies. */
  mapWidth?: number;
  omenTower: boolean;
  pendingTwists: PendingTwist[];
  resolvedTick: number;
  spawnedWaveIds: string[];
  summonAt: Record<string, number>;
  trackedUnitIds: string[];
  triggeredPhases: string[];
  units: WaveUnit[];
}

/** Result of removing one horde body. */
export interface CasualtyResult {
  essence: number;
  events: WaveEvent[];
  gateCleared: boolean;
}

/** Descend answer shared with the layers runtime. */
export type DescendGateResult =
  | { ok: true }
  | { ok: false; reason: "boss_gate_closed" | "final_layer" };

/**
 * The layers chunk owns the gate. Waves call `setBossGateCleared` only after
 * the boss dies, then `descend` when the player asks to go deeper.
 */
export interface WaveGatePort {
  descend?(simSeconds?: number): {
    layer?: { id: LayerId };
    ok: boolean;
    reason?: "boss_gate_closed" | "final_layer";
  };
  isBossGateCleared(): boolean;
  setBossGateCleared(cleared: boolean): void;
}
