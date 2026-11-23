/**
 * Ashen Gate vertical slice: the integrator that turns the Descent chunks
 * into one playable layer.
 *
 * Module order: economy (stepping every `ECONOMY_STEP_TICKS`) → waves →
 * this slice. Each tick the slice runs the real `CombatSimulation` over Hold
 * soldiers, villagers, Ward Tower turrets, and horde bodies; routes horde
 * damage through the wave clock (elite affixes, boss phases, payouts); pays
 * kill merit and essence into `CultivationSystem`; advances training and
 * breakthroughs; and publishes `meta.ui` for the shell.
 *
 * Code lives in `logic/slice/`; this file wires it into a `SimModule`.
 */
import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentMapId,
} from "@resync-game-framework/api";
import {
  ASHEN_CRUCIBLE_MAP_SIZE,
  type AshenCruciblePlayer,
  generateAshenCrucibleMap,
} from "../data/layers/ashen_crucible";
import {
  ASHEN_GATE_CONTENT,
  ASHEN_GATE_MAP_SIZE,
  type AshenGateMapType,
  applyStartingResources,
  type DescentDifficulty,
  type DescentStartingResources,
  generateAshenGateMap,
  getDifficultyOption,
} from "../data/layers/ashen_gate";
import { BOSS_INTROS } from "../data/narrative";
import type { CombatCommand } from "./combat/types";
import { cancelConstruction } from "./economy/actions";
import { seedEconomyWorld } from "./economy/economy";
import type { EconomyUnit } from "./economy/model";
import { createEconomyModule } from "./economy/module";
import { asBuilding, economyHost, isEconomyUnit } from "./economy/records";
import { orderVillagersMove, orderVillagersStop } from "./economy/villagers";
import {
  advanceExploration,
  cancelExplorationHaul,
  discoverExplorationCamps,
  initializeExploration,
  isExplorationBossCampCleared,
  normalizeExplorationState,
} from "./exploration";
import { isFogVisible } from "./fog";
import { setLayerTerrain } from "./layers/hazards";
import { creditPlayerCultivation } from "./scoring";
import {
  type CommandHandlerMap,
  createDescentSim,
  type DescentSim,
  type SimModule,
  type SimWorldState,
  TICK_MS,
  type TickContext,
} from "./sim";
import { assignUniqueCultivatorName } from "./slice/cultivatorNames";
import { formationCenter, planFormation } from "./slice/formation";
import { runCombatTick } from "./slice/sliceCombat";
import {
  canUseCaptainBattlefieldBreakthrough,
  openCultivation,
  REALM_FOR_RANK,
  saveCultivation,
  unlockCaptainBattlefieldBreakthrough,
} from "./slice/sliceCultivation";
import {
  advanceCultivatorPowersTick,
  cancelMeditation,
  castQiArt,
  isCultivatorClass,
  toggleMeditate,
} from "./slice/sliceCultivatorPowers";
import { disbandHoldUnits } from "./slice/sliceDisband";
import { readFogOfWar, updateFogOfWar } from "./slice/sliceFog";
import {
  earlyCallBonus,
  formatEarlyCallBonus,
  publishPresentation,
} from "./slice/slicePresentation";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createSliceState,
  ECONOMY_STEP_TICKS,
  isAshenGateSliceState,
  pruneTransient,
  pushFx,
  pushNotice,
  sliceState,
  waveState,
} from "./slice/sliceState";
import {
  advanceTraining,
  cancelTraining,
  queueTraining,
  setTrainingRallyPoint,
  trainingRallyPoint,
} from "./slice/sliceTraining";
import {
  advanceWaypoints,
  appendWaypoints,
  clearWaypoints,
  isUnitTravelling,
  queuedWaypoints,
} from "./slice/sliceWaypoints";
import type { Command, SimSnapshot } from "./types";
import { callWorldNextWaveEarly, createWavesModule } from "./waves/module";

export type { AshenGateSliceState } from "./slice/sliceState";
export {
  ASHEN_GATE_SLICE_MODULE_ID,
  ECONOMY_STEP_TICKS,
} from "./slice/sliceState";

