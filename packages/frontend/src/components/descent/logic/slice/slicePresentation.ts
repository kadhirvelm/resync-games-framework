import {
  ASHEN_GATE_BUILDINGS,
  ASHEN_GATE_CONTENT,
  ASHEN_GATE_STARTING_VILLAGERS,
} from "../../data/layers/ashen_gate";
import type {
  BossReadout,
  BrewReadout,
  BuildingReadout,
  BuildReadout,
  DescentPresentation,
  HoldUpgradeReadout,
  MarketReadout,
  ObjectiveReadout,
  PillFeedReadout,
  RationReadout,
  SliceOutcomeReadout,
  TrainReadout,
  UnitReadout,
  WaveReadout,
} from "../../views/presentation";
import { getUnitDefinition } from "../combat/unitCatalog";
import type { CultivationSystem } from "../cultivation/cultivationSystem";
import { PILLS } from "../cultivation/data";
import type { CultivationView } from "../cultivation/types";
import { growthFraction } from "../economy/harvest";
import type { EconomyUnit, HoldTier } from "../economy/model";
import {
  getHoldTier,
  getItemCount,
  getPopCap,
  getPopUsed,
} from "../economy/queries";
import { asBuilding, economyHost, isEconomyUnit } from "../economy/records";
import { canAfford } from "../economy/stockpile";
import {
  buildingDef,
  holdTierDef,
  listBuildingDefs,
  listPillRecipes,
  marketRates,
  workerSlots,
} from "../economy/tables";
import { activeWorkers } from "../economy/villagers";
import { worldVentVolumes } from "../layers/hazards";
import { TICKS_PER_SECOND } from "../sim/constants";
import type { SimWorldState } from "../sim/world";
import type { ClassId, ResourceStockpile, SchoolId } from "../types";
import { getBossDefinition, getSchedule, isLayerId } from "../waves/catalog";
import { readOmen } from "../waves/clock";
import type { WaveClockState, WaveDefinition } from "../waves/types";
import { TOWER_PREFIX } from "./sliceCombat";
import {
  completedHall,
  layerSchoolModifier,
  openCultivation,
} from "./sliceCultivation";
import { readFogOfWar } from "./sliceFog";
import {
  type AshenGateSliceState,
  ECONOMY_STEP_TICKS,
  sliceState,
  waveState,
} from "./sliceState";
import {
  BARRACKS_CLASSES,
  isTrainingShortfall,
  trainingBlocker,
  trainingPlan,
  trainingRallyPoint,
} from "./sliceTraining";
import { unitRoute } from "./sliceWaypoints";

const TIER_ORDER: readonly HoldTier[] = ["Camp", "Stronghold", "Citadel"];

/**
 * Publishes the complete read model consumed by the Descent shell under
 * `meta.ui`. Called at the end of every tick; never changes rules.
 * @param world - Sim world
 */
export function publishPresentation(world: SimWorldState): void {
  const state = sliceState(world);
  const waves = waveState(world);
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const cultivation = openCultivation(world);
  world.meta.ui = {
    boss: bossReadout(waves),
    bossGateCleared: waves.bossGateCleared,
    brewOptions: brewOptions(world),
    buildings: buildingReadouts(world, state),
    buildOptions: buildOptions(world),
    calamities: [],
    fog: readFogOfWar(world),
    fx: state.fx,
    hellPressure: waves.hellPressure,
    holdUpgrade: holdUpgrade(world),
    marketRates: marketReadouts(world),
    nodes: host.economy.nodes
      .filter((node) => node.remaining > 0)
      .map((node) => ({
        gatherers: gatherersAt(world.units, node.id),
        id: node.id,
        label: `${resourceName(node.resourceId)} ${Math.ceil(node.remaining)}`,
        remaining: Math.ceil(node.remaining),
        resource: node.resourceId,
        x: node.x,
        y: node.y,
      })),
    notices: publishedNotices(state, host.economy.rejection),
    objectives: objectives(world, state, waves),
    omen: readOmen(waves),
    onboarding: onboarding(state),
    outcome: outcomeReadout(state.outcome),
    pillFeeds: pillFeeds(world, cultivation),
    pop: { cap: getPopCap(host), used: getPopUsed(host) },
    rations: rationReadout(world),
    revives: [],
    stats: {
      elapsedSeconds: Math.floor(world.tick / TICKS_PER_SECOND),
      kills: state.stats.kills,
      lost: state.stats.lost,
    },
    telegraphs: telegraphs(waves),
    trainOptions: trainOptions(world),
    treasures: [],
    units: unitReadouts(world, state, waves, cultivation),
    veins: host.economy.veins.map((vein) => ({ ...vein, radius: 0.5 })),
    vents: worldVentVolumes(world).map((vent, index) => ({
      ...vent,
      id: `ashen-vent-${index + 1}`,
      label: "Ember vent",
    })),
    wave: waveReadout(waves),
  } satisfies DescentPresentation;
}

