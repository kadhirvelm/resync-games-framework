/**
 * Villagers gather, carry, build, repair, work and harvest producers, and
 * garrison.
 * Soldiers are skipped.
 * A carried load is delivered before a new job is chosen.
 */

import {
  cellStaysClear,
  escapeHurtCell,
  type HurtDisk,
} from "../pathing/avoidHurt";
import {
  buildingCovering,
  footprintDistance,
  footprintReach,
} from "./footprint";
import { chebyshev, nextStep } from "./grid";
import {
  HARVESTERS_PER_BUILDING,
  harvestDef,
  isRipe,
  takeHarvest,
} from "./harvest";
import { compareIds } from "./ids";
import type {
  EconomyBuilding,
  EconomyHost,
  EconomyUnit,
  Point,
  ResourceNode,
  VillagerTask,
} from "./model";
import { asBuilding, findBuilding, isEconomyUnit } from "./records";
import {
  additionalWorkerBuildBonus,
  buildingDef,
  firstWorkerBuildBonus,
  repairHpPerTick,
  resourceDef,
  workerSlots,
} from "./tables";
import { seedWork } from "./works";

/** Most villagers that can work one construction site at once. */
export const MAX_BUILDERS_PER_SITE = 5;

/**
 * Calculates construction progress for one economy step. The first villager
 * establishes a deliberately slow baseline; helpers contribute at full speed.
 * @param workers - Adjacent villagers assigned to the site
 * @returns Progress to add this economy step
 */
export function constructionProgressPerStep(workers: number): number {
  const activeWorkers = Math.min(
    MAX_BUILDERS_PER_SITE,
    Math.max(0, Math.floor(workers)),
  );
  if (activeWorkers === 0) return 0;
  return (
    firstWorkerBuildBonus() + (activeWorkers - 1) * additionalWorkerBuildBonus()
  );
}

/** Economy steps a villager skips a target it could not reach (10 s at 0.5 s per step). */
export const UNREACHABLE_COOLDOWN_STEPS = 20;

/** How far a villager looks for follow-up work after a node or site is done. */
export const NEARBY_WORK_RADIUS = 10;

/**
 * How villagers find work. Automatic villagers pick their own jobs. Manual
 * villagers only work what the player ordered, and then pick up nearby
 * follow-up work: another site, or the same resource once a node runs dry.
 */
export interface VillagerPolicy {
  manual: boolean;
}

/** Villagers choose their own jobs. Headless economy tools use this. */
export const AUTO_VILLAGERS: VillagerPolicy = { manual: false };

/**
 * Assigns idle villagers, then advances every villager one step.
 * @param host - World whose units move
 * @param policy - Whether idle villagers choose their own jobs
 */
export function stepVillagers(
  host: EconomyHost,
  policy: VillagerPolicy = AUTO_VILLAGERS,
): void {
  assignIdle(host, policy);
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    stepOne(host, unit);
  }
  spreadSettledVillagers(host);
}

/** Cell offsets tried, nearest first, when a villager needs its own cell. */
const SPREAD_OFFSETS: readonly { x: number; y: number }[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/**
 * The cell a villager's task keeps it beside, or null when it has none.
 * @param host - World of nodes and buildings
 * @param unit - Villager
 * @returns The node or building the villager works at, if any
 */
function taskAnchor(
  host: EconomyHost,
  unit: EconomyUnit,
): { reach: number; x: number; y: number } | null {
  const task = unit.task;
  if (!task) return null;
  if (task.kind === "move") return { reach: 1, x: task.x, y: task.y };
  if (task.kind === "gather") {
    const node = host.economy.nodes.find((entry) => entry.id === task.nodeId);
    return node ? { reach: 1, x: node.x, y: node.y } : null;
  }
  const building = findBuilding(host, task.buildingId);
  if (!building) return null;
  return { reach: footprintReach(building), x: building.x, y: building.y };
}

/**
 * Gives every standing villager its own cell. Villagers still walking may
 * pass through each other, so paths never deadlock; once a villager stops
 * (idle, or working beside its node or building) and finds another already
 * on its cell, it steps to the nearest free cell that still touches its work.
 * @param host - World whose villagers settle
 */
export function spreadSettledVillagers(host: EconomyHost): void {
  const claimed = new Set<string>();
  const disks = host.getVentVolumes();
  const nodeCells = new Set(
    host.economy.nodes.map((node) => `${node.x},${node.y}`),
  );
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.hp <= 0 || unit.popKind !== "villager" || unit.garrisoned) {
      continue;
    }
    const anchor = taskAnchor(host, unit);
    const settled = anchor === null || chebyshev(unit, anchor) <= anchor.reach;
    if (!settled || unit.task?.kind === "move") continue;
    const key = `${unit.x},${unit.y}`;
    if (!claimed.has(key)) {
      claimed.add(key);
      continue;
    }
    const free = SPREAD_OFFSETS.map((offset) => ({
      x: unit.x + offset.x,
      y: unit.y + offset.y,
    })).find(
      (cell) =>
        !claimed.has(`${cell.x},${cell.y}`) &&
        !nodeCells.has(`${cell.x},${cell.y}`) &&
        cellOpenToAlly(host, cell.x, cell.y) &&
        cellStaysClear(disks, cell.x, cell.y) &&
        (anchor === null || chebyshev(cell, anchor) <= anchor.reach),
    );
    if (free === undefined) continue;
    unit.x = free.x;
    unit.y = free.y;
    claimed.add(`${free.x},${free.y}`);
  }
}

