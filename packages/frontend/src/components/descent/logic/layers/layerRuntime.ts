import { activeHazardsAt } from "./hazardRotation";
import {
  baseEssencePerKill,
  collectVentBurns,
  type EnvironmentContext,
  environmentAt,
  type HazardBurn,
} from "./hazards";
import { isRankWithinCap, LAYER_TABLE } from "./layerTable";
import type {
  CircleVolume,
  DescendResult,
  EnvironmentEffect,
  HazardId,
  LayerBuilding,
  LayerConfig,
  LayerEvent,
  LayerId,
  LayerRuntimeState,
  LayerTable,
  LayerUnit,
  RankTitle,
  SchoolId,
} from "./layerTypes";

/**
 * Hooks into systems this chunk does not own. All are optional so the
 * runtime can run headless in tests.
 */
export interface LayerRuntimePorts {
  /** Writes the layer-start autosave (sim-core). Runs after the reset. */
  readonly autosave?: (layer: LayerConfig) => void;
  /** Clears Deep Works deposits; they never carry between layers (economy). */
  readonly resetDeepWorks?: (layer: LayerConfig) => void;
  /** Receives `layer_started`, `layer_cleared`, and `hazard_rotated`. */
  readonly emit?: (event: LayerEvent) => void;
  /** Supplies vent volumes from the loaded map; defaults to the layer data. */
  readonly ventVolumesFor?: (layer: LayerConfig) => readonly CircleVolume[];
}

export interface LayerRuntimeOptions {
  readonly table?: LayerTable;
  readonly ports?: LayerRuntimePorts;
  /** Layer to start on; defaults to the first layer in the table. */
  readonly startLayerId?: LayerId;
}

/**
 * Owns the current layer, its hazard clock, and the boss gate. Combat,
 * economy, and cultivation read modifiers from it; only the waves chunk
 * opens the gate, and only `descend` changes layers. Time is sim time
 * pushed in through `advanceTo`, never a wall clock.
 */
export class LayerRuntime {
  private readonly table: LayerTable;
  private readonly ports: LayerRuntimePorts;
  private layerIndex: number;
  private bossGateCleared = false;
  private layerStartedAtSimSeconds = 0;
  private nowSimSeconds = 0;
  private rotationHazard: HazardId | null;
  private hazardOverride: HazardId | null = null;

  /**
   * Creates a runtime on the start layer. Does not autosave or emit; call
   * `start` when a new run begins, or `restore` when loading a save.
   * @param options - Table, ports, and start layer.
   */
  constructor(options: LayerRuntimeOptions = {}) {
    this.table = options.table ?? LAYER_TABLE;
    this.ports = options.ports ?? {};
    this.layerIndex = this.indexOf(options.startLayerId ?? this.firstLayerId());
    this.rotationHazard = this.currentRotationHazard();
  }

  /**
   * Begins the current layer at a sim time: resets Deep Works, emits
   * `layer_started`, and autosaves.
   * @param simSeconds - Current sim time in seconds.
   */
  start(simSeconds: number): void {
    this.beginLayer(this.layerIndex, simSeconds);
  }

  /**
   * Moves the hazard clock to a sim time and emits `hazard_rotated` when a
   * rotating layer switches hazards. Call once per sim tick.
   * @param simSeconds - Current sim time in seconds.
   */
  advanceTo(simSeconds: number): void {
    this.nowSimSeconds = simSeconds;
    const hazard = this.currentRotationHazard();
    if (hazard === null || hazard === this.rotationHazard) {
      return;
    }
    this.rotationHazard = hazard;
    this.ports.emit?.({
      hazardId: hazard,
      layerId: this.getActiveLayer().id,
      type: "hazard_rotated",
    });
  }

  /**
   * Returns the active layer's config.
   * @returns The layer the Hold is on.
   */
  getActiveLayer(): LayerConfig {
    const layer = this.table.layers[this.layerIndex];
    if (layer === undefined) {
      throw new Error(`Layer index ${this.layerIndex} is out of range`);
    }
    return layer;
  }

  /**
   * Returns the active layer's multiplier for one school's favored effect
   * (e.g. 1.25 favored, 0.85 hindered, 1 neutral).
   * @param school - School to look up.
   * @returns The multiplier.
   */
  getSchoolModifier(school: SchoolId): number {
    return this.getActiveLayer().schoolModifiers[school];
  }

  /**
   * Returns the active layer's essence grade (1, 2, 4, 8, 16).
   * @returns Grade multiplier for essence drops and forge grades.
   */
  getEssenceGrade(): number {
    return this.getActiveLayer().essenceGrade;
  }

  /**
   * Returns the highest rank units may reach on the active layer.
   * @returns The realm cap's rank title.
   */
  maxRankForLayer(): RankTitle {
    return this.getActiveLayer().realmCap;
  }