/**
 * Counts villagers working one node: gathering there now, or carrying a load
 * home and due back.
 * @param units - Economy units
 * @param nodeId - Node to count
 * @returns How many villagers work the node
 */
function gatherersAt(units: SimWorldState["units"], nodeId: string): number {
  return units.filter((unit) => {
    if (!isEconomyUnit(unit) || unit.hp <= 0) return false;
    if (unit.task?.kind === "gather") return unit.task.nodeId === nodeId;
    return unit.preferredNodeId === nodeId;
  }).length;
}

/**
 * Hold and horde unit decorations.
 * @param world - Sim world
 * @param state - Slice state
 * @param waves - Wave clock
 * @param cultivation - Open cultivation system
 * @returns Readouts keyed by unit id
 */
function unitReadouts(
  world: SimWorldState,
  state: AshenGateSliceState,
  waves: WaveClockState,
  cultivation: CultivationSystem,
): Record<string, UnitReadout> {
  const units: Record<string, UnitReadout> = {};
  for (const unit of world.units) {
    if (isEconomyUnit(unit)) {
      units[unit.id] = holdUnitReadout(world, state, unit, cultivation);
      continue;
    }
    const horde = waves.units.find((entry) => entry.id === unit.id);
    if (!horde) continue;
    const boss = horde.bossId ? getBossDefinition(horde.bossId) : null;
    units[unit.id] = {
      affix: horde.affix,
      factionId: "horde",
      hitPoints: Math.max(0, horde.hitPoints),
      maxHitPoints: horde.maxHitPoints,
      name: boss
        ? `${boss.name}, the ${boss.title}`
        : hordeName(horde.classId, horde.affix),
      role: horde.role,
      school: horde.school ?? undefined,
    };
  }
  return units;
}

/**
 * One Hold unit's decoration, including the cultivation panel.
 * @param world - Sim world
 * @param state - Slice state
 * @param unit - Economy record
 * @param cultivation - Open cultivation system
 * @returns Readout
 */
function holdUnitReadout(
  world: SimWorldState,
  state: AshenGateSliceState,
  unit: EconomyUnit,
  cultivation: CultivationSystem,
): UnitReadout {
  const fed = unit.modifiers.some((modifier) => modifier.healthBonus > 0);
  if (unit.classId === "villager") {
    return {
      carrying: unit.carry?.resourceId ?? null,
      carryingAmount: unit.carry?.amount ?? 0,
      factionId: "hold",
      fed,
      hitPoints: Math.max(0, unit.hp),
      idle: unit.task === null && !unit.garrisoned,
      maxHitPoints: unit.maxHp,
      name: "Villager",
      ...routeField(world, unit),
      task: villagerTask(world, unit),
    };
  }
  const definition = getUnitDefinition(
    unit.classId as Exclude<ClassId, "villager">,
  );
  const readout: UnitReadout = {
    factionId: "hold",
    fed,
    hitPoints: Math.max(0, Math.round(unit.hp)),
    maxHitPoints: Math.round(unit.maxHp),
    name: definition.name.replace("Hold ", ""),
    ...routeField(world, unit),
  };
  if (!cultivation.hasUnit(unit.id)) return readout;
  const record = cultivation.getUnitState(unit.id);
  const view = withHallRequirement(
    world,
    cultivation.getCultivationView(unit.id),
  );
  const active = record.activeBreakthrough;
  return {
    ...readout,
    channel: active
      ? 1 - active.remainingSeconds / channelSeconds(active.sourceRank)
      : undefined,
    cultivation: view,
    injured: (state.injuries[unit.id] ?? 0) > 0,
    rank: record.rank,
    school: record.school,
    schoolModifier: record.school
      ? layerSchoolModifier(world, record.school)
      : undefined,
  };
}