/**
 * Living villagers among the given ids.
 * @param host - World of units
 * @param unitIds - Ids the player selected
 * @returns Villager records, in the order given
 */
function selectedVillagers(
  host: EconomyHost,
  unitIds: readonly string[],
): EconomyUnit[] {
  const villagers: EconomyUnit[] = [];
  for (const unitId of unitIds) {
    const unit = host.units.find((entry) => entry.id === unitId);
    if (!unit || !isEconomyUnit(unit)) continue;
    if (unit.popKind !== "villager" || unit.hp <= 0) continue;
    villagers.push(unit);
  }
  return villagers;
}

/**
 * Walks villagers to a cell. They drop their standing job and idle there.
 * @param host - World whose villagers move
 * @param unitIds - Selected units; non-villagers are ignored
 * @param point - Destination in map space; rounded and clamped to the map
 * @returns How many villagers took the order
 */
export function orderVillagersMove(
  host: EconomyHost,
  unitIds: readonly string[],
  point: Point,
): number {
  const x = clampCell(point.x, host.map.width);
  const y = clampCell(point.y, host.map.height);
  const villagers = selectedVillagers(host, unitIds);
  for (const unit of villagers) {
    unit.garrisoned = false;
    unit.preferredNodeId = null;
    unit.workplaceId = null;
    unit.task = { kind: "move", x, y };
  }
  return villagers.length;
}

/**
 * Stops villagers where they stand and clears their standing job.
 * @param host - World whose villagers stop
 * @param unitIds - Selected units; non-villagers are ignored
 * @returns How many villagers stopped
 */
export function orderVillagersStop(
  host: EconomyHost,
  unitIds: readonly string[],
): number {
  const villagers = selectedVillagers(host, unitIds);
  for (const unit of villagers) {
    unit.preferredNodeId = null;
    unit.workplaceId = null;
    unit.task = null;
  }
  return villagers.length;
}

/**
 * Sends villagers to work one node. They return to it after each load and
 * move to the nearest node of the same resource when it runs dry.
 * @param host - World of nodes
 * @param unitIds - Selected units; non-villagers are ignored
 * @param nodeId - Node to work
 * @returns How many villagers took the order
 */
export function orderVillagersGather(
  host: EconomyHost,
  unitIds: readonly string[],
  nodeId: string,
): number {
  const node = host.economy.nodes.find((entry) => entry.id === nodeId);
  if (!node || node.remaining <= 0) return 0;
  const villagers = selectedVillagers(host, unitIds);
  for (const unit of villagers) {
    unit.preferredNodeId = nodeId;
    unit.workplaceId = null;
    unit.garrisoned = false;
    unit.unreachable = (unit.unreachable ?? []).filter(
      (entry) => entry.targetId !== nodeId,
    );
    unit.task = null;
  }
  return villagers.length;
}

/**
 * Sends villagers to a Hold building. They build a site, repair a damaged
 * building, deposit what they carry at a drop-off, or work a producer while
 * it has a free worker slot; otherwise they walk next to it.
 * @param host - World of buildings
 * @param unitIds - Selected units; non-villagers are ignored
 * @param buildingId - Target building
 * @returns How many villagers took the order
 */
export function orderVillagersBuild(
  host: EconomyHost,
  unitIds: readonly string[],
  buildingId: string,
): number {
  const building = findBuilding(host, buildingId);
  if (!building) return 0;
  const villagers = selectedVillagers(host, unitIds);
  for (const unit of villagers) {
    unit.garrisoned = false;
    unit.unreachable = (unit.unreachable ?? []).filter(
      (entry) => entry.targetId !== buildingId,
    );
    unit.task = null;
    unit.task = taskAtBuilding(host, unit, building);
    if (unit.task.kind !== "work" && unit.task.kind !== "harvest") {
      if (unit.workplaceId === building.id) unit.workplaceId = null;
      continue;
    }
    unit.workplaceId = building.id;
    unit.preferredNodeId = null;
  }
  return villagers.length;
}

/**
 * @param host - World of villagers already working the building
 * @param unit - Villager receiving the order
 * @param building - Building the player right-clicked
 * @returns The job that building offers this villager
 */
function taskAtBuilding(
  host: EconomyHost,
  unit: EconomyUnit,
  building: EconomyBuilding,
): VillagerTask {
  if (building.constructing) return { buildingId: building.id, kind: "build" };
  if (building.completed && building.hp < building.maxHp) {
    return { buildingId: building.id, kind: "repair" };
  }
  if (unit.carry && isDropOff(building)) {
    return { buildingId: building.id, kind: "carry" };
  }
  const job = standingJobAt(building);
  if (job !== null && hasFreeSlot(host, building)) {
    return { buildingId: building.id, kind: job };
  }
  return { kind: "move", x: building.x, y: building.y };
}

/**
 * @param building - Candidate producer
 * @returns The standing job it offers villagers: work it, harvest it, or none
 */
function standingJobAt(building: EconomyBuilding): "harvest" | "work" | null {
  if (workerSlots(building.buildingType) > 0) return "work";
  if (harvestDef(building.buildingType) !== null) return "harvest";
  return null;
}