  /**
   * Reports whether a breakthrough to a rank is allowed by the realm cap.
   * Cultivation calls this before starting a breakthrough.
   * @param target - Rank the unit would reach.
   * @returns True when the target is at or below the cap.
   */
  canReachRank(target: RankTitle): boolean {
    return isRankWithinCap(target, this.maxRankForLayer());
  }

  /**
   * Scales a base essence amount by the active essence grade.
   * @param baseAmount - Grade-1 essence amount.
   * @returns Essence after the grade multiplier.
   */
  gradeEssence(baseAmount: number): number {
    return baseAmount * this.getEssenceGrade();
  }

  /**
   * Essence the Hold gains per enemy kill from lifedrain, graded.
   * @returns Essence per kill (0 when lifedrain is not active).
   */
  essenceForKill(): number {
    return this.gradeEssence(baseEssencePerKill(this.environment([])));
  }

  /**
   * Reports whether the boss gate is open.
   * @returns True after the waves chunk reports the boss kill.
   */
  isBossGateCleared(): boolean {
    return this.bossGateCleared;
  }

  /**
   * Opens or closes the boss gate. Opening emits `layer_cleared` once.
   * Only the waves chunk calls this, on the layer boss's death.
   * @param cleared - New gate state.
   */
  setBossGateCleared(cleared: boolean): void {
    const opening = cleared && !this.bossGateCleared;
    this.bossGateCleared = cleared;
    if (!opening) {
      return;
    }
    this.ports.emit?.({
      layerId: this.getActiveLayer().id,
      type: "layer_cleared",
    });
  }

  /**
   * Reports whether `descend` would succeed now.
   * @returns True when the gate is open and a deeper layer exists.
   */
  canDescend(): boolean {
    return this.bossGateCleared && this.hasNextLayer();
  }

  /**
   * Handles the `descend` command. Rejected while the boss gate is closed
   * or on the final layer. On success: moves to the next layer, closes the
   * gate, restarts the hazard clock, resets Deep Works, emits
   * `layer_started`, and autosaves.
   * @param simSeconds - Sim time the new layer starts; defaults to the last `advanceTo` time.
   * @returns The new layer, or the rejection reason.
   */
  descend(simSeconds: number = this.nowSimSeconds): DescendResult {
    if (!this.bossGateCleared) {
      return { ok: false, reason: "boss_gate_closed" };
    }
    if (!this.hasNextLayer()) {
      return { ok: false, reason: "final_layer" };
    }
    this.beginLayer(this.layerIndex + 1, simSeconds);
    return { layer: this.getActiveLayer(), ok: true };
  }

  /**
   * Lets a boss phase own the rotating hazard. While set, the override
   * replaces the timed rotation in `getActiveHazards` (fixed layer hazards
   * stay), and `advanceTo` emits no rotation. Pass null to hand control back
   * to the clock. The integrator calls this while the Warden of Layers lives
   * and a phase has set `encounter.rotatedRule`, and clears it on the kill.
   * Emits `hazard_rotated` when the effective rotating hazard changes.
   * Descending clears the override.
   * @param hazardId - Hazard the boss phase imposes, or null to release.
   */
  overrideHazard(hazardId: HazardId | null): void {
    const previous = this.rotationHazard;
    this.hazardOverride = hazardId;
    this.rotationHazard = this.currentRotationHazard();
    if (this.rotationHazard === null || this.rotationHazard === previous) {
      return;
    }
    this.ports.emit?.({
      hazardId: this.rotationHazard,
      layerId: this.getActiveLayer().id,
      type: "hazard_rotated",
    });
  }

  /**
   * Reports the boss-phase hazard override, if any.
   * @returns The override, or null while the rotation clock rules.
   */
  getHazardOverride(): HazardId | null {
    return this.hazardOverride;
  }

  /**
   * Lists hazards active right now (rotating on the Throne). A boss-phase
   * override replaces the timed rotation hazard.
   * @returns Active hazard ids.
   */
  getActiveHazards(): readonly HazardId[] {
    const layer = this.getActiveLayer();
    if (this.hazardOverride !== null) {
      return withOverride(layer.hazards, this.hazardOverride);
    }
    return activeHazardsAt(
      layer,
      this.nowSimSeconds - this.layerStartedAtSimSeconds,
    );
  }

  /**
   * Lists building and power ids unlocked by every layer reached so far.
   * @returns Unlock ids, earliest layer first.
   */
  getUnlockedAssets(): readonly string[] {
    return this.table.layers
      .slice(0, this.layerIndex + 1)
      .flatMap((layer) => layer.unlocks);
  }

  /**
   * Reports whether a building or power has been unlocked by descent.
   * @param assetId - Unlock id from the layer table (e.g. `hearth_ward`).
   * @returns True once a reached layer unlocks it.
   */
  isUnlocked(assetId: string): boolean {
    return this.getUnlockedAssets().includes(assetId);
  }

