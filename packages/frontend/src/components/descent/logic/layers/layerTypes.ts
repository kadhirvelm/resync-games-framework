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

/** Visual and structural archetype for an impassable battlefield landmark. */
export type TerrainFeatureKind =
  | "basalt_ridge"
  | "deep_water"
  | "magma_fissure"
  | "obsidian_spire"
  | "ruin_wall";

/**
 * One impassable terrain formation on the playable map. Clusters of these
 * carve ridges, canyons, and defensive choke points across the plateau.
 */
export interface TerrainFeature extends CircleVolume {
  /** Tallness in world units, used by the 3D renderer for silhouette variety. */
  readonly height: number;
  readonly id: string;
  readonly kind: TerrainFeatureKind;
  readonly label?: string;
}

/**
 * A walkable plank bridge laid across a river. It never blocks movement: the
 * river leaves a gap where the bridge stands, and the renderer fills it.
 */
export interface TerrainBridge {
  /** Rotation of the deck's long axis, in radians from the map's +x axis. */
  readonly angle: number;
  readonly id: string;
  /** Span along the deck's long axis, in tiles. */
  readonly length: number;
  /** Deck width across the span, in tiles. */
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

/**
 * A walkable Age of Empires-style hill with a flat hilltop plateau and a
 * smooth sloped ramp down to flat ground. Overlapping hills combine smoothly
 * to form terraced ridges and multi-tier high ground.
 */
export interface TerrainHill {
  /** Peak elevation above flat ground, in world units. */
  readonly height: number;
  readonly id: string;
  readonly label?: string;
  /** Radius of the flat hilltop plateau, in tiles (must be < radius). */
  readonly plateauRadius: number;
  /** Outer radius where the hill slope meets flat ground, in tiles. */
  readonly radius: number;
  readonly x: number;
  readonly y: number;
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