/**
 * @param host - World of villagers
 * @param building - Candidate producer
 * @returns Whether it is finished, offers a standing job, and has a slot
 *   for that job nobody holds
 */
function hasFreeSlot(host: EconomyHost, building: EconomyBuilding): boolean {
  if (!building.completed) return false;
  const job = standingJobAt(building);
  if (job === null) return false;
  const slots =
    job === "work"
      ? workerSlots(building.buildingType)
      : HARVESTERS_PER_BUILDING;
  return workersAssigned(host, job, building.id) < slots;
}

/**
 * Counts the villagers working a producer this step: assigned to it, alive,
 * and standing beside it, capped at its worker slots.
 * @param host - World of villagers
 * @param building - Producer to count for
 * @returns Active workers, 0 when it takes none
 */
export function activeWorkers(
  host: EconomyHost,
  building: EconomyBuilding,
): number {
  const slots = workerSlots(building.buildingType);
  if (slots === 0) return 0;
  let count = 0;
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.hp <= 0 || unit.popKind !== "villager") continue;
    if (unit.task?.kind !== "work" || unit.task.buildingId !== building.id)
      continue;
    if (!besideBuilding(unit, building)) continue;
    count += 1;
  }
  return Math.min(slots, count);
}

/**
 * @param host - World of villagers
 * @param building - Producer to count for
 * @returns Villagers assigned to work it, whether or not they have arrived
 */
export function assignedWorkers(
  host: EconomyHost,
  building: EconomyBuilding,
): number {
  return workersAssigned(host, "work", building.id);
}

/**
 * @param value - Map coordinate
 * @param size - Map extent on that axis
 * @returns The whole cell inside the map
 */
function clampCell(value: number, size: number): number {
  const cell = Math.round(Number.isFinite(value) ? value : 0);
  return Math.min(Math.max(0, cell), Math.max(0, size - 1));
}

/**
 * Drops fed modifiers whose window has closed. Nothing replaces them.
 * @param host - World whose units are filtered
 */
export function expireModifiers(host: EconomyHost): void {
  const tick = host.tick();
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    const record = unit;
    record.modifiers = record.modifiers.filter(
      (modifier) => modifier.untilTick > tick,
    );
  }
}

/**
 * Advances construction. A site only progresses while builders stand next to
 * it: each adjacent builder (up to `MAX_BUILDERS_PER_SITE`) adds
 * `constructionProgressPerStep()` progress. Health rises with the ramp as a
 * delta, so damage taken during construction is kept.
 * @param host - World whose construction sites update
 */
export function stepConstruction(
  host: EconomyHost,
  policy: VillagerPolicy = AUTO_VILLAGERS,
): void {
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (!record.constructing) continue;
    const workers = Math.min(
      MAX_BUILDERS_PER_SITE,
      adjacentBuilders(host, record),
    );
    if (workers === 0) continue;
    const rampBefore = constructionHp(record, record.buildTicksDone);
    record.buildTicksDone += constructionProgressPerStep(workers);
    if (record.buildTicksDone >= record.buildTicks) {
      finishConstruction(host, record, rampBefore, policy);
      continue;
    }
    const rampAfter = constructionHp(record, record.buildTicksDone);
    record.hp = Math.min(record.maxHp, record.hp + rampAfter - rampBefore);
  }
}

/**
 * Sends every villager toward the nearest finished building.
 * @param host - World whose villagers are recalled
 */
export function recallVillagers(host: EconomyHost): void {
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    const record = unit;
    if (record.popKind !== "villager") continue;
    const target = nearestCompleted(host, record);
    if (!target) continue;
    record.garrisoned = false;
    record.task = { buildingId: target.id, kind: "garrison" };
  }
}

/**
 * Lets garrisoned villagers take work again, and cancels any recall still
 * walking to shelter.
 * @param host - World whose villagers are released
 */
export function releaseVillagers(host: EconomyHost): void {
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    const record = unit;
    if (record.popKind !== "villager") continue;
    record.garrisoned = false;
    if (record.task?.kind === "garrison") record.task = null;
  }
}

/**
 * Gives each idle villager one job, in id order so the choice is stable.
 * @param host - World whose villagers are assigned
 * @param policy - Whether idle villagers choose their own jobs
 */
function assignIdle(host: EconomyHost, policy: VillagerPolicy): void {
  const idle = host.units
    .filter(isEconomyUnit)
    .filter(
      (unit) => unit.popKind === "villager" && !unit.garrisoned && !unit.task,
    )
    .sort((left, right) => compareIds(left.id, right.id));
  for (const unit of idle) {
    pruneUnreachable(host, unit);
    if (policy.manual) {
      resumeOrderedWork(host, unit);
      continue;
    }
    assignOne(host, unit);
  }
}

/**
 * Manual villagers only return to the producer or node the player gave them.
 * A carried load goes home first. With no standing job the villager stays idle.
 * @param host - World of nodes and drop-offs
 * @param unit - Idle villager
 */
function resumeOrderedWork(host: EconomyHost, unit: EconomyUnit): void {
  if (!unit.workplaceId && !unit.preferredNodeId) return;
  if (unit.carry) {
    const drop = nearestDropOff(host, unit);
    if (!drop) return;
    unit.task = { buildingId: drop.id, kind: "carry" };
    return;
  }
  if (resumeWorkplace(host, unit)) return;
  const node = standingNode(host, unit);
  if (!node) return;
  unit.task = {
    gatherTicksLeft: resourceDef(node.resourceId)?.gatherTicks ?? 1,
    kind: "gather",
    nodeId: node.id,
  };
}