/** Options for a new playable Ashen Gate simulation. */
export interface AshenGateSimOptions {
  /** Wave difficulty preset; defaults to `"moderate"`. */
  difficulty?: DescentDifficulty;
  /** Terrain-focused map archetype; defaults to `"ashen_crossings"`. */
  mapType?: AshenGateMapType;
  /** Timed siege by default; stationary guarded camps in exploration mode. */
  mode?: "exploration" | "siege";
  /** Starting stockpile preset; defaults to `"standard"`. */
  startingResources?: DescentStartingResources;
  /**
   * Whether the map floods rivers and a pond. Defaults to true; scripted
   * scenarios that need a dry approach turn it off.
   */
  waterways?: boolean;
  seed: number;
  /** Optional predicate that pauses the next wave until ready (e.g. tutorial). */
  shouldHoldWave?: (world: SimWorldState, nextWaveIndex: number) => boolean;
}

/** Wave spawn-time multiplier for the co-op tutorial (50% more prep time). */
export const TUTORIAL_WAVE_TIME_SCALE = 1.5;

/** Horde HP and damage multiplier for the co-op tutorial (65% of normal). */
export const TUTORIAL_WAVE_STAT_SCALE = 0.65;

/** Extra starting supplies granted in the co-op tutorial so teams can practice freely. */
export const TUTORIAL_STOCKPILE_BONUS = {
  essence: 40,
  food: 100,
  iron: 30,
  stone: 80,
  water: 100,
  wood: 120,
} as const;

/** Options for a new 1–4 player co-op Descent simulation on Ashen Crucible. */
export interface MultiplayerDescentSimOptions {
  /** Selected multiplayer mode; defaults to `ashen_crucible`. */
  mapId?: DescentMapId;
  players: readonly AshenCruciblePlayer[];
  seed: number;
  /** Optional predicate that pauses the next wave until ready (e.g. tutorial). */
  shouldHoldWave?: (world: SimWorldState, nextWaveIndex: number) => boolean;
}

/**
 * Creates the Layer 1 composition without changing the empty generic sim.
 * @param options - Deterministic run seed and optional wave-hold hook
 * @returns A ready Ashen Gate simulation
 */
export function createAshenGateSim(options: AshenGateSimOptions): DescentSim {
  const exploration = options.mode === "exploration";
  const difficulty = getDifficultyOption(options.difficulty);
  const customDifficulty =
    !exploration &&
    (difficulty.waveStatScale !== 1 || difficulty.waveTimeScale !== 1);
  const waveOptions = exploration
    ? {
        scheduledWaves: false,
        ...(options.shouldHoldWave
          ? { shouldHoldWave: options.shouldHoldWave }
          : {}),
      }
    : customDifficulty || options.shouldHoldWave
      ? {
          ...(customDifficulty
            ? {
                waveStatScale: difficulty.waveStatScale,
                waveTimeScale: difficulty.waveTimeScale,
              }
            : {}),
          ...(options.shouldHoldWave
            ? { shouldHoldWave: options.shouldHoldWave }
            : {}),
        }
      : undefined;
  const needsCustomSlice =
    exploration ||
    options.waterways === false ||
    (options.mapType !== undefined && options.mapType !== "ashen_crossings") ||
    (options.startingResources !== undefined &&
      options.startingResources !== "standard");
  return createDescentSim({
    layerId: "ashen_gate",
    map: { ...ASHEN_GATE_MAP_SIZE },
    modules: [
      createEconomyModule({
        manualVillagers: true,
        stepEveryTicks: ECONOMY_STEP_TICKS,
      }),
      createWavesModule(undefined, waveOptions),
      needsCustomSlice
        ? createSliceModule({
            exploration,
            mapType: options.mapType,
            startingResources: options.startingResources,
            waterways: options.waterways,
          })
        : ashenGateSliceModule,
    ],
    seed: options.seed,
  });
}

/**
 * Creates a deterministic 1–4 player co-op Descent simulation on the Ashen
 * Crucible map. Every player starts with their own Camp, Captain Warden,
 * Villagers, and color; all players share the Hold faction and fight the
 * horde together without friendly fire.
 * @param options - Deterministic match seed and locked co-op roster
 * @returns A ready multiplayer Descent simulation
 */
export function createMultiplayerDescentSim(
  options: MultiplayerDescentSimOptions,
): DescentSim {
  const isTutorial = options.mapId === "ashen_crucible_tutorial";
  const campaignMission = DESCENT_CAMPAIGN_MISSIONS.find(
    (mission) => mission.id === options.mapId,
  );
  const baseWaveOptions = isTutorial
    ? {
        waveStatScale: TUTORIAL_WAVE_STAT_SCALE,
        waveTimeScale: TUTORIAL_WAVE_TIME_SCALE,
      }
    : campaignMission;
  const waveOptions = options.shouldHoldWave
    ? { ...baseWaveOptions, shouldHoldWave: options.shouldHoldWave }
    : baseWaveOptions;
  return createDescentSim({
    layerId: "ashen_gate",
    map: { ...ASHEN_CRUCIBLE_MAP_SIZE },
    modules: [
      createEconomyModule({
        manualVillagers: true,
        stepEveryTicks: ECONOMY_STEP_TICKS,
      }),
      createWavesModule(undefined, waveOptions),
      createSliceModule({ players: options.players, tutorial: isTutorial }),
    ],
    seed: options.seed,
  });
}