/**
 * @param world - Sim world
 * @param unit - Living Hold unit
 * @returns A `route` field when the unit is headed somewhere, else nothing
 */
function routeField(
  world: SimWorldState,
  unit: EconomyUnit,
): Pick<UnitReadout, "route"> {
  const route = unitRoute(world, unit);
  return route.length === 0 ? {} : { route };
}

/**
 * Adds the "build a Cultivation Hall" gate the cultivation system cannot see.
 * @param world - Sim world
 * @param view - Cultivation view
 * @returns The view with the Hall requirement when missing
 */
function withHallRequirement(
  world: SimWorldState,
  view: CultivationView,
): CultivationView {
  if (view.meritToNext === 0) return view;
  if (completedHall(world) !== null) return view;
  return {
    ...view,
    missingRequirements: [
      ...view.missingRequirements,
      "Build a Cultivation Hall.",
    ],
  };
}

/**
 * @param rank - Rank the channel started from
 * @returns Channel length in seconds
 */
function channelSeconds(rank: string): number {
  return rank === "Champion" ? 30 : 20;
}

/**
 * @param world - Sim world, read for node and building names
 * @param unit - Villager
 * @returns What it is doing, for the unit panel
 */
function villagerTask(world: SimWorldState, unit: EconomyUnit): string {
  const task = unit.task;
  if (unit.garrisoned) return "Sheltering";
  if (task?.kind === "carry" && unit.carry) {
    return `Carrying ${resourceName(unit.carry.resourceId)} home`;
  }
  if (task === null) return "Idle";
  if (task.kind === "gather") {
    const host = economyHost(world, ECONOMY_STEP_TICKS);
    const node = host.economy.nodes.find((entry) => entry.id === task.nodeId);
    return node ? `Gathering ${resourceName(node.resourceId)}` : "Gathering";
  }
  if (task.kind === "move") return "Moving";
  if (task.kind === "garrison") return "Heading to shelter";
  const building = world.buildings.find(
    (entry) => entry.id === task.buildingId,
  );
  const name = building ? buildingName(building.buildingType) : "a building";
  if (task.kind === "build") return `Building ${name}`;
  if (task.kind === "repair") return `Repairing ${name}`;
  if (task.kind === "work") return `Working the ${name}`;
  if (task.kind === "harvest") return harvesterTask(building, name);
  return "Hauling";
}

/**
 * @param building - Harvested producer the villager tends, if it still stands
 * @param name - Its display name
 * @returns Whether the villager is picking a ripe crop or waiting on growth
 */
function harvesterTask(
  building: SimWorldState["buildings"][number] | undefined,
  name: string,
): string {
  const growth = building ? growthFraction(asBuilding(building)) : null;
  if (growth === null) return `Tending the ${name}`;
  if (growth >= 1) return `Harvesting the ${name}`;
  return `Tending the ${name} (${Math.floor(growth * 100)}% grown)`;
}

/**
 * @param classId - Horde class
 * @param affix - Elite affix, if any
 * @returns Display name
 */
function hordeName(classId: ClassId, affix: string | null): string {
  const base = `Imp ${className(classId)}`;
  if (affix === null) return base;
  return `${affix.slice(0, 1).toUpperCase()}${affix.slice(1)} ${base}`;
}

/**
 * Building decorations, including construction and training progress.
 * @param world - Sim world
 * @param state - Slice state
 * @returns Readouts keyed by building id
 */
