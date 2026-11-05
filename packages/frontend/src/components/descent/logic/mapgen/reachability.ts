import type { MapPoint } from "./geometry";

/** Map bounds in whole cells. */
export interface GridSize {
  height: number;
  width: number;
}

/** Step counts from one origin; -1 marks a cell no path reaches. */
export interface DistanceField {
  readonly size: GridSize;
  readonly steps: Int32Array;
}

const FOUR_WAY: readonly MapPoint[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Breadth-first flood fill with the same four-way moves villagers use.
 * The origin is always counted as reached, even when it is blocked (a Camp
 * stands on its own cell).
 * @param size - Map bounds
 * @param origin - Start cell
 * @param passable - Whether a cell may be entered
 * @returns Steps from `origin` to every cell
 */
export function floodDistances(
  size: GridSize,
  origin: MapPoint,
  passable: (x: number, y: number) => boolean,
): DistanceField {
  const steps = new Int32Array(size.width * size.height).fill(-1);
  const field = { size, steps };
  if (!insideGrid(size, origin.x, origin.y)) return field;
  const queue = new Int32Array(size.width * size.height);
  let head = 0;
  let tail = 0;
  const start = origin.y * size.width + origin.x;
  steps[start] = 0;
  queue[tail] = start;
  tail += 1;
  while (head < tail) {
    const current = queue[head] as number;
    head += 1;
    const x = current % size.width;
    const y = Math.floor(current / size.width);
    const nextStep = (steps[current] as number) + 1;
    for (const dir of FOUR_WAY) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (!insideGrid(size, nx, ny)) continue;
      const index = ny * size.width + nx;
      if (steps[index] !== -1 || !passable(nx, ny)) continue;
      steps[index] = nextStep;
      queue[tail] = index;
      tail += 1;
    }
  }
  return field;
}

/**
 * @param field - Flood result
 * @param cell - Cell to read
 * @returns Steps to the cell, or -1 when unreachable or off the map
 */
export function stepsTo(field: DistanceField, cell: MapPoint): number {
  if (!insideGrid(field.size, cell.x, cell.y)) return -1;
  return field.steps[cell.y * field.size.width + cell.x] ?? -1;
}

/**
 * Steps needed to stand beside a cell (Chebyshev distance 1), the way a
 * villager works a node or a building.
 * @param field - Flood result
 * @param cell - Occupied target cell
 * @returns Fewest steps to any neighbor, or -1 when none is reachable
 */
export function stepsToBeside(field: DistanceField, cell: MapPoint): number {
  let best = -1;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const steps = stepsTo(field, { x: cell.x + dx, y: cell.y + dy });
      if (steps < 0) continue;
      if (best < 0 || steps < best) best = steps;
    }
  }
  return best;
}

/**
 * @param size - Map bounds
 * @param x - Column
 * @param y - Row
 * @returns Whether the cell is on the map
 */
function insideGrid(size: GridSize, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < size.width && y < size.height;
}