/**
 * Verifies that a loaded generic save belongs to this scenario version.
 * @param snapshot - Loaded sim snapshot
 * @returns Whether the Ashen Gate bridge can continue it
 */
export function isAshenGateSliceSnapshot(snapshot: SimSnapshot): boolean {
  if (snapshot.layerId !== "ashen_gate") return false;
  return isAshenGateSliceState(snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID]);
}

/**
 * Reports whether a snapshot belongs to the self-paced camp scenario.
 * @param snapshot - Sim snapshot to inspect
 * @returns True when guarded camps, rather than timed waves, drive the run
 */
export function isExplorationSnapshot(snapshot: SimSnapshot): boolean {
  if (!isAshenGateSliceSnapshot(snapshot)) return false;
  const state = snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID];
  return (
    typeof state === "object" &&
    state !== null &&
    "exploration" in state &&
    state.exploration !== undefined
  );
}

/**
 * Checks whether an actor is allowed to command a unit or building.
 * Solo commands omit `actorId` and always pass; multiplayer commands must
 * match the entity's `ownerId`.
 * @param ownerId - Entity owner id, if any
 * @param actorId - Issuing player id, if any
 * @returns Whether the actor controls this entity
 */
function canControlEntity(
  ownerId: string | undefined,
  actorId: string | undefined,
): boolean {
  if (actorId === undefined) return true;
  return ownerId === actorId;
}

/**
 * Filters unit ids to those owned by `actorId` (or all in solo play).
 * @param world - Sim world
 * @param unitIds - Candidate unit ids
 * @param actorId - Issuing player id, if any
 * @returns Authorized unit ids
 */
function authorizedUnitIds(
  world: SimWorldState,
  unitIds: readonly string[],
  actorId: string | undefined,
): string[] {
  if (actorId === undefined) return [...unitIds];
  return unitIds.filter((unitId) => {
    const unit = world.units.find((entry) => entry.id === unitId);
    return unit !== undefined && canControlEntity(unit.ownerId, actorId);
  });
}

/**
 * Checks whether `actorId` owns the named building (always true in solo play).
 * @param world - Sim world
 * @param buildingId - Candidate building id
 * @param actorId - Issuing player id, if any
 * @returns Whether the actor may command this building
 */
function ownsBuilding(
  world: SimWorldState,
  buildingId: string,
  actorId: string | undefined,
): boolean {
  if (actorId === undefined) return true;
  const building = world.buildings.find((entry) => entry.id === buildingId);
  return building !== undefined && canControlEntity(building.ownerId, actorId);
}

/**
 * Checks whether `actorId` owns the named unit (always true in solo play).
 * @param world - Sim world
 * @param unitId - Candidate unit id
 * @param actorId - Issuing player id, if any
 * @returns Whether the actor may command this unit
 */
function ownsUnit(
  world: SimWorldState,
  unitId: string,
  actorId: string | undefined,
): boolean {
  if (actorId === undefined) return true;
  const unit = world.units.find((entry) => entry.id === unitId);
  return unit !== undefined && canControlEntity(unit.ownerId, actorId);
}

interface SliceModuleConfig {
  /** Enables stationary solo camps and disables the timed wave schedule. */
  exploration?: boolean;
  /** Terrain-focused map archetype for solo Ashen Gate runs. */
  mapType?: AshenGateMapType;
  players?: readonly AshenCruciblePlayer[];
  /** Starting stockpile preset for solo runs. */
  startingResources?: DescentStartingResources;
  tutorial?: boolean;
  /** Set false to generate the map without rivers or ponds. */
  waterways?: boolean;
}

/**
 * Builds the Ashen Gate / Ashen Crucible integration module.
 * @param config - Optional multiplayer roster; omitted for solo Ashen Gate
 * @returns Configured `SimModule`
 */