function buildingReadouts(
  world: SimWorldState,
  state: AshenGateSliceState,
): Record<string, BuildingReadout> {
  const buildings: Record<string, BuildingReadout> = {};
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const building of world.buildings) {
    const record = asBuilding(building);
    const readout: BuildingReadout = {
      constructing: record.constructing,
      factionId: "hold",
      hitPoints: Math.max(0, Math.round(record.hp)),
      maxHitPoints: record.maxHp,
      name: buildingName(record.buildingType),
      onVein: record.onSpiritVein,
      tier: record.tier,
    };
    if (record.constructing) {
      readout.progress = record.buildTicksDone / Math.max(1, record.buildTicks);
      readout.activity = "Under construction";
    }
    const queue = state.training.filter((job) => job.buildingId === record.id);
    const head = queue[0];
    const rallyPoint = trainingRallyPoint(world, record.id);
    if (rallyPoint !== null) readout.rallyPoint = rallyPoint;
    if (queue.length > 0) {
      readout.trainingQueue = queue.map((job, index) => ({
        classId: job.classId,
        count: job.count,
        id: job.id,
        label: className(job.classId),
        progress: index === 0 ? 1 - job.remainingTicks / job.totalTicks : 0,
      }));
    }
    if (head) {
      readout.progress = 1 - head.remainingTicks / head.totalTicks;
      readout.activity = `Training ${head.count} ${className(head.classId)}${head.count > 1 ? "s" : ""}`;
      readout.queue = queue.length;
    }
    if (record.brew) {
      readout.progress =
        record.brew.progress / Math.max(1, record.brew.required);
      readout.activity = `Brewing ${pillName(record.brew.pillId)}`;
    }
    const production = buildingDef(record.buildingType)?.production;
    const growth = growthFraction(record);
    if (growth !== null) {
      readout.progress = growth;
      readout.growth = { progress: growth, ripe: growth >= 1 };
      readout.activity = cropActivity(
        record.buildingType,
        record.production !== null,
        growth,
        harvesterAssigned(world, record.id),
      );
    } else if (
      production !== null &&
      production !== undefined &&
      record.completed
    ) {
      readout.progress =
        (record.production?.progress ?? 0) / Math.max(1, production.everyTicks);
      readout.activity = productionActivity(
        record.buildingType,
        record.production !== null,
        activeWorkers(host, record),
      );
    }
    if (record.buildingType === "camp" && host.economy.upgrade) {
      const total = holdTierDef(host.economy.upgrade.target)?.upgradeTicks ?? 1;
      readout.progress =
        1 - host.economy.upgrade.ticksLeft / Math.max(1, total);
      readout.activity = `Raising ${host.economy.upgrade.target}`;
    }
    buildings[record.id] = readout;
  }
  return buildings;
}

/**
 * Tier-gated building choices with placement hints.
 * @param world - Sim world
 * @returns Build menu entries
 */
function buildOptions(world: SimWorldState): BuildReadout[] {
  const tier = getHoldTier(economyHost(world, ECONOMY_STEP_TICKS));
  return listBuildingDefs()
    .filter((definition) =>
      (ASHEN_GATE_BUILDINGS as readonly string[]).includes(definition.id),
    )
    .map((definition) => {
      const tierUnlocked = tierIndex(tier) >= tierIndex(definition.tier);
      const affordable = canAfford(world.resources, definition.cost);
      const hints: string[] = [];
      if (definition.veinBonus) hints.push("Bonus on a Spirit Vein.");
      if (definition.id === "fire_ward_wall") {
        hints.push("Wards nearby units from vent burn.");
      }
      if (definition.id === "ward_tower") hints.push("Shoots the horde.");
      if (definition.blocksHorde) hints.push("Blocks the horde.");
      if (definition.popBonus)
        hints.push(`+${definition.popBonus} population.`);
      if (definition.production) {
        const seconds =
          (definition.production.everyTicks * ECONOMY_STEP_TICKS) /
          TICKS_PER_SECOND;
        const input = costLabel(definition.production.input);
        const inputLabel = input === "Free" ? "No input" : `Uses ${input}`;
        hints.push(
          `${inputLabel}; makes ${costLabel(definition.production.output)} every ${seconds}s.`,
        );
        const workerHint = workerSlotHint(definition.production.workers);
        if (workerHint !== null) hints.push(workerHint);
        if (definition.production.harvest) {
          hints.push("Grows on its own; a villager harvests it when ripe.");
        }
      }
      let lockedReason: string | undefined;
      if (!tierUnlocked) lockedReason = `Needs ${definition.tier}`;
      else if (!affordable) lockedReason = "Not enough resources";
      return {
        buildingType: definition.id,
        cost: { ...definition.cost },
        costLabel: costLabel(definition.cost),
        hints,
        job: definition.job,
        lockedReason,
        name: definition.name,
        tier: definition.tier,
        unlocked: tierUnlocked && affordable,
      };
    });
}

/**
 * Training choices: five classes at each Barracks, villagers at the Camp.
 * @param world - Sim world
 * @returns Train options
 */
