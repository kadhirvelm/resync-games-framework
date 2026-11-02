import type { CombatClassId } from "../combat/types";
import { getUnitDefinition } from "../combat/unitCatalog";
import {
  canAffordPop,
  releasePopulation,
  reservePopulation,
} from "../economy/queries";
import { asBuilding, createUnitRecord, economyHost } from "../economy/records";
import { canAfford, trySpend } from "../economy/stockpile";
import { trainingCost } from "../economy/tables";
import {
  cellOpen,
  orderVillagersGather,
  orderVillagersMove,
} from "../economy/villagers";
import { secondsToTicks } from "../sim/constants";
import type { TickContext } from "../sim/modules";
import type { SimWorldState } from "../sim/world";
import type { ClassId, ResourceStockpile } from "../types";
import { openCultivation, saveCultivation } from "./sliceCultivation";
import {
  ECONOMY_STEP_TICKS,
  pushFx,
  pushNotice,
  sliceState,
  type TrainingJob,
  type TrainingRallyPoint,
} from "./sliceState";

/** Classes a completed Barracks can train, in card order. */
export const BARRACKS_CLASSES: readonly CombatClassId[] = [
  "warden",
  "hunter",
  "raider",
  "breaker",
  "adept",
];

/** Most orders one building may have queued, including the one training. */
export const MAX_QUEUE = 20;

/** How many orders one shift-click tries to add. */
export const SHIFT_TRAIN_COUNT = 5;

/** Seconds one soldier takes at a Barracks without a vein bonus. */
const SOLDIER_SECONDS = 4;

/** Seconds one villager takes at the Camp. */
const VILLAGER_SECONDS = 7;

/** What one training order costs and yields. */
export interface TrainingPlan {
  classId: ClassId;
  cost: Partial<ResourceStockpile>;
  count: number;
  pop: number;
  seconds: number;
}

/**
 * Which building trains a class.
 * @param classId - Class requested
 * @returns The building type that trains it
 */
export function trainerFor(classId: ClassId): "barracks" | "camp" {
  return classId === "villager" ? "camp" : "barracks";
}

/**
 * Prices one training order.
 * @param classId - Class to train
 * @param trainSpeedBonus - Barracks vein bonus, e.g. 0.15
 * @returns Cost, count, pop, and duration
 */
export function trainingPlan(
  classId: ClassId,
  trainSpeedBonus = 0,
): TrainingPlan {
  if (classId === "villager") {
    return {
      classId,
      cost: trainingCost("villager") ?? { food: 10, water: 8 },
      count: 1,
      pop: 1,
      seconds: VILLAGER_SECONDS,
    };
  }
  const definition = getUnitDefinition(classId);
  return {
    classId,
    cost: {
      food: definition.trainingCost.food,
      water: definition.trainingCost.water,
    },
    count: 1,
    pop: definition.popCost,
    seconds: SOLDIER_SECONDS / (1 + trainSpeedBonus),
  };
}

/**
 * Explains why an order cannot be placed right now.
 * @param world - Sim world
 * @param buildingId - Training building
 * @param classId - Requested class
 * @returns A player-facing reason, or null when the order is allowed
 */
export function trainingBlocker(
  world: SimWorldState,
  buildingId: string,
  classId: ClassId,
): string | null {
  const building = world.buildings.find((entry) => entry.id === buildingId);
  if (!building) return "That building is gone.";
  const record = asBuilding(building);
  if (record.buildingType !== trainerFor(classId)) {
    return classId === "villager"
      ? "Villagers train at the Camp."
      : "Soldiers train at a Barracks.";
  }
  if (!record.completed) return "Still under construction.";
  const queued = sliceState(world).training.filter(
    (job) => job.buildingId === buildingId,
  ).length;
  if (queued >= MAX_QUEUE) return "Training queue is full.";
  const plan = trainingPlan(classId, trainSpeedBonus(record));
  if (!canAffordPop(economyHost(world, ECONOMY_STEP_TICKS), plan.pop)) {
    return "Need spare population — build Housing.";
  }
  if (!canAfford(world.resources, plan.cost)) {
    return "Need more food and water.";
  }
  return null;
}

/**
 * Clamps a requested batch to one through {@link SHIFT_TRAIN_COUNT}.
 * @param count - Orders the player asked for, if any
 * @returns A safe order count
 */
function requestedTrainCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count)) return 1;
  return Math.min(SHIFT_TRAIN_COUNT, Math.max(1, Math.floor(count)));
}

/**
 * Pays for and queues one training order. The caller has already checked
 * {@link trainingBlocker}.
 * @param context - Current tick
 * @param buildingId - Training building
 * @param classId - Requested class
 * @returns Whether the order was paid for and queued
 */
function enqueueTrainingOrder(
  context: TickContext,
  buildingId: string,
  classId: ClassId,
): boolean {
  const world = context.world;
  const building = asBuilding(
    world.buildings.find((entry) => entry.id === buildingId) as never,
  );
  const plan = trainingPlan(classId, trainSpeedBonus(building));
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  if (!reservePopulation(host, plan.pop)) return false;
  if (!trySpend(host, plan.cost)) {
    releasePopulation(host, plan.pop);
    return false;
  }
  const ticks = secondsToTicks(plan.seconds);
  sliceState(world).training.push({
    buildingId,
    classId,
    count: plan.count,
    id: context.nextEntityId("training"),
    paidCost: { ...plan.cost },
    remainingTicks: ticks,
    reservedPop: plan.pop,
    totalTicks: ticks,
  });
  return true;
}

/**
 * Pays for and queues one or more training orders. A shift-click asks for
 * five; the loop stops when the queue, population, or stockpile runs out.
 * @param context - Current tick
 * @param buildingId - Training building
 * @param classId - Requested class
 * @param count - Orders to queue. Omitted means one
 */
export function queueTraining(
  context: TickContext,
  buildingId: string,
  classId: ClassId,
  count?: number,
): void {
  const world = context.world;
  const requested = requestedTrainCount(count);
  let queued = 0;
  let blocker: string | null = null;
  for (let index = 0; index < requested; index += 1) {
    blocker = trainingBlocker(world, buildingId, classId);
    if (blocker !== null) break;
    if (!enqueueTrainingOrder(context, buildingId, classId)) {
      blocker = "Need more food and water.";
      break;
    }
    queued += 1;
  }
  if (queued === 0 && blocker !== null) {
    pushNotice(world, blocker, "warn");
    return;
  }
  if (queued < requested && blocker !== null) {
    pushNotice(world, `Queued ${queued} of ${requested}. ${blocker}`, "warn");
  }
}

/**
 * What cancelling an order gives back. Orders record what they cost; ones
 * saved before that (including old five-soldier batches) are priced per unit.
 * @param job - Order being cancelled
 * @returns Resources to return to the stockpile
 */
function trainingRefund(job: TrainingJob): Partial<ResourceStockpile> {
  if (job.paidCost !== undefined) return job.paidCost;
  const perUnit = trainingPlan(job.classId).cost;
  const refund: Partial<ResourceStockpile> = {};
  for (const [resourceId, amount] of Object.entries(perUnit)) {
    refund[resourceId as keyof ResourceStockpile] = (amount ?? 0) * job.count;
  }
  return refund;
}

/**
 * Cancels one queued or in-progress order, refunding everything it cost and
 * freeing its population. Cancelling the order in progress starts the next.
 * @param world - Sim world
 * @param buildingId - Building that owns the queue
 * @param jobId - Order to cancel
 * @returns Whether an order was cancelled
 */
export function cancelTraining(
  world: SimWorldState,
  buildingId: string,
  jobId: string,
): boolean {
  const state = sliceState(world);
  const index = state.training.findIndex(
    (job) => job.id === jobId && job.buildingId === buildingId,
  );
  const job = state.training[index];
  if (job === undefined) return false;
  state.training.splice(index, 1);
  for (const [resourceId, amount] of Object.entries(trainingRefund(job))) {
    const key = resourceId as keyof ResourceStockpile;
    world.resources[key] = (world.resources[key] ?? 0) + (amount ?? 0);
  }
  releasePopulation(economyHost(world, ECONOMY_STEP_TICKS), job.reservedPop);
  return true;
}

/**
 * Advances the head of each building's queue and spawns finished batches.
 * A queue whose building fell refunds its population.
 * @param context - Current tick
 */
