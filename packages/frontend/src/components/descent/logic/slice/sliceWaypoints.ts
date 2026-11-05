import type { EconomyUnit } from "../economy/model";
import { economyHost, isEconomyUnit } from "../economy/records";
import { orderVillagersMove } from "../economy/villagers";
import type { SimWorldState } from "../sim/world";
import {
  ECONOMY_STEP_TICKS,
  type QueuedWaypoint,
  sliceState,
} from "./sliceState";

export type { QueuedWaypoint } from "./sliceState";

/** Most legs a unit can have waiting, so a held Shift cannot grow saves. */
export const MAX_QUEUED_WAYPOINTS = 16;

/**
 * @param world - Sim world
 * @returns Mutable per-unit waypoint queues
 */
function waypointQueues(
  world: SimWorldState,
): Record<string, QueuedWaypoint[]> {
  const state = sliceState(world);
  state.waypoints ??= {};
  return state.waypoints;
}

/**
 * @param world - Sim world
 * @param unitId - Unit to read
 * @returns The unit's waiting legs, oldest first
 */
export function queuedWaypoints(
  world: SimWorldState,
  unitId: string,
): readonly QueuedWaypoint[] {
  return sliceState(world).waypoints?.[unitId] ?? [];
}

/**
 * Drops every waiting leg for these units. Any order given without Shift
 * replaces the queue, as in other RTS games.
 * @param world - Sim world
 * @param unitIds - Units whose queues to clear
 */
export function clearWaypoints(
  world: SimWorldState,
  unitIds: readonly string[],
): void {
  const queues = sliceState(world).waypoints;
  if (queues === undefined) return;
  for (const unitId of unitIds) delete queues[unitId];
}

/**
 * Appends one leg per unit to the end of its queue.
 * @param world - Sim world
 * @param slots - Each unit's destination for this leg
 * @param attack - Whether the leg is an attack-move
 */
export function appendWaypoints(
  world: SimWorldState,
  slots: Record<string, { x: number; y: number }>,
  attack: boolean,
): void {
  const queues = waypointQueues(world);
  for (const [unitId, slot] of Object.entries(slots)) {
    const queue = queues[unitId] ?? [];
    if (queue.length >= MAX_QUEUED_WAYPOINTS) continue;
    queue.push({ attack, x: slot.x, y: slot.y });
    queues[unitId] = queue;
  }
}

/**
 * Whether a unit is still carrying out a movement, so a shift-click should
 * wait behind it rather than replace it.
 * @param world - Sim world
 * @param unit - Living Hold unit
 * @returns True while walking, fighting on an attack-move, or with legs waiting
 */
export function isUnitTravelling(
  world: SimWorldState,
  unit: EconomyUnit,
): boolean {
  return (
    queuedWaypoints(world, unit.id).length > 0 || isLegInProgress(world, unit)
  );
}

/**
 * Starts the next leg for every unit that finished its last one. Villagers
 * that took another job, and dead or missing units, lose their queue.
 * @param world - Sim world
 */
export function advanceWaypoints(world: SimWorldState): void {
  const queues = sliceState(world).waypoints;
  if (queues === undefined) return;
  const host = economyHost(world, ECONOMY_STEP_TICKS);
  for (const [unitId, queue] of Object.entries(queues)) {
    const unit = world.units.find((entry) => entry.id === unitId);
    if (unit === undefined || !isEconomyUnit(unit) || unit.hp <= 0) {
      delete queues[unitId];
      continue;
    }
    if (unit.classId === "villager" && isOnOtherJob(unit)) {
      delete queues[unitId];
      continue;
    }
    if (isLegInProgress(world, unit)) continue;
    const next = queue.shift();
    if (queue.length === 0) delete queues[unitId];
    if (next === undefined) continue;
    if (unit.classId === "villager") {
      orderVillagersMove(host, [unit.id], next);
      continue;
    }
    sliceState(world).combat.pendingOrders.push({
      type: next.attack ? "order_attack_move" : "order_move",
      unitIds: [unit.id],
      x: next.x,
      y: next.y,
    });
  }
}

/**
 * @param unit - Villager
 * @returns Whether it was given a job other than walking
 */
function isOnOtherJob(unit: EconomyUnit): boolean {
  return unit.task !== null && unit.task.kind !== "move";
}

/**
 * @param world - Sim world
 * @param unit - Unit with legs waiting
 * @returns Whether its current leg has not finished yet
 */
function isLegInProgress(world: SimWorldState, unit: EconomyUnit): boolean {
  if (unit.classId === "villager") return unit.task?.kind === "move";
  const state = sliceState(world);
  if (
    state.combat.pendingOrders.some((order) => order.unitIds.includes(unit.id))
  ) {
    return true;
  }
  return state.combat.bodies[unit.id]?.order !== undefined;
}

/** Closer than this to its unit, a destination is not worth a flag. */
const ROUTE_ARRIVED_DISTANCE = 0.75;

/**
 * Where a unit is headed: its current destination, then every queued leg.
 * A guard order that only returns a soldier to where it stands is left out.
 * @param world - Sim world
 * @param unit - Living Hold unit
 * @returns Route points in walking order; empty when standing still
 */
export function unitRoute(
  world: SimWorldState,
  unit: EconomyUnit,
): QueuedWaypoint[] {
  const route: QueuedWaypoint[] = [];
  const current = currentDestination(world, unit);
  if (
    current !== null &&
    Math.hypot(current.x - unit.x, current.y - unit.y) > ROUTE_ARRIVED_DISTANCE
  ) {
    route.push(current);
  }
  for (const leg of queuedWaypoints(world, unit.id)) route.push({ ...leg });
  return route;
}

/**
 * @param world - Sim world
 * @param unit - Living Hold unit
 * @returns The leg it is walking now, or null when it is not moving
 */
function currentDestination(
  world: SimWorldState,
  unit: EconomyUnit,
): QueuedWaypoint | null {
  if (unit.classId === "villager") {
    if (unit.task?.kind !== "move") return null;
    return { attack: false, x: unit.task.x, y: unit.task.y };
  }
  const state = sliceState(world);
  for (
    let index = state.combat.pendingOrders.length - 1;
    index >= 0;
    index -= 1
  ) {
    const order = state.combat.pendingOrders[index];
    if (order === undefined || !order.unitIds.includes(unit.id)) continue;
    if (order.type !== "order_move" && order.type !== "order_attack_move") {
      return null;
    }
    const slot = order.destinations?.[unit.id] ?? order;
    return { attack: order.type === "order_attack_move", x: slot.x, y: slot.y };
  }
  const order = state.combat.bodies[unit.id]?.order;
  if (order === undefined || order.type === "attack_target") return null;
  return {
    attack: order.type === "attack_move",
    x: order.destination.x,
    y: order.destination.y,
  };
}