function trainOptions(world: SimWorldState): TrainReadout[] {
  return world.buildings.flatMap((building) => {
    const record = asBuilding(building);
    let classes: readonly ClassId[] = [];
    if (record.buildingType === "barracks") classes = BARRACKS_CLASSES;
    if (record.buildingType === "camp") classes = ["villager"];
    return classes.map((classId) => {
      const plan = trainingPlan(classId);
      const reason = trainingBlocker(world, record.id, classId);
      return {
        allowed: reason === null,
        buildingId: record.id,
        classId,
        cost: { ...plan.cost },
        count: plan.count,
        detail: `${plan.count > 1 ? `×${plan.count} · ` : ""}${costLabel(plan.cost)} · ${Math.round(plan.seconds)}s`,
        food: plan.cost.food ?? 0,
        label: plan.count > 1 ? `${className(classId)}s` : className(classId),
        pop: plan.pop,
        reason: reason ?? undefined,
        seconds: plan.seconds,
        shortfall: isTrainingShortfall(reason),
        water: plan.cost.water ?? 0,
      };
    });
  });
}

/**
 * Every pill recipe at each completed Alchemy Furnace.
 * @param world - Sim world
 * @returns Brew options
 */
function brewOptions(world: SimWorldState): BrewReadout[] {
  return world.buildings.flatMap((building) => {
    const furnace = asBuilding(building);
    if (furnace.buildingType !== "alchemy_furnace" || !furnace.completed) {
      return [];
    }
    return listPillRecipes().map((recipe) => {
      const affordable = canAfford(world.resources, recipe.ingredients);
      const idle = furnace.brew === null;
      let reason: string | undefined;
      if (!idle) reason = "Furnace is already brewing";
      else if (!affordable) reason = "Ingredients are missing";
      return {
        allowed: reason === undefined,
        detail: `${costLabel(recipe.ingredients)} · ${Math.round(recipe.brewTicks / 2)}s`,
        furnaceId: furnace.id,
        name: recipe.name,
        pillId: recipe.id,
        reason,
      };
    });
  });
}

/**
 * Projected pill feeds for every cultivator and every pill in stock.
 * @param world - Sim world
 * @param cultivation - Open cultivation system
 * @returns Feed previews
 */
function pillFeeds(
  world: SimWorldState,
  cultivation: CultivationSystem,
): PillFeedReadout[] {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const stocked = PILLS.filter(
    (pill) =>
      (pill.role === "permanent" || pill.role === "dao") &&
      getItemCount(host, pill.id) > 0,
  );
  if (stocked.length === 0) return [];
  return world.units.flatMap((unit) => {
    if (!cultivation.hasUnit(unit.id)) return [];
    return stocked.map((pill) => {
      const preview = cultivation.previewPill(unit.id, pill.id);
      return {
        pillName: pill.name,
        preview,
        schoolMatchLabel: schoolMatchLabel(pill.school, preview.schoolMatch),
        unitId: unit.id,
      };
    });
  });
}

/**
 * @param school - Pill school, if any
 * @param match - Whether it matches the unit's school
 * @returns Display copy
 */
function schoolMatchLabel(
  school: SchoolId | undefined,
  match: boolean | undefined,
): string {
  if (school === undefined) return "Works for any school.";
  if (match === true) return "Matches this unit's school — full effect.";
  return "Off-school — half effect.";
}

/**
 * The Mess Hall's ration action.
 * @param world - Sim world
 * @returns Ration readout, or null without a Mess Hall
 */
function rationReadout(world: SimWorldState): RationReadout | null {
  const hall = world.buildings.find((building) => {
    const record = asBuilding(building);
    return record.buildingType === "mess_hall" && record.completed;
  });
  if (!hall) return null;
  const ration = buildingDef("mess_hall")?.ration;
  const unitIds = world.units
    .filter(
      (unit) =>
        isEconomyUnit(unit) && unit.popKind === "soldier" && unit.hp > 0,
    )
    .map((unit) => unit.id);
  const batches = Math.max(1, Math.ceil(unitIds.length / 5));
  const cost = {
    food: (ration?.food ?? 10) * batches,
    water: (ration?.water ?? 10) * batches,
  };
  const allowed = unitIds.length > 0 && canAfford(world.resources, cost);
  return {
    allowed,
    detail: `${costLabel(cost)} feeds ${unitIds.length} soldiers: +10% health and regen for the next wave.`,
    messHallId: hall.id,
    reason: allowed ? undefined : "Need soldiers and enough food and water",
    unitIds,
  };
}