  /**
   * Builds the context hazard queries read for the current moment.
   * @param buildings - Buildings on the map (answers are read from these).
   * @returns Environment context.
   */
  environment(buildings: readonly LayerBuilding[]): EnvironmentContext {
    const layer = this.getActiveLayer();
    return {
      activeHazards: this.getActiveHazards(),
      buildings,
      table: this.table,
      ventVolumes: this.ports.ventVolumesFor?.(layer) ?? layer.ventVolumes,
    };
  }

  /**
   * Returns every environment effect for one unit right now.
   * @param buildings - Buildings on the map.
   * @param unit - Position and school of the unit.
   * @returns Burn, vision, move, gather, and healing values.
   */
  environmentAt(
    buildings: readonly LayerBuilding[],
    unit: Pick<LayerUnit, "x" | "y" | "school">,
  ): EnvironmentEffect {
    return environmentAt(this.environment(buildings), unit);
  }

  /**
   * Computes vent burn for every unit over one sim step.
   * @param buildings - Buildings on the map.
   * @param units - Units to test.
   * @param stepSeconds - Sim-seconds covered by this step.
   * @returns One entry per burning unit.
   */
  collectVentBurns(
    buildings: readonly LayerBuilding[],
    units: readonly LayerUnit[],
    stepSeconds: number,
  ): HazardBurn[] {
    return collectVentBurns(this.environment(buildings), units, stepSeconds);
  }

  /**
   * Returns JSON-safe state for the sim-core save blob.
   * @returns Serializable runtime state.
   */
  serialize(): LayerRuntimeState {
    return {
      bossGateCleared: this.bossGateCleared,
      hazardOverride: this.hazardOverride,
      layerId: this.getActiveLayer().id,
      layerStartedAtSimSeconds: this.layerStartedAtSimSeconds,
      nowSimSeconds: this.nowSimSeconds,
    };
  }

  /**
   * Loads saved state without autosaving, resetting, or emitting. Saves
   * written before `hazardOverride` existed load with no override.
   * @param state - State from `serialize`.
   */
  restore(state: LayerRuntimeState): void {
    this.layerIndex = this.indexOf(state.layerId);
    this.bossGateCleared = state.bossGateCleared;
    this.hazardOverride = state.hazardOverride ?? null;
    this.layerStartedAtSimSeconds = state.layerStartedAtSimSeconds;
    this.nowSimSeconds = state.nowSimSeconds;
    this.rotationHazard = this.currentRotationHazard();
  }

  /**
   * Enters a layer: updates state, then resets Deep Works, emits
   * `layer_started`, and autosaves, in that order.
   * @param index - Table index of the layer to enter.
   * @param simSeconds - Sim time the layer starts.
   */
  private beginLayer(index: number, simSeconds: number): void {
    this.layerIndex = index;
    this.bossGateCleared = false;
    this.hazardOverride = null;
    this.layerStartedAtSimSeconds = simSeconds;
    this.nowSimSeconds = simSeconds;
    this.rotationHazard = this.currentRotationHazard();
    const layer = this.getActiveLayer();
    this.ports.resetDeepWorks?.(layer);
    this.ports.emit?.({ layerId: layer.id, type: "layer_started" });
    this.ports.autosave?.(layer);
  }

  /**
   * Returns the current rotation hazard, or null on a non-rotating layer.
   * @returns Active rotation hazard id or null.
   */
  private currentRotationHazard(): HazardId | null {
    const layer = this.getActiveLayer();
    if (layer.hazardRotation === null) {
      return null;
    }
    const active = this.getActiveHazards();
    return active[active.length - 1] ?? null;
  }

  /**
   * Reports whether a deeper layer exists in the table.
   * @returns True when the active layer is not the last.
   */
  private hasNextLayer(): boolean {
    return this.layerIndex + 1 < this.table.layers.length;
  }

  /**
   * Returns the first layer id in the table.
   * @returns The opening layer's id.
   */
  private firstLayerId(): LayerId {
    const first = this.table.layers[0];
    if (first === undefined) {
      throw new Error("Layer table is empty");
    }
    return first.id;
  }

  /**
   * Finds a layer's table index.
   * @param layerId - Layer to find.
   * @returns Its index.
   */
  private indexOf(layerId: LayerId): number {
    const index = this.table.layers.findIndex((layer) => layer.id === layerId);
    if (index < 0) {
      throw new Error(`Unknown layer: ${layerId}`);
    }
    return index;
  }
}

/**
 * Fixed hazards plus one override, without duplicates.
 * @param fixed - The layer's always-on hazards.
 * @param override - Hazard a boss phase imposes.
 * @returns Active hazard ids.
 */
function withOverride(
  fixed: readonly HazardId[],
  override: HazardId,
): readonly HazardId[] {
  if (fixed.includes(override)) {
    return fixed;
  }
  return [...fixed, override];
}