/**
 * The villager's ordered node, or the nearest node of the same resource once
 * that one runs dry. The replacement becomes the new standing order.
 * @param host - World of nodes
 * @param unit - Villager with a standing gather order
 * @returns The node to work, or null when the order has lapsed
 */
function standingNode(
  host: EconomyHost,
  unit: EconomyUnit,
): ResourceNode | null {
  const orderedId = unit.preferredNodeId;
  if (!orderedId) return null;
  const ordered = host.economy.nodes.find((entry) => entry.id === orderedId);
  const current = preferredNode(host, unit);
  if (current) return current;
  if (!ordered) return null;
  const replacement = nearestNodeWithin(
    host,
    unit,
    NEARBY_WORK_RADIUS,
    (node) => node.resourceId === ordered.resourceId,
  );
  unit.preferredNodeId = replacement?.id ?? null;
  return replacement;
}

/**
 * @param host - World of nodes
 * @param origin - Cell to measure from
 * @param radius - Largest Chebyshev distance to accept
 * @param accept - Extra filter on the node
 * @returns The nearest reachable node with resources left, ties broken by id
 */
function nearestNodeWithin(
  host: EconomyHost,
  origin: EconomyUnit,
  radius: number,
  accept: (node: ResourceNode) => boolean,
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of host.economy.nodes) {
    if (node.remaining <= 0 || !accept(node)) continue;
    if (isUnreachable(origin, node.id)) continue;
    const distance = chebyshev(node, origin);
    if (distance > radius || distance > bestDistance) continue;
    if (distance === bestDistance && best && compareIds(node.id, best.id) > 0)
      continue;
    best = node;
    bestDistance = distance;
  }
  return best;
}

/**
 * Puts a villager back on its standing workplace while that producer still
 * stands and has a slot for it. A lapsed workplace is forgotten.
 * @param host - World of producers
 * @param unit - Idle villager
 * @returns Whether the villager went back to work
 */
function resumeWorkplace(host: EconomyHost, unit: EconomyUnit): boolean {
  if (!unit.workplaceId) return false;
  const building = findBuilding(host, unit.workplaceId);
  const job = building ? standingJobAt(building) : null;
  if (!building || job === null || !hasFreeSlot(host, building)) {
    unit.workplaceId = null;
    return false;
  }
  if (isUnreachable(unit, building.id)) return false;
  unit.task = { buildingId: building.id, kind: job };
  return true;
}

/**
 * @param host - World of sites, wrecks, producers, and nodes
 * @param unit - Villager who needs a job
 */
function assignOne(host: EconomyHost, unit: EconomyUnit): void {
  if (unit.carry) {
    const drop = nearestDropOff(host, unit);
    if (!drop) return;
    unit.task = { buildingId: drop.id, kind: "carry" };
    return;
  }
  if (resumeWorkplace(host, unit)) return;
  const site = nearestFree(host, unit, "build");
  if (site) {
    unit.task = { buildingId: site.id, kind: "build" };
    return;
  }
  const wreck = nearestFree(host, unit, "repair");
  if (wreck) {
    unit.task = { buildingId: wreck.id, kind: "repair" };
    return;
  }
  const ripe = nearestMatching(
    host,
    unit,
    (building) =>
      !isUnreachable(unit, building.id) &&
      isRipe(building) &&
      hasFreeSlot(host, building),
  );
  if (ripe) {
    unit.task = { buildingId: ripe.id, kind: "harvest" };
    return;
  }
  const workplace = nearestMatching(
    host,
    unit,
    (building) =>
      !isUnreachable(unit, building.id) &&
      standingJobAt(building) === "work" &&
      hasFreeSlot(host, building),
  );
  if (workplace) {
    unit.task = { buildingId: workplace.id, kind: "work" };
    unit.workplaceId = workplace.id;
    return;
  }
  const node = preferredNode(host, unit) ?? nearestNode(host, unit);
  if (!node) return;
  const resource = resourceDef(node.resourceId);
  unit.task = {
    gatherTicksLeft: resource?.gatherTicks ?? 1,
    kind: "gather",
    nodeId: node.id,
  };
}

/**
 * @param host - World the villager acts in
 * @param unit - Villager to advance
 */
function stepOne(host: EconomyHost, unit: EconomyUnit): void {
  if (unit.hp <= 0 || unit.popKind !== "villager" || !unit.task) return;
  const task = unit.task;
  if (task.kind === "gather") {
    stepGather(host, unit, task);
    return;
  }
  if (task.kind === "carry") {
    stepCarry(host, unit, task);
    return;
  }
  if (task.kind === "build") {
    stepBuild(host, unit, task);
    return;
  }
  if (task.kind === "repair") {
    stepRepair(host, unit, task);
    return;
  }
  if (task.kind === "move") {
    stepMove(host, unit, task);
    return;
  }
  if (task.kind === "work") {
    stepWork(host, unit, task);
    return;
  }
  if (task.kind === "harvest") {
    stepHarvest(host, unit, task);
    return;
  }
  stepGarrison(host, unit, task);
}