/**
 * The next Hold tier upgrade.
 * @param world - Sim world
 * @returns Readout, or null at Citadel
 */
function holdUpgrade(world: SimWorldState): HoldUpgradeReadout | null {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const tier = getHoldTier(host);
  const target = TIER_ORDER[tierIndex(tier) + 1];
  if (!target) return null;
  const definition = holdTierDef(target);
  if (!definition) return null;
  const pending = host.economy.upgrade !== null;
  const affordable = canAfford(world.resources, definition.upgradeCost);
  let reason: string | undefined;
  if (pending) reason = `${target} is already rising`;
  else if (!affordable) reason = "Not enough resources";
  return {
    allowed: reason === undefined,
    cost: { ...definition.upgradeCost },
    costLabel: costLabel(definition.upgradeCost),
    currentTier: tier,
    inProgress: upgradeProgress(host.economy.upgrade, definition.upgradeTicks),
    reason,
    shortfall: !pending && !affordable,
    targetTier: target,
  };
}

/**
 * How far a started Hold upgrade has come.
 * @param upgrade - The economy's running upgrade, if any
 * @param totalSteps - Economy steps the whole upgrade takes
 * @returns Progress and time left, or null when no upgrade is running
 */
function upgradeProgress(
  upgrade: { ticksLeft: number } | null,
  totalSteps: number,
): HoldUpgradeReadout["inProgress"] {
  if (upgrade === null) return null;
  const total = Math.max(1, totalSteps);
  const left = Math.min(total, Math.max(0, upgrade.ticksLeft));
  return {
    progress: 1 - left / total,
    secondsLeft: Math.ceil((left * ECONOMY_STEP_TICKS) / TICKS_PER_SECOND),
  };
}

/**
 * The next scheduled wave and its countdown. Composition stays an Omen
 * Tower secret; the clock itself is never hidden.
 * @param waves - Wave clock
 * @returns Wave readout, or null when no layer is running
 */
function waveReadout(waves: WaveClockState): WaveReadout | null {
  if (!isLayerId(waves.layerId)) return null;
  const schedule = getSchedule(waves.layerId).waves;
  const elapsed =
    (waves.completedTick - waves.layerStartedTick) / TICKS_PER_SECOND;
  const nextIndex = schedule.findIndex(
    (wave) => !waves.spawnedWaveIds.includes(wave.id),
  );
  const live = waves.units.length;
  if (nextIndex < 0) {
    return {
      etaSeconds: null,
      index: schedule.length,
      label: waves.bossGateCleared ? "The gate is open" : "Final wave",
      live,
      total: schedule.length,
      type: "boss",
    };
  }
  const wave = schedule[nextIndex] as WaveDefinition;
  return {
    etaSeconds: Math.max(0, Math.ceil(wave.spawnAtSeconds - elapsed)),
    index: nextIndex + 1,
    label: waveLabel(wave),
    live,
    total: schedule.length,
    type: wave.type,
  };
}

/**
 * @param wave - Wave definition
 * @returns Player-facing wave name
 */
function waveLabel(wave: WaveDefinition): string {
  if (wave.bossId) {
    const boss = getBossDefinition(wave.bossId);
    return `${boss.name}, the ${boss.title}`;
  }
  if (wave.type === "elite") return "Elite raid";
  if (wave.type === "swarm") return "Swarm";
  return "Scouts";
}

/**
 * The living boss, for the boss health bar.
 * @param waves - Wave clock
 * @returns Readout, or null when no boss is on the field
 */
function bossReadout(waves: WaveClockState): BossReadout | null {
  const boss = waves.units.find((unit) => unit.role === "boss" && unit.bossId);
  if (!boss?.bossId) return null;
  const definition = getBossDefinition(boss.bossId);
  return {
    hitPoints: Math.max(0, Math.round(boss.hitPoints)),
    maxHitPoints: boss.maxHitPoints,
    name: definition.name,
    title: definition.title,
    unitId: boss.id,
  };
}

/**
 * Boss wind-up rings.
 * @param waves - Wave clock
 * @returns Telegraphs
 */
