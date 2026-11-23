/**
 * Integer grid helpers. Movement is four-directional; adjacency bonuses use
 * Chebyshev distance so a diagonal neighbor still counts.
 */

import type { Point } from "./model";

const DIR_X = [0, 1, 0, -1] as const;
const DIR_Y = [-1, 0, 1, 0] as const;

/** Sentinel parent index for the BFS root cell. */
const ROOT_PARENT = -1;

/** Max unsigned 32-bit stamp before the visited array must be cleared. */
const MAX_STAMP = 0xffffffff;

let visitedStamp = new Uint32Array(0);
let parentIndex = new Int32Array(0);
let queue = new Int32Array(0);
let currentStamp = 0;

/**
 * Ensures module-level BFS buffers can index every cell in a `size`-cell grid
 * and returns a fresh stamp value in O(1) time.
 * @param size - Total number of cells (`width * height`)
 * @returns Non-zero stamp value unique to this search
 */
function acquireSearchStamp(size: number): number {
  if (visitedStamp.length < size) {
    visitedStamp = new Uint32Array(size);
    parentIndex = new Int32Array(size);
    queue = new Int32Array(size);
    currentStamp = 1;
    return currentStamp;
  }
  if (currentStamp === MAX_STAMP) {
    visitedStamp.fill(0);
    currentStamp = 1;
    return currentStamp;
  }
  currentStamp += 1;
  return currentStamp;
}

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
  if (width <= 0 || height <= 0) return null;

  const size = width * height;
  const stamp = acquireSearchStamp(size);
  const goalX = goal.x;
  const goalY = goal.y;

  let head = 0;
  let tail = 0;
  let startIndex = ROOT_PARENT;

  if (insideMap(from, width, height)) {
    startIndex = from.y * width + from.x;
    visitedStamp[startIndex] = stamp;
    parentIndex[startIndex] = ROOT_PARENT;
    queue[0] = startIndex;
    tail = 1;
  } else {
    const seeded = seedOutOfBoundsStart(
      from,
      goalX,
      goalY,
      passable,
      width,
      height,
      reach,
      stamp,
    );
    if (seeded.step) return seeded.step;
    tail = seeded.tail;
  }

  while (head < tail) {
    const currentIndex = queue[head] ?? -1;
    head += 1;
    if (currentIndex < 0) continue;
    const cx = currentIndex % width;
    const cy = (currentIndex - cx) / width;
    for (let dir = 0; dir < 4; dir += 1) {
      const nx = cx + (DIR_X[dir] ?? 0);
      const ny = cy + (DIR_Y[dir] ?? 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nextIndex = ny * width + nx;
      if (visitedStamp[nextIndex] === stamp) continue;
      if (!passable(nx, ny)) continue;
      visitedStamp[nextIndex] = stamp;
      parentIndex[nextIndex] = currentIndex;
      const dx = nx > goalX ? nx - goalX : goalX - nx;
      const dy = ny > goalY ? ny - goalY : goalY - ny;
      if (Math.max(dx, dy) <= reach) {
        return firstStep(startIndex, nextIndex, width);
      }
      queue[tail] = nextIndex;
      tail += 1;
    }
  }
  return null;
}

/**
 * Seeds the BFS queue from an out-of-bounds start cell by testing its four
 * orthogonal neighbors in cardinal order.
 * @param from - Out-of-bounds start cell
 * @param goalX - Target x coordinate
 * @param goalY - Target y coordinate
 * @param passable - Whether a cell can be entered
 * @param width - Map width
 * @param height - Map height
 * @param reach - Arrival Chebyshev distance
 * @param stamp - Active visited stamp
 * @returns Immediate first step if reached, otherwise the number of queued neighbors
 */
function seedOutOfBoundsStart(
  from: Point,
  goalX: number,
  goalY: number,
  passable: (x: number, y: number) => boolean,
  width: number,
  height: number,
  reach: number,
  stamp: number,
): { step: Point | null; tail: number } {
  let tail = 0;
  for (let dir = 0; dir < 4; dir += 1) {
    const nx = from.x + (DIR_X[dir] ?? 0);
    const ny = from.y + (DIR_Y[dir] ?? 0);
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const nextIndex = ny * width + nx;
    if (visitedStamp[nextIndex] === stamp) continue;
    if (!passable(nx, ny)) continue;
    visitedStamp[nextIndex] = stamp;
    parentIndex[nextIndex] = ROOT_PARENT;
    const dx = nx > goalX ? nx - goalX : goalX - nx;
    const dy = ny > goalY ? ny - goalY : goalY - ny;
    if (Math.max(dx, dy) <= reach) {
      return { step: { x: nx, y: ny }, tail };
    }
    queue[tail] = nextIndex;
    tail += 1;
  }
  return { step: null, tail };
}

/**
 * Walks parent indices back from the goal-reaching cell to the first step
 * after `startIndex`.
 * @param startIndex - Flat index of the start cell, or `ROOT_PARENT` if out of bounds
 * @param endIndex - Flat index of the cell that reached the goal
 * @param width - Map width in cells
 * @returns The first cell on the path, or null if parent chain is broken
 */
function firstStep(
  startIndex: number,
  endIndex: number,
  width: number,
): Point | null {
  let cursor = endIndex;
  const maxSteps = parentIndex.length;
  for (let steps = 0; steps <= maxSteps; steps += 1) {
    const parent = parentIndex[cursor];
    if (parent === undefined) return null;
    if (parent === startIndex) {
      const x = cursor % width;
      return { x, y: (cursor - x) / width };
    }
    if (parent < 0) return null;
    cursor = parent;
  }
  return null;
}