/**
 * Walks a harvester to its producer and waits there while the crop grows.
 * Once it is ripe the harvester picks it and carries it to the nearest
 * drop-off; a standing harvester then comes back for the next crop.
 * @param host - World the harvester walks through
 * @param unit - Villager assigned to a harvested producer
 * @param task - Harvest order
 */
function stepHarvest(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "harvest" }>,
): void {
  const building = findBuilding(host, task.buildingId);
  if (!building?.completed || harvestDef(building.buildingType) === null) {
    unit.task = null;
    if (unit.workplaceId === task.buildingId) unit.workplaceId = null;
    return;
  }
  if (unit.carry) {
    deliverCarry(host, unit);
    return;
  }
  if (!besideBuilding(unit, building)) {
    moveToward(host, unit, building);
    return;
  }
  const load = takeHarvest(building);
  if (load === null) return;
  unit.carry = load;
  deliverCarry(host, unit);
}

/**
 * Sends a loaded villager to the nearest drop-off and starts walking.
 * @param host - World of drop-offs
 * @param unit - Villager holding a load
 */
function deliverCarry(host: EconomyHost, unit: EconomyUnit): void {
  const drop = nearestDropOff(host, unit);
  if (!drop) {
    unit.task = null;
    return;
  }
  unit.task = { buildingId: drop.id, kind: "carry" };
  stepCarry(host, unit, unit.task);
}

/**
 * Walks a worker to its producer and keeps it there. The producer advances
 * from `stepProduction` while the worker stands beside it. A destroyed or
 * unfinished producer ends the job and the standing workplace.
 * @param host - World the worker walks through
 * @param unit - Villager assigned to a producer
 * @param task - Work order
 */
function stepWork(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "work" }>,
): void {
  const building = findBuilding(host, task.buildingId);
  if (!building?.completed || workerSlots(building.buildingType) === 0) {
    unit.task = null;
    unit.workplaceId = null;
    return;
  }
  if (besideBuilding(unit, building)) return;
  moveToward(host, unit, building);
}

/**
 * Walks one cell toward a move order's cell. Arriving, or finding the cell
 * blocked or unreachable, ends the order and leaves the villager idle.
 * @param host - World the villager walks through
 * @param unit - Villager with a move order
 * @param task - Move order
 */
function stepMove(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "move" }>,
): void {
  if (unit.x === task.x && unit.y === task.y) {
    unit.task = null;
    return;
  }
  const disks = host.getVentVolumes();
  if (leaveHurt(host, unit, disks)) return;
  const goal = moveGoal(host, task);
  const adjacent = chebyshev(unit, goal) <= goal.reach;
  if (adjacent) {
    if (goal.reach === 1 && canWalk(host, disks, task.x, task.y)) {
      unit.x = task.x;
      unit.y = task.y;
    }
    unit.task = null;
    return;
  }
  const next = nextStep(
    unit,
    goal,
    (x, y) => canWalk(host, disks, x, y),
    host.map.width,
    host.map.height,
    goal.reach,
  );
  if (!next) {
    unit.task = null;
    return;
  }
  unit.x = next.x;
  unit.y = next.y;
}

/**
 * A move order onto a building's square walks to the side of the square
 * instead, since the cells under it cannot be entered.
 * @param host - World of footprints
 * @param task - Move order
 * @returns The cell to approach and how close counts as arrived
 */
function moveGoal(
  host: EconomyHost,
  task: Extract<VillagerTask, { kind: "move" }>,
): { reach: number; x: number; y: number } {
  const building = buildingCovering(host.buildings, task.x, task.y);
  if (!building || cellOpenToAlly(host, task.x, task.y)) {
    return { reach: 1, x: task.x, y: task.y };
  }
  return { reach: footprintReach(building), x: building.x, y: building.y };
}

/**
 * @param host - World whose node and stockpile change
 * @param unit - Villager at or walking to a node
 * @param task - Gather order
 */
function stepGather(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "gather" }>,
): void {
  const node = host.economy.nodes.find((entry) => entry.id === task.nodeId);
  if (!node || node.remaining <= 0) {
    unit.task = null;
    return;
  }
  if (chebyshev(unit, node) > 1) {
    moveToward(host, unit, node);
    return;
  }
  task.gatherTicksLeft -= 1;
  if (task.gatherTicksLeft > 0) return;
  const capacity = resourceDef(node.resourceId)?.carryAmount ?? 1;
  const amount = Math.min(capacity, node.remaining);
  if (amount <= 0) {
    unit.task = null;
    return;
  }
  node.remaining -= amount;
  unit.carry = { amount, resourceId: node.resourceId };
  const drop = nearestDropOff(host, unit);
  if (!drop) {
    unit.task = null;
    return;
  }
  unit.task = { buildingId: drop.id, kind: "carry" };
  stepCarry(host, unit, unit.task);
}

/**
 * @param host - World that receives the deposit
 * @param unit - Villager carrying a load
 * @param task - Delivery order
 */
function stepCarry(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "carry" }>,
): void {
  if (!unit.carry) {
    unit.task = null;
    return;
  }
  const drop = findBuilding(host, task.buildingId);
  if (!drop || !isDropOff(drop)) {
    unit.task = null;
    return;
  }
  if (!besideBuilding(unit, drop)) moveToward(host, unit, drop);
  if (!besideBuilding(unit, drop) || !unit.carry || !unit.task) return;
  const carried = unit.carry;
  host.resources[carried.resourceId] =
    (host.resources[carried.resourceId] ?? 0) + carried.amount;
  unit.carry = null;
  unit.task = null;
}