function telegraphs(
  waves: WaveClockState,
): NonNullable<DescentPresentation["telegraphs"]> {
  return waves.pendingTwists.flatMap((twist) => {
    const boss = waves.units.find((unit) => unit.bossId === twist.bossId);
    if (!boss) return [];
    return [
      {
        id: `${twist.bossId}-${twist.phaseId}`,
        kind: "boss_windup" as const,
        label: "Wind-up",
        radius: 5,
        x: boss.x,
        y: boss.y,
      },
    ];
  });
}

/**
 * The teaching checklist for Ashen Gate.
 * @param world - Sim world
 * @param state - Slice state
 * @param waves - Wave clock
 * @returns Objectives in order
 */
function objectives(
  world: SimWorldState,
  state: AshenGateSliceState,
  waves: WaveClockState,
): ObjectiveReadout[] {
  /**
   * @param type - Building type
   * @returns Whether a completed one stands
   */
  const has = (type: string) =>
    world.buildings.some((building) => {
      const record = asBuilding(building);
      return record.buildingType === type && record.completed;
    });
  const soldiers = world.units.filter(
    (unit) => isEconomyUnit(unit) && unit.popKind === "soldier",
  ).length;
  const tier = getHoldTier(economyHost(world, ECONOMY_STEP_TICKS));
  const sworn = state.cultivation.units.some((unit) => unit.rank !== "Ashborn");
  const villagers = world.units.filter(
    (unit) => isEconomyUnit(unit) && unit.popKind === "villager",
  );
  const working = villagers.some(
    (unit) =>
      isEconomyUnit(unit) &&
      (Boolean(unit.preferredNodeId) || Boolean(unit.workplaceId)),
  );
  return [
    {
      done: working,
      id: "gather",
      label: "Put villagers to work: select them, right-click a resource",
    },
    {
      done: villagers.length > ASHEN_GATE_STARTING_VILLAGERS,
      id: "villager",
      label: "Select the Camp and train another villager",
    },
    {
      done: has("barracks"),
      id: "barracks",
      label: "Build a Barracks: select villagers, press Build",
    },
    { done: soldiers >= 6, id: "train", label: "Train five soldiers" },
    {
      done: has("omen_tower"),
      id: "omen",
      label: "Raise an Omen Tower to read waves",
    },
    {
      done: tier !== "Camp",
      id: "stronghold",
      label: "Upgrade the Hold to Stronghold",
    },
    {
      done: has("alchemy_furnace") && has("cultivation_hall"),
      id: "hall",
      label: "Build an Alchemy Furnace and Cultivation Hall",
    },
    { done: sworn, id: "sworn", label: "Promote a soldier to Sworn" },
    {
      done: waves.bossGateCleared,
      id: "boss",
      label: `Slay ${ASHEN_GATE_CONTENT.bossName}`,
    },
  ];
}

/**
 * Coach marks stay pending until the player has done each thing once.
 * @param state - Slice state
 * @returns Onboarding flags
 */
function onboarding(
  state: AshenGateSliceState,
): NonNullable<DescentPresentation["onboarding"]> {
  const units = state.cultivation.units;
  return {
    pill: !units.some((unit) => unit.appliedPills.length > 0),
    realmGate: !units.some((unit) => unit.rank !== "Ashborn"),
    school: !units.some((unit) => unit.school !== undefined),
  };
}

/**
 * Shows a failed placement ahead of the slice's own notices.
 * @param state - Slice state
 * @param rejection - Economy placement rejection, if any
 * @returns Notice readouts
 */
function publishedNotices(
  state: AshenGateSliceState,
  rejection: string | null,
): NonNullable<DescentPresentation["notices"]> {
  const notices = state.notices.map((notice) => ({
    id: notice.id,
    text: notice.text,
    tone: notice.tone,
  }));
  if (rejection === null || rejection.length === 0) return notices;
  return [{ id: -1, text: rejection, tone: "warn" }, ...notices];
}

/**
 * Terminal overlay copy.
 * @param outcome - Slice outcome
 * @returns Readout, or null while playing
 */
function outcomeReadout(
  outcome: AshenGateSliceState["outcome"],
): SliceOutcomeReadout | null {
  if (outcome === "playing") return null;
  if (outcome === "victory") {
    return {
      body: ASHEN_GATE_CONTENT.victory,
      kind: "victory",
      title: "Ashen Gate secured",
    };
  }
  return {
    body: ASHEN_GATE_CONTENT.defeat,
    kind: "defeat",
    title: "The Hold went dark",
  };
}

/**
 * @param tier - Hold tier
 * @returns Its position on the ladder
 */