function createSliceModule(config: SliceModuleConfig = {}): SimModule {
  const commands = {
    call_next_wave(
      _command: { actorId?: string; type: "call_next_wave" },
      context: TickContext,
    ) {
      callNextWave(context.world);
    },
    cancel_construction(
      command: Extract<Command, { type: "cancel_construction" }>,
      context: TickContext,
    ) {
      if (!ownsBuilding(context.world, command.buildingId, command.actorId)) {
        return;
      }
      const host = economyHost(context.world, ECONOMY_STEP_TICKS);
      if (!cancelConstruction(host, command.buildingId)) return;
      pushNotice(
        context.world,
        "Construction cancelled. Cost refunded.",
        "info",
      );
    },
    cancel_training(
      command: Extract<Command, { type: "cancel_training" }>,
      context: TickContext,
    ) {
      if (!ownsBuilding(context.world, command.buildingId, command.actorId)) {
        return;
      }
      if (!cancelTraining(context.world, command.buildingId, command.jobId)) {
        return;
      }
      pushNotice(context.world, "Training cancelled. Cost refunded.", "info");
    },
    cast_qi_art(
      command: Extract<Command, { type: "cast_qi_art" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      castQiArt(context, unitIds);
    },
    choose_school(
      command: Extract<Command, { type: "choose_school" }>,
      context: TickContext,
    ) {
      if (!ownsUnit(context.world, command.unitId, command.actorId)) return;
      const cultivation = openCultivation(context.world);
      if (!cultivation.hasUnit(command.unitId)) return;
      const result = cultivation.chooseSchool(command.unitId, command.school);
      saveCultivation(context.world, cultivation);
      if (!result.ok) {
        pushNotice(context.world, result.error, "warn");
        return;
      }
      pushNotice(
        context.world,
        `${schoolName(command.school)} school locked. ${schoolTagline(command.school)}`,
        "good",
      );
    },
    descend(
      _command: Extract<Command, { type: "descend" }>,
      context: TickContext,
    ) {
      if (!waveState(context.world).bossGateCleared) {
        pushNotice(context.world, "Boss still lives", "warn");
        return;
      }
      if (!isExplorationBossCampCleared(context.world)) {
        pushNotice(
          context.world,
          "Cinderjaw's remaining guards still protect the hoard. Clear them to claim the prize and finish.",
          "warn",
        );
        return;
      }
      const state = sliceState(context.world);
      state.outcome = "victory";
      context.world.paused = true;
      context.emit(ASHEN_GATE_SLICE_MODULE_ID, "slice_completed", {
        outcome: "victory",
      });
    },
    disband_units(
      command: Extract<Command, { type: "disband_units" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      const count = disbandHoldUnits(context.world, unitIds);
      if (count === 0) return;
      pushNotice(
        context.world,
        `${count} ${count === 1 ? "unit" : "units"} disbanded. Population freed.`,
        "info",
      );
    },
    feed_pill(
      command: Extract<Command, { type: "feed_pill" }>,
      context: TickContext,
    ) {
      if (!ownsUnit(context.world, command.unitId, command.actorId)) return;
      const cultivation = openCultivation(context.world);
      if (!cultivation.hasUnit(command.unitId)) return;
      const result = cultivation.feedPill(command.unitId, command.pillId);
      saveCultivation(context.world, cultivation);
      if (!result.ok) {
        pushNotice(context.world, result.error, "warn");
        return;
      }
      pushNotice(context.world, "The pill takes hold.", "good");
    },
    order_attack(
      command: Extract<Command, { type: "order_attack" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      cancelExplorationHaul(context.world, unitIds);
      cancelMeditation(context.world, unitIds);
      clearWaypoints(context.world, unitIds);
      queueOrder(context.world, { ...command, unitIds });
    },
    order_attack_move(
      command: Extract<Command, { type: "order_attack_move" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      cancelExplorationHaul(context.world, unitIds);
      cancelMeditation(context.world, unitIds);
      routeMove(context.world, { ...command, unitIds });
    },
    order_move(
      command: Extract<Command, { type: "order_move" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      cancelExplorationHaul(context.world, unitIds);
      cancelMeditation(context.world, unitIds);
      routeMove(context.world, { ...command, unitIds });
    },
    order_stop(
      command: Extract<Command, { type: "order_stop" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      cancelExplorationHaul(context.world, unitIds);
      clearWaypoints(context.world, unitIds);
      orderVillagersStop(
        economyHost(context.world, ECONOMY_STEP_TICKS),
        unitIds,
      );
      queueOrder(context.world, { ...command, unitIds });
    },
    set_formation(
      command: Extract<Command, { type: "set_formation" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      reformInPlace(context.world, { ...command, unitIds });
    },
    set_rally_point(
      command: Extract<Command, { type: "set_rally_point" }>,
      context: TickContext,
    ) {
      if (!ownsBuilding(context.world, command.buildingId, command.actorId)) {
        return;
      }
      const accepted = setTrainingRallyPoint(
        context.world,
        command.buildingId,
        command,
      );
      if (!accepted) return;
      const onNode =
        command.nodeId !== undefined &&
        trainingRallyPoint(context.world, command.buildingId)?.nodeId ===
          command.nodeId;
      pushNotice(
        context.world,
        onNode
          ? "Rally set on a resource. New villagers will gather there."
          : "Rally point set.",
        "info",
      );
    },
    start_breakthrough(
      command: {
        actorId?: string;
        hallId?: string;
        type: "start_breakthrough";
        unitId: string;
      },
      context: TickContext,
    ) {
      if (!ownsUnit(context.world, command.unitId, command.actorId)) return;
      if (
        command.hallId !== undefined &&
        !ownsBuilding(context.world, command.hallId, command.actorId)
      ) {
        return;
      }
      startBreakthrough(context.world, command.unitId, command.hallId);
    },
    toggle_meditate(
      command: Extract<Command, { type: "toggle_meditate" }>,
      context: TickContext,
    ) {
      const unitIds = authorizedUnitIds(
        context.world,
        command.unitIds,
        command.actorId,
      );
      if (unitIds.length === 0) return;
      cancelExplorationHaul(context.world, unitIds);
      clearWaypoints(context.world, unitIds);
      queueOrder(context.world, { type: "order_stop", unitIds });
      toggleMeditate(context.world, unitIds);
    },
    train_unit(
      command: Extract<Command, { type: "train_unit" }>,
      context: TickContext,
    ) {
      if (!ownsBuilding(context.world, command.buildingId, command.actorId)) {
        return;
      }
      queueTraining(
        context,
        command.buildingId,
        command.classId,
        command.count,
      );
    },
  } as CommandHandlerMap;
  return {
    commands,
    id: ASHEN_GATE_SLICE_MODULE_ID,
    init(world) {
      // Solo uses Ashen Gate; co-op uses the multi-Camp Ashen Crucible map.
      const explorationLayout =
        config.exploration === true
          ? generateAshenGateMap(world.seed, {
              mapType: config.mapType,
              waterways: config.waterways,
            })
          : null;
      const layout =
        explorationLayout ??
        (config.players !== undefined && config.players.length > 0
          ? generateAshenCrucibleMap(world.seed, config.players)
          : generateAshenGateMap(world.seed, {
              mapType: config.mapType,
              waterways: config.waterways,
            }));
      setLayerTerrain(world, {
        bridges: [...layout.bridges],
        hills: [...layout.hills],
        layerId: "ashen_gate",
        obstacles: [...layout.obstacles],
        ventVolumes: [...layout.vents],
      });
      const baseStockpile = applyStartingResources(
        layout.stockpile,
        config.startingResources,
      );
      const stockpile = config.tutorial
        ? {
            ...baseStockpile,
            essence:
              (baseStockpile.essence ?? 0) + TUTORIAL_STOCKPILE_BONUS.essence,
            food: (baseStockpile.food ?? 0) + TUTORIAL_STOCKPILE_BONUS.food,
            iron: (baseStockpile.iron ?? 0) + TUTORIAL_STOCKPILE_BONUS.iron,
            stone: (baseStockpile.stone ?? 0) + TUTORIAL_STOCKPILE_BONUS.stone,
            water: (baseStockpile.water ?? 0) + TUTORIAL_STOCKPILE_BONUS.water,
            wood: (baseStockpile.wood ?? 0) + TUTORIAL_STOCKPILE_BONUS.wood,
          }
        : baseStockpile;
      seedEconomyWorld(world, {
        buildings: [...layout.buildings],
        layerId: "ashen_gate",
        nodes: [...layout.nodes],
        playerCount: config.players?.length ?? 1,
        stockpile,
        units: [...layout.units],
        veins: [...layout.veins],
      });
      const initialSlice = createSliceState();
      if (config.players !== undefined && config.players.length > 0) {
        initialSlice.players = Object.fromEntries(
          config.players.map((player) => [player.id, { ...player }]),
        );
      }
      world.meta[ASHEN_GATE_SLICE_MODULE_ID] = initialSlice;
      if (explorationLayout !== null) {
        initialSlice.exploration = initializeExploration(
          world,
          explorationLayout,
        );
      }
      const cultivation = openCultivation(world);
      for (const unit of world.units) {
        if (!isEconomyUnit(unit) || unit.popKind !== "soldier") continue;
        if (isCultivatorClass(unit.classId) && unit.name === undefined) {
          unit.name = assignUniqueCultivatorName(world, unit.id);
        }
        cultivation.registerUnit({ maxHealth: unit.maxHp, unitId: unit.id });
      }
      saveCultivation(world, cultivation);
      const openingNotice = config.exploration
        ? "Exploration begun — no timed waves. Scout the rumored Threat I camp with your Captain and Rider, then choose your own route."
        : config.tutorial
          ? "Co-op Tutorial begun — follow the guide on the right to gather, build, and repel the Horde together!"
          : config.players !== undefined && config.players.length > 0
            ? "Ashen Crucible co-op begun — defend your allied Holds together!"
            : ASHEN_GATE_CONTENT.briefing;
      pushNotice(world, openingNotice, "info");
      updateFogOfWar(world, true);
      discoverExplorationCamps(world);
      publishPresentation(world);
    },
    onLoad(world) {
      if (!isAshenGateSliceState(world.meta[ASHEN_GATE_SLICE_MODULE_ID])) {
        return;
      }
      normalizeExplorationState(world);
      publishPresentation(world);
    },
    processors: [
      {
        id: "ashen-gate-outcome",
        phase: "layers",
        /**
         * Keeps a finished slice paused so Resume cannot run the Hold
         * underneath the victory or defeat overlay.
         * @param context - Tick being processed
         */
        run(context) {
          if (sliceState(context.world).outcome === "playing") return;
          context.world.paused = true;
        },
      },
      {
        id: "ashen-gate-combat",
        phase: "combat",
        run(context) {
          if (sliceState(context.world).outcome !== "playing") return;
          runCombatTick(context);
          advanceWaypoints(context.world);
          advanceTraining(context);
          checkDefeat(context);
        },
      },
      {
        id: "ashen-gate-cultivation",
        phase: "cultivation",
        run(context) {
          if (sliceState(context.world).outcome !== "playing") return;
          advanceExploration(context);
          if (unlockCaptainBattlefieldBreakthrough(context.world)) {
            const exploration =
              sliceState(context.world).exploration !== undefined;
            pushNotice(
              context.world,
              exploration
                ? "First camp cleared! Your Captain can break through to Sworn without a Cultivation Hall."
                : "Scouts repelled! Your Captain can break through to Sworn without a Cultivation Hall.",
              "good",
            );
          }
          advanceCultivatorPowersTick(context.world);
          advanceBreakthroughs(context);
        },
      },
      {
        id: "ashen-gate-presentation",
        phase: "waves",
        run(context) {
          announceBoss(context.world);
          pruneTransient(context.world);
          updateFogOfWar(context.world);
          discoverExplorationCamps(context.world);
          publishPresentation(context.world);
        },
      },
    ],
  };
}

/** The module that bridges economy, waves, combat, cultivation, and the UI. */
export const ashenGateSliceModule: SimModule = createSliceModule();

/**
 * Repositions a living selection around its current center in a new shape.
 * @param world - Sim world
 * @param command - Formation and selected unit ids
 */
function reformInPlace(
  world: SimWorldState,
  command: Extract<Command, { type: "set_formation" }>,
): void {
  const selected = new Set(command.unitIds);
  const members = world.units.filter(
    (unit) => selected.has(unit.id) && isEconomyUnit(unit) && unit.hp > 0,
  );
  const center = formationCenter(members);
  if (center === null) return;
  clearWaypoints(world, command.unitIds);
  marchInFormation(world, {
    ...center,
    formation: command.formation,
    type: "order_move",
    unitIds: command.unitIds,
  });
}

/**
 * A move or attack-move. With Shift held (`queue`) and the group still on
 * its way, each unit's slot at the new point waits behind its current legs;
 * otherwise the order replaces whatever the group was doing.
 * @param world - Sim world
 * @param command - Move or attack-move
 */
function routeMove(
  world: SimWorldState,
  command: Extract<Command, { type: "order_attack_move" | "order_move" }>,
): void {
  const members = livingMembers(world, command.unitIds);
  const travelling = members.some((unit) => isUnitTravelling(world, unit));
  if (command.queue !== true || !travelling) {
    clearWaypoints(world, command.unitIds);
    marchInFormation(world, command);
    return;
  }
  // Plan the leg from where each unit will be when it starts it.
  const startingPoints = members.map((unit) => {
    const legs = queuedWaypoints(world, unit.id);
    const last = legs[legs.length - 1];
    return last === undefined ? unit : { ...unit, x: last.x, y: last.y };
  });
  const slots = clampSlots(
    planFormation(
      startingPoints,
      { x: command.x, y: command.y },
      command.formation ?? "ranks",
    ),
    world.map,
  );
  appendWaypoints(world, slots, command.type === "order_attack_move");
}

/**
 * @param world - Sim world
 * @param unitIds - Selected unit ids
 * @returns The living Hold units among them
 */
function livingMembers(
  world: SimWorldState,
  unitIds: readonly string[],
): EconomyUnit[] {
  const selected = new Set(unitIds);
  return world.units.filter(
    (unit): unit is EconomyUnit =>
      selected.has(unit.id) && isEconomyUnit(unit) && unit.hp > 0,
  );
}

/**
 * Sends a selection to a point in formation. Every living Hold unit gets its
 * own slot, frontline classes in front and villagers at the rear. Villagers
 * walk through the economy; soldiers get a combat order that carries their
 * slots and marches them at the group's slowest speed.
 * @param world - Sim world
 * @param command - Move or attack-move
 */
function marchInFormation(
  world: SimWorldState,
  command: Extract<Command, { type: "order_attack_move" | "order_move" }>,
): void {
  const members = livingMembers(world, command.unitIds);
  const slots = clampSlots(
    planFormation(
      members,
      { x: command.x, y: command.y },
      command.formation ?? "ranks",
    ),
    world.map,
  );
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const unit of members) {
    if (unit.classId !== "villager") continue;
    orderVillagersMove(host, [unit.id], slots[unit.id] ?? command);
  }
  queueOrder(world, { ...command, destinations: slots, keepPace: true });
}

/**
 * Keeps formation slots on the map.
 * @param slots - Planned destinations keyed by unit id
 * @param map - Map bounds
 * @returns The same slots, clamped inside the map
 */
function clampSlots(
  slots: Record<string, { x: number; y: number }>,
  map: { height: number; width: number },
): Record<string, { x: number; y: number }> {
  const clamped: Record<string, { x: number; y: number }> = {};
  for (const [unitId, slot] of Object.entries(slots)) {
    clamped[unitId] = {
      x: Math.min(Math.max(0, slot.x), Math.max(0, map.width - 1)),
      y: Math.min(Math.max(0, slot.y), Math.max(0, map.height - 1)),
    };
  }
  return clamped;
}

/**
 * Queues a combat order for living Hold soldiers in the selection.
 * Villagers are skipped; the economy walks them.
 * @param world - Sim world
 * @param command - Move, attack, attack-move, or stop
 */
function queueOrder(world: SimWorldState, command: CombatCommand): void {
  const unitIds = command.unitIds.filter((unitId) => {
    const unit = world.units.find((entry) => entry.id === unitId);
    return (
      unit !== undefined &&
      isEconomyUnit(unit) &&
      unit.hp > 0 &&
      unit.popKind !== "villager"
    );
  });
  if (unitIds.length === 0) return;
  sliceState(world).combat.pendingOrders.push({ ...command, unitIds });
}

/**
 * Pulls the next scheduled wave forward and awards a scaled supply bonus.
 * @param world - Sim world
 */
function callNextWave(world: SimWorldState): void {
  if (sliceState(world).outcome !== "playing") return;
  if (waveState(world).scheduledWaves === false) {
    pushNotice(
      world,
      "Exploration has no timed waves. Find a camp and attack when ready.",
      "info",
    );
    return;
  }
  if (waveState(world).waveHeld === true) {
    pushNotice(world, "Wave is currently held.", "warn");
    return;
  }
  const result = callWorldNextWaveEarly(world);
  if (!result.called) {
    pushNotice(world, "No upcoming wave to call early.", "warn");
    return;
  }
  const bonus = earlyCallBonus(result.secondsSkipped);
  world.resources.food += bonus.food;
  world.resources.wood += bonus.wood;
  world.resources.essence += bonus.essence;
  pushNotice(
    world,
    `Wave called early! Bonus: ${formatEarlyCallBonus(bonus)}.`,
    "good",
  );
}

/**
 * Validates the selected Hall (or a starting Captain's unlocked battlefield
 * breakthrough) and starts a breakthrough channel.
 * @param world - Sim world
 * @param unitId - Cultivator
 * @param hallId - Completed Cultivation Hall, optional for Captain battlefield breakthrough
 */
function startBreakthrough(
  world: SimWorldState,
  unitId: string,
  hallId?: string,
): void {
  const hall =
    hallId === undefined
      ? undefined
      : world.buildings.find(
          (building) =>
            building.id === hallId &&
            building.buildingType === "cultivation_hall" &&
            asBuilding(building).completed,
        );
  const captainBattlefield =
    hall === undefined && canUseCaptainBattlefieldBreakthrough(world, unitId);
  if (hall === undefined && !captainBattlefield) {
    pushNotice(world, "Build a Cultivation Hall first.", "warn");
    return;
  }
  const cultivation = openCultivation(world, {
    bypassHallMaterials: captainBattlefield,
    hallId: hall?.id,
  });
  if (!cultivation.hasUnit(unitId)) return;
  const result = cultivation.startBreakthrough(unitId);
  saveCultivation(world, cultivation);
  if (!result.ok) {
    pushNotice(world, result.error, "warn");
    return;
  }
  pushNotice(
    world,
    `Breakthrough begun — ${Math.round(result.value.successChance * 100)}% chance. Hold the line for ${result.value.remainingSeconds}s.`,
    "info",
  );
}

/**
 * Resolves breakthrough channels on sim time with seeded rolls.
 * @param context - Current tick
 */
function advanceBreakthroughs(context: TickContext): void {
  const world = context.world;
  const seconds = TICK_MS / 1_000;
  const state = sliceState(world);
  const channeling = state.cultivation.units.filter(
    (unit) => unit.activeBreakthrough !== undefined,
  );
  const hasInjuries = Object.keys(state.injuries).length > 0;
  if (channeling.length === 0 && !hasInjuries) return;
  const rolls: Record<string, number> = {};
  for (const unit of channeling) {
    const left = unit.activeBreakthrough?.remainingSeconds ?? 0;
    if (left - seconds <= 0) rolls[unit.unitId] = context.rng.next();
  }
  const cultivation = openCultivation(world);
  const outcomes = cultivation.advanceBreakthroughs(seconds, rolls);
  for (const outcome of outcomes) {
    const unit = world.units.find((entry) => entry.id === outcome.unitId);
    if (!outcome.succeeded) {
      pushNotice(
        world,
        "Breakthrough failed. Merit is kept; essence is halved; the cultivator is injured for 45s.",
        "bad",
      );
      continue;
    }
    if (unit && isEconomyUnit(unit)) {
      unit.realmId = REALM_FOR_RANK[outcome.targetRank];
      // Full health now; the next combat tick scales both to the new realm.
      unit.hp = unit.maxHp;
      pushFx(world, { kind: "ascend", x: unit.x, y: unit.y });
    }
    if (unit?.ownerId !== undefined) {
      creditPlayerCultivation(world, unit.ownerId, outcome.sourceRank);
    }
    pushNotice(
      world,
      `Breakthrough! A ${outcome.targetRank} rises. Choose Ember, Rime, or Blood.`,
      "good",
    );
  }
  saveCultivation(world, cultivation);
}

/**
 * Ends the run when the Camp falls.
 * @param context - Current tick
 */
function checkDefeat(context: TickContext): void {
  const world = context.world;
  const campStands = world.buildings.some(
    (building) => asBuilding(building).buildingType === "camp",
  );
  if (campStands) return;
  sliceState(world).outcome = "defeat";
  world.paused = true;
  context.emit(ASHEN_GATE_SLICE_MODULE_ID, "slice_completed", {
    outcome: "defeat",
  });
}

/**
 * Shows Cinderjaw's first grievance once the boss is on the field.
 * @param world - Sim world
 */
function announceBoss(world: SimWorldState): void {
  const state = sliceState(world);
  if (state.bossIntroShown) return;
  const boss = waveState(world).units.find(
    (unit) => unit.bossId === ASHEN_GATE_CONTENT.bossId,
  );
  if (!boss || !isFogVisible(readFogOfWar(world), boss)) return;
  state.bossIntroShown = true;
  const line = BOSS_INTROS.cinderjaw.lines[0];
  pushNotice(world, `${line.speaker}: “${line.text}”`, "warn");
}

/**
 * @param school - School id
 * @returns Title-cased name
 */
function schoolName(school: string): string {
  return school.slice(0, 1).toUpperCase() + school.slice(1);
}

/**
 * @param school - School id
 * @returns One-line description of its combat effect
 */
function schoolTagline(school: string): string {
  if (school === "ember") return "Hits burn, and burns spread on kill.";
  if (school === "rime") return "Hits chill; a second hit freezes.";
  return "Hits heal the attacker.";
}