/**
 * @param host - World the builder walks through
 * @param unit - Villager assigned to a site
 * @param task - Build order
 */
function stepBuild(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "build" }>,
): void {
  const building = findBuilding(host, task.buildingId);
  if (!building?.constructing) {
    unit.task = null;
    return;
  }
  if (besideBuilding(unit, building)) return;
  moveToward(host, unit, building);
}

/**
 * @param host - World the villager walks through
 * @param unit - Villager assigned to repairs
 * @param task - Repair order
 */
function stepRepair(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "repair" }>,
): void {
  const building = findBuilding(host, task.buildingId);
  if (!building?.completed) {
    unit.task = null;
    return;
  }
  if (building.hp >= building.maxHp) {
    unit.task = null;
    return;
  }
  if (!besideBuilding(unit, building)) {
    moveToward(host, unit, building);
    return;
  }
  building.hp = Math.min(building.maxHp, building.hp + repairHpPerTick());
  if (building.hp < building.maxHp) return;
  unit.task = null;
}

/**
 * @param host - World the villager retreats through
 * @param unit - Villager running for shelter
 * @param task - Garrison order
 */
function stepGarrison(
  host: EconomyHost,
  unit: EconomyUnit,
  task: Extract<VillagerTask, { kind: "garrison" }>,
): void {
  const building = findBuilding(host, task.buildingId);
  if (!building?.completed) {
    unit.task = null;
    return;
  }
  if (!besideBuilding(unit, building)) moveToward(host, unit, building);
  if (!besideBuilding(unit, building) || !unit.task) return;
  if (unit.carry && isDropOff(building)) {
    const carried = unit.carry;
    host.resources[carried.resourceId] =
      (host.resources[carried.resourceId] ?? 0) + carried.amount;
    unit.carry = null;
  }
  unit.garrisoned = true;
  unit.task = null;
}

/**
 * @param unit - Villager or other walker
 * @param building - Building it works at
 * @returns Whether the walker stands on a cell touching the building's square
 */
function besideBuilding(
  unit: { x: number; y: number },
  building: EconomyBuilding,
): boolean {
  return footprintDistance(building, unit) <= 1;
}

/**
 * Moves one cell toward a target. When no path exists the villager drops the
 * task, forgets a sticky node it cannot reach, and skips the target for
 * `UNREACHABLE_COOLDOWN_STEPS` so the next assignment picks something else.
 * @param host - World whose walls and gates decide the path
 * @param unit - Unit that moves one cell
 * @param goal - Node or building to approach
 * @returns Whether the unit moved or was already adjacent; false when it gave up
 */
function moveToward(
  host: EconomyHost,
  unit: EconomyUnit,
  goal: { buildingType?: string; id: string; x: number; y: number },
): boolean {
  const reach =
    goal.buildingType === undefined
      ? 1
      : footprintReach({ buildingType: goal.buildingType });
  if (chebyshev(unit, goal) <= reach) return true;
  const disks = host.getVentVolumes();
  if (leaveHurt(host, unit, disks)) return true;
  const next = nextStep(
    unit,
    goal,
    (x, y) => canWalk(host, disks, x, y),
    host.map.width,
    host.map.height,
    reach,
  );
  if (next) {
    unit.x = next.x;
    unit.y = next.y;
    return true;
  }
  giveUpOn(host, unit, goal.id);
  return false;
}

/**
 * Clears the task and remembers the target as unreachable for a while.
 * @param host - World, read for the current step
 * @param unit - Villager with no path
 * @param targetId - Node or building it could not reach
 */
function giveUpOn(
  host: EconomyHost,
  unit: EconomyUnit,
  targetId: string,
): void {
  unit.task = null;
  if (unit.preferredNodeId === targetId) unit.preferredNodeId = null;
  if (unit.workplaceId === targetId) unit.workplaceId = null;
  const untilTick = host.tick() + UNREACHABLE_COOLDOWN_STEPS;
  const others = (unit.unreachable ?? []).filter(
    (entry) => entry.targetId !== targetId,
  );
  unit.unreachable = [...others, { targetId, untilTick }];
}

/**
 * Forgets unreachable targets whose cooldown has passed.
 * @param host - World, read for the current step
 * @param unit - Villager being assigned
 */
function pruneUnreachable(host: EconomyHost, unit: EconomyUnit): void {
  if (!unit.unreachable || unit.unreachable.length === 0) return;
  const tick = host.tick();
  unit.unreachable = unit.unreachable.filter((entry) => entry.untilTick > tick);
}

/**
 * @param unit - Villager being assigned
 * @param targetId - Node or building id
 * @returns Whether the villager recently failed to reach that target
 */
function isUnreachable(unit: EconomyUnit, targetId: string): boolean {
  if (!unit.unreachable) return false;
  return unit.unreachable.some((entry) => entry.targetId === targetId);
}

/**
 * Steps a villager out of a vent before the rest of the path is planned.
 * @param host - World of footprints
 * @param unit - Villager that might be standing in a vent
 * @param disks - Vents that burn
 * @returns Whether the villager took an escape step
 */