function tierIndex(tier: HoldTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Formats a sparse cost.
 * @param cost - Resource amounts
 * @returns Display text
 */
export function costLabel(cost: Partial<ResourceStockpile>): string {
  const entries = Object.entries(cost).filter(
    ([, amount]) => (amount ?? 0) > 0,
  );
  if (entries.length === 0) return "Free";
  return entries
    .map(([resourceId, amount]) => `${resourceName(resourceId)} ${amount}`)
    .join(" · ");
}

/**
 * Publishes the three renewable-resource sales offered by the Hell Market.
 * @param world - Sim world whose current layer sets prices
 * @returns Food, Water, and Wood sale choices in stable order
 */
function marketReadouts(world: SimWorldState): MarketReadout[] {
  const rates = marketRates(world.layerId);
  const resources = ["food", "water", "wood"] as const;
  return resources.map((resource) => ({
    buy: "coin",
    label: `Sell 1 ${resourceName(resource)} for ${rates.sell[resource] ?? 0} Coin.`,
    sell: resource,
  }));
}

/**
 * @param buildingType - Producer building id
 * @param running - Whether its inputs have been paid and its timer is moving
 * @param workers - Villagers working it this step
 * @returns Short activity copy for the building panel
 */
function productionActivity(
  buildingType: string,
  running: boolean,
  workers: number,
): string {
  const slots = workerSlots(buildingType);
  if (slots > 0 && workers === 0) return "Needs a villager to work it";
  const crew = slots > 1 ? ` (${workers}/${slots} workers)` : "";
  if (running || buildingType === "well") {
    return `${producingLabel(buildingType)}${crew}`;
  }
  return "Waiting for Water";
}

/**
 * @param buildingType - Harvested producer id
 * @param growing - Whether its inputs have been paid and a crop is in the ground
 * @param growth - How far the crop has grown, 0 to 1
 * @param harvester - Whether a villager is assigned to harvest it
 * @returns Short activity copy with the growth percentage
 */
function cropActivity(
  buildingType: string,
  growing: boolean,
  growth: number,
  harvester: boolean,
): string {
  if (!growing) return "Waiting for Water";
  if (growth < 1) {
    return `${producingLabel(buildingType)}: ${Math.floor(growth * 100)}%`;
  }
  if (harvester) return "Ripe; harvester on the way";
  return "Ripe; send a villager to harvest";
}

/**
 * @param world - Sim world
 * @param buildingId - Harvested producer
 * @returns Whether a villager holds its harvest job
 */
function harvesterAssigned(world: SimWorldState, buildingId: string): boolean {
  return world.units.some(
    (unit) =>
      isEconomyUnit(unit) &&
      unit.task?.kind === "harvest" &&
      unit.task.buildingId === buildingId,
  );
}

/**
 * @param buildingType - Producer building id
 * @returns What the producer is doing while its timer runs
 */
function producingLabel(buildingType: string): string {
  if (buildingType === "well") return "Drawing Water";
  if (buildingType === "farm") return "Growing Food";
  if (buildingType === "forest") return "Growing Wood";
  return "Growing Spirit Herbs";
}

/**
 * @param workers - Worker slots from the production row
 * @returns Build-menu copy for how many villagers it takes, or null when none
 */
function workerSlotHint(workers: number | null): string | null {
  if (workers === null) return null;
  if (workers === 1) return "Needs 1 villager working it.";
  return `Up to ${workers} villagers work it; each speeds it up.`;
}

/**
 * @param resourceId - Resource id
 * @returns Title-cased display name
 */
function resourceName(resourceId: string): string {
  if (resourceId === "spirit_herbs") return "Herbs";
  return resourceId.slice(0, 1).toUpperCase() + resourceId.slice(1);
}

/**
 * @param buildingType - Building type
 * @returns Display name
 */
function buildingName(buildingType: string): string {
  return buildingDef(buildingType)?.name ?? buildingType;
}

/**
 * @param classId - Class id
 * @returns Display name
 */
function className(classId: ClassId): string {
  return classId.slice(0, 1).toUpperCase() + classId.slice(1);
}

/**
 * @param pillId - Pill id
 * @returns Display name
 */
function pillName(pillId: string): string {
  return PILLS.find((pill) => pill.id === pillId)?.name ?? pillId;
}

export { TOWER_PREFIX };