export function advanceTraining(context: TickContext): void {
  const world = context.world;
  const state = sliceState(world);
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const advanced = new Set<string>();
  const remaining: TrainingJob[] = [];
  for (const job of state.training) {
    const building = world.buildings.find(
      (entry) => entry.id === job.buildingId,
    );
    if (!building) {
      releasePopulation(host, job.reservedPop);
      continue;
    }
    if (advanced.has(job.buildingId)) {
      remaining.push(job);
      continue;
    }
    advanced.add(job.buildingId);
    job.remainingTicks -= 1;
    if (job.remainingTicks > 0) {
      remaining.push(job);
      continue;
    }
    releasePopulation(host, job.reservedPop);
    spawnBatch(context, job, asBuilding(building));
  }
  state.training = remaining;
}

/**
 * Reads a training building's custom rally point or its nearby default.
 * @param world - Sim world containing the building and slice state
 * @param buildingId - Camp or Barracks id
 * @returns The rally destination, or null for a missing/non-training building
 */
export function trainingRallyPoint(
  world: SimWorldState,
  buildingId: string,
): TrainingRallyPoint | null {
  const building = world.buildings.find((entry) => entry.id === buildingId);
  if (!building) return null;
  const record = asBuilding(building);
  if (!record.completed || !isTrainingBuilding(record.buildingType)) {
    return null;
  }
  const custom = sliceState(world).rallyPoints?.[buildingId];
  if (custom !== undefined) return custom;
  return {
    x: clampCoordinate(record.x, world.map.width),
    y: clampCoordinate(record.y + 3, world.map.height),
  };
}

/**
 * Sets the destination newly trained units receive after spawning. Naming a
 * resource node that still has stock snaps the rally onto it, and trained
 * villagers gather there instead of standing at the point.
 * @param world - Sim world to update
 * @param buildingId - Completed Camp or Barracks
 * @param point - Requested map-space destination and optional node
 * @returns Whether the rally point was accepted
 */
export function setTrainingRallyPoint(
  world: SimWorldState,
  buildingId: string,
  point: TrainingRallyPoint,
): boolean {
  const building = world.buildings.find((entry) => entry.id === buildingId);
  if (!building) return false;
  const record = asBuilding(building);
  if (!record.completed || !isTrainingBuilding(record.buildingType)) {
    return false;
  }
  const state = sliceState(world);
  state.rallyPoints ??= {};
  const node = rallyNode(world, point.nodeId);
  if (node !== null) {
    state.rallyPoints[buildingId] = { nodeId: node.id, x: node.x, y: node.y };
    return true;
  }
  state.rallyPoints[buildingId] = {
    x: clampCoordinate(point.x, world.map.width),
    y: clampCoordinate(point.y, world.map.height),
  };
  return true;
}

/**
 * The resource node a rally names, if it still has stock to gather.
 * @param world - Sim world holding the economy nodes
 * @param nodeId - Node the rally names, if any
 * @returns The node, or null when absent or exhausted
 */
function rallyNode(
  world: SimWorldState,
  nodeId: string | undefined,
): { id: string; x: number; y: number } | null {
  if (nodeId === undefined) return null;
  const node = economyHost(world, ECONOMY_STEP_TICKS).economy.nodes.find(
    (entry) => entry.id === nodeId,
  );
  if (node === undefined || node.remaining <= 0) return null;
  return node;
}

/**
 * The Barracks train-speed vein bonus, if any.
 * @param building - Training building
 * @returns Bonus fraction, 0 without a vein
 */
function trainSpeedBonus(building: ReturnType<typeof asBuilding>): number {
  if (building.bonuses.vein?.id !== "train_speed") return 0;
  return building.bonuses.vein.amount;
}

/**
 * Puts a finished batch on the field beside its building.
 * @param context - Current tick
 * @param job - Finished job
 * @param building - Building it trained at
 */