function leaveHurt(
  host: EconomyHost,
  unit: EconomyUnit,
  disks: readonly HurtDisk[],
): boolean {
  const out = escapeHurtCell(unit, disks, (x, y) => cellOpenToAlly(host, x, y));
  if (!out) return false;
  unit.x = out.x;
  unit.y = out.y;
  return true;
}

/**
 * Allies walk through gates and open ground, not through walls, buildings,
 * or ember vents.
 * @param host - World of footprints
 * @param disks - Vents that burn
 * @param x - Cell column
 * @param y - Cell row
 * @returns Whether an ally can enter the cell
 */
function canWalk(
  host: EconomyHost,
  disks: readonly HurtDisk[],
  x: number,
  y: number,
): boolean {
  return cellOpenToAlly(host, x, y) && cellStaysClear(disks, x, y);
}

/**
 * Allies walk through gates and open ground, not through walls or buildings.
 * @param host - World of footprints
 * @param x - Cell column
 * @param y - Cell row
 * @returns Whether an ally can enter the cell
 */
export function cellOpenToAlly(
  host: EconomyHost,
  x: number,
  y: number,
): boolean {
  return cellOpen(host, x, y, "ally");
}

/**
 * @param host - World of footprints
 * @param x - Cell column
 * @param y - Cell row
 * @param side - Ally units use gates; the horde does not
 * @returns Whether that side can enter the cell
 */
export function cellOpen(
  host: EconomyHost,
  x: number,
  y: number,
  side: "ally" | "horde",
): boolean {
  if (x < 0 || y < 0 || x >= host.map.width || y >= host.map.height)
    return false;
  const building = buildingCovering(host.buildings, x, y);
  if (!building) return true;
  const def = buildingDef(building.buildingType);
  if (!def) return false;
  if (side === "ally") return !def.blocksAlly;
  return !def.blocksHorde;
}

/**
 * @param host - World to search
 * @param site - Site that wants builders
 * @returns How many living villagers with a build order for it stand next to it
 */
function adjacentBuilders(host: EconomyHost, site: EconomyBuilding): number {
  let count = 0;
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    if (unit.hp <= 0 || unit.popKind !== "villager") continue;
    if (unit.task?.kind !== "build" || unit.task.buildingId !== site.id)
      continue;
    if (!besideBuilding(unit, site)) continue;
    count += 1;
  }
  return count;
}

/**
 * Health the construction ramp grants at a given progress. Sites apply the
 * difference between two ramp values, never the ramp itself.
 * @param building - Site still under construction
 * @param done - Progress to evaluate, in the same units as `buildTicks`
 * @returns Ramp health from the vulnerable floor (0 progress) to max (finished)
 */
export function constructionHp(
  building: EconomyBuilding,
  done: number,
): number {
  const fraction =
    buildingDef(building.buildingType)?.constructionHpFraction ?? 0.25;
  const floorHp = Math.max(1, Math.floor(building.maxHp * fraction));
  if (building.buildTicks <= 0) return building.maxHp;
  const progress = Math.min(1, Math.max(0, done / building.buildTicks));
  return Math.min(
    building.maxHp,
    Math.floor(floorHp + (building.maxHp - floorHp) * progress),
  );
}

/**
 * Marks a site finished and starts its deep work when it has one. The rest of
 * the ramp is added to current health, so earlier damage still shows.
 * @param host - World that may gain a deep work
 * @param building - Site that just completed
 * @param rampBefore - Ramp health before this step's progress
 */
function finishConstruction(
  host: EconomyHost,
  building: EconomyBuilding,
  rampBefore: number,
  policy: VillagerPolicy,
): void {
  building.buildTicksDone = building.buildTicks;
  building.constructing = false;
  building.completed = true;
  building.hp = Math.min(
    building.maxHp,
    building.hp + building.maxHp - rampBefore,
  );
  seedWork(host, building);
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    const record = unit;
    if (record.task?.kind !== "build") continue;
    if (record.task.buildingId !== building.id) continue;
    record.task = null;
    if (policy.manual) followUpAfterBuild(host, record, building);
  }
}

/**
 * Picks a manual builder's next job when its site finishes: work the new
 * producer while it has a free slot, help a nearby site, keep its standing
 * gather order, or work a node near a new drop-off.
 * @param host - World of sites and nodes
 * @param unit - Builder whose site just finished
 * @param finished - The completed building
 */
function followUpAfterBuild(
  host: EconomyHost,
  unit: EconomyUnit,
  finished: EconomyBuilding,
): void {
  const job = standingJobAt(finished);
  if (job !== null && hasFreeSlot(host, finished)) {
    unit.task = { buildingId: finished.id, kind: job };
    unit.workplaceId = finished.id;
    unit.preferredNodeId = null;
    return;
  }
  const site = nearestMatching(host, unit, (building) => {
    if (!building.constructing) return false;
    if (isUnreachable(unit, building.id)) return false;
    if (footprintDistance(building, unit) > NEARBY_WORK_RADIUS) return false;
    return workersAssigned(host, "build", building.id) < MAX_BUILDERS_PER_SITE;
  });
  if (site) {
    unit.task = { buildingId: site.id, kind: "build" };
    return;
  }
  if (unit.preferredNodeId) return;
  if (!isDropOff(finished)) return;
  const node = nearestNodeWithin(host, unit, NEARBY_WORK_RADIUS, () => true);
  unit.preferredNodeId = node?.id ?? null;
}

