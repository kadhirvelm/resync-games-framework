import type { RouteReadout } from "./presentation";
import type { MapPoint } from "./selection";

/** One waypoint flag drawn on the battlefield. */
export interface RouteFlag {
  /** Whether the leg is an attack-move, drawn in the attack color. */
  attack: boolean;
  /** 1-based leg number, so the next stop reads as 1. */
  order: number;
  x: number;
  y: number;
}

/** Flags and the path line through them for the current selection. */
export interface RoutePlan {
  flags: RouteFlag[];
  /** Polyline from the group's centre through each leg, in map space. */
  path: MapPoint[];
}

/** Formation slots for one click land within this many cells of each other. */
const FLAG_CLUSTER_RADIUS = 2.5;

/** A unit as the route planner needs it. */
interface RoutedUnit {
  route?: readonly RouteReadout[];
  x: number;
  y: number;
}

/**
 * Turns the selected units' routes into flags. A group sent in formation has
 * one slot per unit for each click; those slots merge into one flag at their
 * centre so a squad shows one flag per click rather than one per soldier.
 * @param units - Selected Hold units
 * @returns Flags in walking order and a path line through them
 */
export function routePlan(units: readonly RoutedUnit[]): RoutePlan {
  const moving = units.filter((unit) => (unit.route?.length ?? 0) > 0);
  if (moving.length === 0) return { flags: [], path: [] };
  const legs = Math.max(...moving.map((unit) => unit.route?.length ?? 0));
  const flags: RouteFlag[] = [];
  const path: MapPoint[] = [centroid(moving)];
  for (let leg = 0; leg < legs; leg += 1) {
    const points = moving.flatMap((unit) => {
      const point = unit.route?.[leg];
      return point === undefined ? [] : [point];
    });
    for (const cluster of clusterPoints(points)) {
      flags.push({ ...cluster, order: leg + 1 });
    }
    path.push(centroid(points));
  }
  return { flags, path };
}

/**
 * Greedy merge: each point joins the first cluster whose centre is close,
 * otherwise starts its own.
 * @param points - Route points for one leg
 * @returns One point per cluster at its centre; attack if any member attacks
 */
function clusterPoints(points: readonly RouteReadout[]): RouteReadout[] {
  const clusters: { attack: boolean; members: RouteReadout[] }[] = [];
  for (const point of points) {
    const near = clusters.find((cluster) => {
      const centre = centroid(cluster.members);
      return (
        Math.hypot(centre.x - point.x, centre.y - point.y) <=
        FLAG_CLUSTER_RADIUS
      );
    });
    if (near === undefined) {
      clusters.push({ attack: point.attack, members: [point] });
      continue;
    }
    near.members.push(point);
    near.attack ||= point.attack;
  }
  return clusters.map((cluster) => ({
    attack: cluster.attack,
    ...centroid(cluster.members),
  }));
}

/**
 * @param points - Non-empty point list
 * @returns Their mean position
 */
function centroid(points: readonly MapPoint[]): MapPoint {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}
