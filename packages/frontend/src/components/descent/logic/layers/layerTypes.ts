/**
 * Types for the layers chunk. School and rank unions come from the shared
 * `logic/types.ts` (see `docs/descent/01-shared-contract.md`).
 */

import type { RankTitle, SchoolId } from "../types";

export type { RankTitle, SchoolId };

export type LayerId =
  | "ashen_gate"
  | "bone_wastes"
  | "frozen_pit"
  | "blood_sea"
  | "throne_of_hell";

export type HazardId = "ember_vents" | "fog" | "cold" | "lifedrain";

/** Which school effect a layer's favored modifier applies to. */
export type SchoolEffectKind =
  | "effect_damage"
  | "lifesteal"
  | "shield"
  | "none";

/** A circular hazard or coverage area in map tile units. */
export interface CircleVolume {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface EmberVentsHazard {
  readonly kind: "ember_vents";
  /** Burn damage per sim-second while standing inside a vent. */
  readonly burnPerSecond: number;
  /** Fraction of vent burn removed inside fire-ward wall coverage (0–1). */
  readonly fireWardMitigation: number;
}

export interface FogHazard {
  readonly kind: "fog";
  /** Vision multiplier outside Ward Tower and Omen Tower range. */
  readonly visionMultiplier: number;
}

export interface ColdHazard {
  readonly kind: "cold";
  /** Move speed multiplier outside Hearth Ward coverage. */
  readonly moveMultiplier: number;
  /** Gather rate multiplier outside Hearth Ward coverage. */
  readonly gatherMultiplier: number;
}

export interface LifedrainHazard {
  readonly kind: "lifedrain";
  /** Healing received multiplier. */
  readonly healingMultiplier: number;
  /** Recipients of this school ignore the healing penalty. */
  readonly immuneSchool: SchoolId;
  /** Base essence restored per enemy kill, before the essence grade. */
  readonly essencePerKill: number;
}

export type HazardConfig =
  | EmberVentsHazard
  | FogHazard
  | ColdHazard
  | LifedrainHazard;

export interface HazardRotation {
  /** Hazards cycled in order, starting at layer start. */
  readonly hazards: readonly HazardId[];
  /** Sim-seconds each hazard stays active. */
  readonly periodSeconds: number;
}

export interface LayerConfig {
  readonly id: LayerId;
  readonly order: number;
  readonly name: string;
  readonly faction: string;
  readonly bossTitle: string;
  readonly bossName: string;
  readonly essenceGrade: number;
  readonly realmCap: RankTitle;
  /** Hazards always active on this layer. */
  readonly hazards: readonly HazardId[];
  /** Hazards cycled over sim time (Throne of Hell). */
  readonly hazardRotation: HazardRotation | null;
  readonly schoolModifiers: Readonly<Record<SchoolId, number>>;
  readonly favoredEffect: SchoolEffectKind;
  /** Building and power ids first unlocked on this layer. */
  readonly unlocks: readonly string[];
  /** Placeholder vent volumes; a map loader may override them. */
  readonly ventVolumes: readonly CircleVolume[];
  readonly loreBeat: string;
}

/** Building ids and coverage radii for the buildable hazard answers. */
export interface HazardAnswers {
  readonly fireWardWall: {
    readonly buildingType: string;
    readonly radius: number;
  };
  readonly wardTower: {
    readonly buildingType: string;
    readonly radius: number;
  };
  readonly omenTower: {
    readonly buildingType: string;
    readonly radius: number;
    readonly rangeUpgrade: string;
    readonly upgradedRadius: number;
  };
  readonly hearthWard: {
    readonly buildingType: string;
    readonly radius: number;
  };
}

export interface LayerTable {
  readonly version: number;
  readonly hazards: Readonly<Record<HazardId, HazardConfig>>;
  readonly answers: HazardAnswers;
  readonly layers: readonly LayerConfig[];
}

/** The slice of a building that hazard answers read. */
export interface LayerBuilding {
  readonly buildingType: string;
  readonly x: number;
  readonly y: number;
  /** Buildings still under construction do not answer hazards. */
  readonly constructed: boolean;
  readonly upgrades?: readonly string[];
}

/** The slice of a unit that hazard queries read. */
export interface LayerUnit {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly school?: SchoolId | null;
}

/** Multipliers and damage the environment applies at one map position. */
export interface EnvironmentEffect {
  readonly burnPerSecond: number;
  readonly visionMultiplier: number;
  readonly moveMultiplier: number;
  readonly gatherMultiplier: number;
  readonly healingMultiplier: number;
}

export type LayerEvent =
  | { readonly type: "layer_started"; readonly layerId: LayerId }
  | { readonly type: "layer_cleared"; readonly layerId: LayerId }
  | {
      readonly type: "hazard_rotated";
      readonly layerId: LayerId;
      readonly hazardId: HazardId;
    };

export type DescendResult =
  | { readonly ok: true; readonly layer: LayerConfig }
  | { readonly ok: false; readonly reason: "boss_gate_closed" | "final_layer" };

/** JSON-safe runtime state for the sim-core save blob. */
export interface LayerRuntimeState {
  readonly layerId: LayerId;
  readonly bossGateCleared: boolean;
  /** Boss-phase hazard override; absent on older saves (no override). */
  readonly hazardOverride?: HazardId | null;
  readonly layerStartedAtSimSeconds: number;
  readonly nowSimSeconds: number;
}
