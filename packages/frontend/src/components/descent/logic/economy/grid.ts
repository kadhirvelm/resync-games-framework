/**
 * Integer grid helpers. Movement is four-directional; adjacency bonuses use
 * Chebyshev distance so a diagonal neighbor still counts.
 */

import type { Point } from "./model";

const DIRS: readonly Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * @param left - First cell
 * @param right - Second cell
 * @returns The Chebyshev distance, 0 when the cells match
 */
export function chebyshev(left: Point, right: Point): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

/**
 * @param point - Cell to test
 * @param width - Map width in cells
 * @param height - Map height in cells
 * @returns Whether the cell is inside the map
 */
export function insideMap(
  point: Point,
  width: number,
  height: number,
): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
}

/**
 * Walks one cell toward `goal` on passable ground.
 * Already being within reach, or having no path, returns null.
 * @param from - Cell the unit occupies
 * @param goal - Cell the unit is trying to reach
 * @param passable - Whether a cell can be entered
 * @param width - Map width
 * @param height - Map height
 * @param reach - Chebyshev distance from `goal` that counts as arrived;
 *   1 means beside it, more means beside a building's wider square
 * @returns The next cell, or null when no step is needed or possible
 */
export function nextStep(
  from: Point,
  goal: Point,
  passable: (x: number, y: number) => boolean,
  width: number,
  height: number,
  reach = 1,
): Point | null {
  if (chebyshev(from, goal) <= reach) return null;
  const startKey = keyOf(from);
  const previous = new Map<string, string | null>();
  previous.set(startKey, null);
  const queue: Point[] = [from];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (!current) continue;
    const step = expand(
      current,
      { goal, height, passable, reach, width },
      startKey,
      previous,
      queue,
    );
    if (step) return step;
  }
  return null;
}

/** Fixed inputs of one breadth-first search. */
interface SearchFrame {
  goal: Point;
  height: number;
  passable: (x: number, y: number) => boolean;
  reach: number;
  width: number;
}

/**
 * Adds the passable neighbors of `current` and returns a path when one of
 * them is already close enough to the goal.
 * @param current - Cell being expanded
 * @param frame - Goal, reach, passability, and map size
 * @param startKey - Key of the original cell
 * @param previous - Parent key of each visited cell
 * @param queue - Breadth-first queue, appended in place
 * @returns The first step of a finished path, or null to keep searching
 */
function expand(
  current: Point,
  frame: SearchFrame,
  startKey: string,
  previous: Map<string, string | null>,
  queue: Point[],
): Point | null {
  const { goal, height, passable, reach, width } = frame;
  for (const dir of DIRS) {
    const next = { x: current.x + dir.x, y: current.y + dir.y };
    if (!insideMap(next, width, height)) continue;
    const nextKey = keyOf(next);
    if (previous.has(nextKey)) continue;
    if (!passable(next.x, next.y)) continue;
    previous.set(nextKey, keyOf(current));
    if (chebyshev(next, goal) <= reach)
      return firstStep(previous, startKey, nextKey);
    queue.push(next);
  }
  return null;
}

/**
 * @param previous - Parent key of each visited cell
 * @param startKey - Key of the start cell
 * @param endKey - Key of the cell that reached the goal
 * @returns The first cell on the path
 */
function firstStep(
  previous: Map<string, string | null>,
  startKey: string,
  endKey: string,
): Point | null {
  let cursor = endKey;
  let guard = 0;
  while (guard < previous.size + 1) {
    const parent = previous.get(cursor);
    if (parent === undefined || parent === null) return null;
    if (parent === startKey) return pointFromKey(cursor);
    cursor = parent;
    guard += 1;
  }
  return null;
}

/**
 * @param point - Cell to encode
 * @returns A stable map key
 */
function keyOf(point: Point): string {
  return `${point.x},${point.y}`;
}

/**
 * @param key - `x,y` map key
 * @returns The cell, or null when the key is malformed
 */
function pointFromKey(key: string): Point | null {
  const parts = key.split(",");
  const xText = parts[0];
  const yText = parts[1];
  if (xText === undefined || yText === undefined) return null;
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return { x, y };
}
