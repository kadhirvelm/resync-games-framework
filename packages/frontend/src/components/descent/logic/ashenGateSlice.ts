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
import { ASHEN_GATE_CONTENT, ASHEN_GATE_MAP } from "../data/layers/ashen_gate";
import { BOSS_INTROS } from "../data/narrative";
import type { CombatCommand } from "./combat/types";
import { seedEconomyWorld } from "./economy/economy";
import { createEconomyModule } from "./economy/module";
import { asBuilding, economyHost, isEconomyUnit } from "./economy/records";
import { orderVillagersMove, orderVillagersStop } from "./economy/villagers";
import {
  createDescentSim,
  type DescentSim,
  type SimModule,
  type SimWorldState,
  TICK_MS,
  type TickContext,
} from "./sim";
import { planFormation } from "./slice/formation";
import { runCombatTick } from "./slice/sliceCombat";
import {
  completedHall,
  openCultivation,
  REALM_FOR_RANK,
  saveCultivation,
} from "./slice/sliceCultivation";
import { publishPresentation } from "./slice/slicePresentation";
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
import type { Command, SimSnapshot } from "./types";
import { createWavesModule } from "./waves/module";

export type { AshenGateSliceState } from "./slice/sliceState";
export {
  ASHEN_GATE_SLICE_MODULE_ID,
  ECONOMY_STEP_TICKS,
} from "./slice/sliceState";

/** Options for a new playable Ashen Gate simulation. */
export interface AshenGateSimOptions {
  seed: number;
}

/**
 * Creates the Layer 1 composition without changing the empty generic sim.
 * @param options - Deterministic run seed
 * @returns A ready Ashen Gate simulation
 */
export function createAshenGateSim(options: AshenGateSimOptions): DescentSim {
  return createDescentSim({
    layerId: "ashen_gate",
    map: { height: ASHEN_GATE_MAP.height, width: ASHEN_GATE_MAP.width },
    modules: [
      createEconomyModule({
        manualVillagers: true,
        stepEveryTicks: ECONOMY_STEP_TICKS,
      }),
      createWavesModule(),
      ashenGateSliceModule,
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

/** The module that bridges economy, waves, combat, cultivation, and the UI. */
export const ashenGateSliceModule: SimModule = {
  commands: {
    cancel_training(command, context) {
      if (!cancelTraining(context.world, command.buildingId, command.jobId)) {
        return;
      }
      pushNotice(context.world, "Training cancelled. Cost refunded.", "info");
    },
    choose_school(command, context) {
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
    descend(_command, context) {
      if (!waveState(context.world).bossGateCleared) {
        pushNotice(context.world, "Boss still lives", "warn");
        return;
      }
      const state = sliceState(context.world);
      state.outcome = "victory";
      context.world.paused = true;
      context.emit(ASHEN_GATE_SLICE_MODULE_ID, "slice_completed", {
        outcome: "victory",
      });
    },
    feed_pill(command, context) {
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
    order_attack(command, context) {
      queueOrder(context.world, command);
    },
    order_attack_move(command, context) {
      marchInFormation(context.world, command);
    },
    order_move(command, context) {
      marchInFormation(context.world, command);
    },
    order_stop(command, context) {
      orderVillagersStop(
        economyHost(context.world, ECONOMY_STEP_TICKS),
        command.unitIds,
      );
      queueOrder(context.world, command);
    },
    set_rally_point(command, context) {
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
    start_breakthrough(command, context) {
      startBreakthrough(context.world, command.unitId);
    },
    train_unit(command, context) {
      queueTraining(
        context,
        command.buildingId,
        command.classId,
        command.count,
      );
    },
  },
  id: ASHEN_GATE_SLICE_MODULE_ID,
  init(world) {
    seedEconomyWorld(world, {
      buildings: [...ASHEN_GATE_MAP.buildings],
      layerId: "ashen_gate",
      nodes: [...ASHEN_GATE_MAP.nodes],
      stockpile: ASHEN_GATE_MAP.stockpile,
      units: [...ASHEN_GATE_MAP.units],
      veins: [...ASHEN_GATE_MAP.veins],
    });
    world.meta[ASHEN_GATE_SLICE_MODULE_ID] = createSliceState();
    const cultivation = openCultivation(world);
    for (const unit of world.units) {
      if (!isEconomyUnit(unit) || unit.popKind !== "soldier") continue;
      cultivation.registerUnit({ maxHealth: unit.maxHp, unitId: unit.id });
    }
    saveCultivation(world, cultivation);
    pushNotice(world, ASHEN_GATE_CONTENT.briefing, "info");
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
        advanceTraining(context);
        checkDefeat(context);
      },
    },
    {
      id: "ashen-gate-cultivation",
      phase: "cultivation",
      run(context) {
        if (sliceState(context.world).outcome !== "playing") return;
        advanceBreakthroughs(context);
      },
    },
    {
      id: "ashen-gate-presentation",
      phase: "waves",
      run(context) {
        announceBoss(context.world);
        pruneTransient(context.world);
        publishPresentation(context.world);
      },
    },
  ],
};

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
  const selected = new Set(command.unitIds);
  const members = world.units.filter(
    (unit) => selected.has(unit.id) && isEconomyUnit(unit) && unit.hp > 0,
  );
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
 * Validates the Hall and starts a breakthrough channel.
 * @param world - Sim world
 * @param unitId - Cultivator
 */
function startBreakthrough(world: SimWorldState, unitId: string): void {
  if (completedHall(world) === null) {
    pushNotice(world, "Build a Cultivation Hall first.", "warn");
    return;
  }
  const cultivation = openCultivation(world);
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
  if (!boss) return;
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