function spawnBatch(
  context: TickContext,
  job: TrainingJob,
  building: ReturnType<typeof asBuilding>,
): void {
  const world = context.world;
  const cells = openCellsAround(world, building.x, building.y, job.count);
  const cultivation = openCultivation(world);
  const soldierIds: string[] = [];
  const villagerIds: string[] = [];
  for (const cell of cells) {
    const id = context.nextEntityId(job.classId);
    if (job.classId === "villager") {
      world.units.push(createUnitRecord({ id, x: cell.x, y: cell.y }));
      villagerIds.push(id);
      pushFx(world, { kind: "spawn", x: cell.x, y: cell.y });
      continue;
    }
    const definition = getUnitDefinition(job.classId);
    world.units.push(
      createUnitRecord({
        classId: job.classId,
        hp: definition.maxHitPoints,
        id,
        maxHp: definition.maxHitPoints,
        popKind: "soldier",
        realmId: "qi_gathering",
        x: cell.x,
        y: cell.y,
      }),
    );
    soldierIds.push(id);
    cultivation.registerUnit({
      maxHealth: definition.maxHitPoints,
      rank: "Ashborn",
      unitId: id,
    });
    pushFx(world, { kind: "spawn", x: cell.x, y: cell.y });
  }
  saveCultivation(world, cultivation);
  sendBatchToRallyPoint(world, building.id, villagerIds, soldierIds);
  pushNotice(world, readyMessage(job), "good");
}

/**
 * Issues the first movement order for a completed batch.
 * @param world - Sim world containing the new units
 * @param buildingId - Training building that produced them
 * @param villagerIds - New villagers controlled by the economy mover
 * @param soldierIds - New soldiers controlled by combat movement
 */
function sendBatchToRallyPoint(
  world: SimWorldState,
  buildingId: string,
  villagerIds: readonly string[],
  soldierIds: readonly string[],
): void {
  const rally = trainingRallyPoint(world, buildingId);
  if (rally === null) return;
  if (villagerIds.length > 0) {
    sendVillagersToRally(world, villagerIds, rally);
  }
  if (soldierIds.length > 0) {
    sliceState(world).combat.pendingOrders.push({
      type: "order_move",
      unitIds: [...soldierIds],
      ...rally,
    });
  }
}

/**
 * Starts new villagers gathering a rallied node, or walks them to the rally
 * point when it names none or the node has run dry.
 * @param world - Sim world containing the villagers
 * @param villagerIds - Newly trained villagers
 * @param rally - The training building's rally point
 */
function sendVillagersToRally(
  world: SimWorldState,
  villagerIds: readonly string[],
  rally: TrainingRallyPoint,
): void {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const node = rallyNode(world, rally.nodeId);
  if (node !== null && orderVillagersGather(host, villagerIds, node.id) > 0) {
    return;
  }
  orderVillagersMove(host, villagerIds, rally);
}

/**
 * @param buildingType - Economy building type
 * @returns Whether the building produces units
 */
function isTrainingBuilding(buildingType: string): boolean {
  return buildingType === "camp" || buildingType === "barracks";
}

/**
 * @param value - Requested map coordinate
 * @param size - Map dimension
 * @returns A one-decimal coordinate inside the playable map
 */
function clampCoordinate(value: number, size: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(size - 1, value)) * 10) / 10;
}

/**
 * @param job - Finished job
 * @returns The arrival notice
 */
function readyMessage(job: TrainingJob): string {
  if (job.classId === "villager") return "A villager joins the Hold.";
  const name = getUnitDefinition(job.classId as CombatClassId).name;
  return `${job.count} Ashborn ${name.replace("Hold ", "")}s report for duty.`;
}

/**
 * Finds open cells in widening rings around a building, south side first.
 * @param world - Sim world
 * @param x - Building column
 * @param y - Building row
 * @param count - Cells wanted
 * @returns Up to `count` open cells (fewer only on a packed map)
 */
function openCellsAround(
  world: SimWorldState,
  x: number,
  y: number,
  count: number,
): { x: number; y: number }[] {
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  const cells: { x: number; y: number }[] = [];
  for (let radius = 1; radius <= 4 && cells.length < count; radius += 1) {
    for (let dy = -radius; dy <= radius && cells.length < count; dy += 1) {
      for (let dx = -radius; dx <= radius && cells.length < count; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const cell = { x: x + dx, y: y + dy };
        if (!cellOpen(host, cell.x, cell.y, "ally")) continue;
        const nodeHere = host.economy.nodes.some(
          (node) => node.x === cell.x && node.y === cell.y,
        );
        if (nodeHere) continue;
        cells.push(cell);
      }
    }
  }
  while (cells.length < count) cells.push({ x, y: y + 1 });
  return cells;
}