/**
 * @param building - Candidate drop-off
 * @returns Whether villagers can deposit there
 */
function isDropOff(building: EconomyBuilding): boolean {
  if (!building.completed) return false;
  return buildingDef(building.buildingType)?.dropOff ?? false;
}

/**
 * @param host - World of buildings
 * @param origin - Villager looking for shelter
 * @returns The nearest finished building it has not failed to reach
 */
function nearestCompleted(
  host: EconomyHost,
  origin: EconomyUnit,
): EconomyBuilding | null {
  return nearestMatching(
    host,
    origin,
    (building) => building.completed && !isUnreachable(origin, building.id),
  );
}

/**
 * @param host - World of drop-offs
 * @param origin - Villager who needs to deposit
 * @returns The nearest finished drop-off it has not failed to reach
 */
function nearestDropOff(
  host: EconomyHost,
  origin: EconomyUnit,
): EconomyBuilding | null {
  return nearestMatching(
    host,
    origin,
    (building) => isDropOff(building) && !isUnreachable(origin, building.id),
  );
}

/**
 * @param host - World to search
 * @param origin - Cell to measure from
 * @param accept - Whether a building qualifies
 * @returns The nearest qualifying building, ties broken by id
 */
function nearestMatching(
  host: EconomyHost,
  origin: { x: number; y: number },
  accept: (building: EconomyBuilding) => boolean,
): EconomyBuilding | null {
  let best: EconomyBuilding | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const building of host.buildings) {
    const record = asBuilding(building);
    if (!accept(record)) continue;
    const distance = footprintDistance(record, origin);
    if (distance > bestDistance) continue;
    if (distance === bestDistance && best && compareIds(record.id, best.id) > 0)
      continue;
    best = record;
    bestDistance = distance;
  }
  return best;
}

/**
 * @param host - World of sites
 * @param origin - Villager being assigned
 * @param kind - Build an unfinished site, or repair a damaged one
 * @returns The nearest reachable site with room for another worker: up to
 *   `MAX_BUILDERS_PER_SITE` builders, or one repairer
 */
function nearestFree(
  host: EconomyHost,
  origin: EconomyUnit,
  kind: "build" | "repair",
): EconomyBuilding | null {
  const limit = kind === "build" ? MAX_BUILDERS_PER_SITE : 1;
  return nearestMatching(host, origin, (building) => {
    if (isUnreachable(origin, building.id)) return false;
    if (workersAssigned(host, kind, building.id) >= limit) return false;
    if (kind === "build") return building.constructing;
    return (
      building.completed && building.hp > 0 && building.hp < building.maxHp
    );
  });
}

/**
 * @param host - World of villagers
 * @param kind - Task kind to look for
 * @param buildingId - Site that might already have workers
 * @returns How many villagers are already on that job
 */
function workersAssigned(
  host: EconomyHost,
  kind: "build" | "harvest" | "repair" | "work",
  buildingId: string,
): number {
  let count = 0;
  for (const unit of host.units) {
    if (!isEconomyUnit(unit)) continue;
    const task = unit.task;
    if (task?.kind !== kind || task.buildingId !== buildingId) continue;
    count += 1;
  }
  return count;
}

/**
 * The node the player assigned, while it still has resources and is reachable.
 * @param host - World of nodes
 * @param unit - Villager being assigned
 * @returns The assigned node, or null when none is set, it ran dry, or it could not be reached
 */
function preferredNode(
  host: EconomyHost,
  unit: EconomyUnit,
): ResourceNode | null {
  if (!unit.preferredNodeId) return null;
  const node = host.economy.nodes.find(
    (entry) => entry.id === unit.preferredNodeId,
  );
  if (node && node.remaining > 0 && !isUnreachable(unit, node.id)) return node;
  unit.preferredNodeId = null;
  return null;
}

/**
 * Prefers a node nobody else is gathering, then the nearest remaining node.
 * @param host - World of nodes
 * @param origin - Villager being assigned
 * @returns A node with resources left, or null
 */
function nearestNode(
  host: EconomyHost,
  origin: EconomyUnit,
): ResourceNode | null {
  const open = nearestOpenNode(host, origin, true);
  if (open) return open;
  return nearestOpenNode(host, origin, false);
}

/**
 * @param host - World of nodes
 * @param origin - Villager being assigned
 * @param unreservedOnly - Skip nodes another villager is already gathering
 * @returns The nearest matching node
 */
function nearestOpenNode(
  host: EconomyHost,
  origin: EconomyUnit,
  unreservedOnly: boolean,
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of host.economy.nodes) {
    if (node.remaining <= 0) continue;
    if (isUnreachable(origin, node.id)) continue;
    if (unreservedOnly && nodeReserved(host, node.id)) continue;
    const distance = chebyshev(node, origin);
    if (distance > bestDistance) continue;
    if (distance === bestDistance && best && compareIds(node.id, best.id) > 0)
      continue;
    best = node;
    bestDistance = distance;
  }
  return best;
}

/**
 * @param host - World of gatherers
 * @param nodeId - Node that might already be claimed
 * @returns Whether a villager is walking to or gathering that node
 */
function nodeReserved(host: EconomyHost, nodeId: string): boolean {
  return host.units.some((unit) => {
    if (!isEconomyUnit(unit)) return false;
    const task = unit.task;
    return task?.kind === "gather" && task.nodeId === nodeId;
  });
}
