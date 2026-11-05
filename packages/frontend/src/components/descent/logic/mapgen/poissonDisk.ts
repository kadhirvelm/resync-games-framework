import type { SimRng } from "../sim/rng";
import type { MapPoint } from "./geometry";

/** Axis-aligned area to sample, in tiles. */
export interface SampleArea {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Candidates tried around each active point before it retires. */
const DEFAULT_ATTEMPTS = 30;

/**
 * Bridson's Poisson-disk sampling: an even, organic scatter where no two
 * points are closer than `minDistance` and gaps never grow much past twice
 * that. Fully deterministic for a given RNG cursor.
 * @param rng - Seeded random source
 * @param area - Rectangle to fill
 * @param minDistance - Smallest allowed gap between points
 * @param attempts - Candidates tried around each point (Bridson's `k`)
 * @returns Points in the order they were accepted
 */
export function poissonDiskSample(
  rng: SimRng,
  area: SampleArea,
  minDistance: number,
  attempts = DEFAULT_ATTEMPTS,
): MapPoint[] {
  if (minDistance <= 0 || area.width <= 0 || area.height <= 0) return [];
  const cellSize = minDistance / Math.SQRT2;
  const columns = Math.max(1, Math.ceil(area.width / cellSize));
  const rows = Math.max(1, Math.ceil(area.height / cellSize));
  const grid = new Int32Array(columns * rows).fill(-1);
  const points: MapPoint[] = [];
  const active: number[] = [];

  /**
   * @param point - Candidate inside the area
   * @returns The grid slot that holds it
   */
  const slotOf = (point: MapPoint): number => {
    const column = Math.min(
      columns - 1,
      Math.floor((point.x - area.x) / cellSize),
    );
    const row = Math.min(rows - 1, Math.floor((point.y - area.y) / cellSize));
    return row * columns + column;
  };

  /** @param point - Point to accept */
  const accept = (point: MapPoint) => {
    grid[slotOf(point)] = points.length;
    active.push(points.length);
    points.push(point);
  };

  /**
   * @param point - Candidate
   * @returns Whether it is inside the area and far enough from every point
   */
  const fits = (point: MapPoint): boolean => {
    if (point.x < area.x || point.y < area.y) return false;
    if (point.x >= area.x + area.width || point.y >= area.y + area.height) {
      return false;
    }
    const slot = slotOf(point);
    const column = slot % columns;
    const row = Math.floor(slot / columns);
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (tooClose(point, column + dx, row + dy)) return false;
      }
    }
    return true;
  };

  /**
   * @param point - Candidate
   * @param column - Neighbor grid column
   * @param row - Neighbor grid row
   * @returns Whether that grid slot holds a point within `minDistance`
   */
  const tooClose = (point: MapPoint, column: number, row: number): boolean => {
    if (column < 0 || row < 0 || column >= columns || row >= rows) {
      return false;
    }
    const index = grid[row * columns + column] ?? -1;
    if (index < 0) return false;
    const other = points[index] as MapPoint;
    return Math.hypot(other.x - point.x, other.y - point.y) < minDistance;
  };

  accept({
    x: area.x + rng.next() * area.width,
    y: area.y + rng.next() * area.height,
  });
  while (active.length > 0) {
    const activeSlot = Math.floor(rng.next() * active.length);
    const origin = points[active[activeSlot] as number] as MapPoint;
    let placed = false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const angle = rng.next() * Math.PI * 2;
      const radius = minDistance * (1 + rng.next());
      const candidate = {
        x: origin.x + Math.cos(angle) * radius,
        y: origin.y + Math.sin(angle) * radius,
      };
      if (!fits(candidate)) continue;
      accept(candidate);
      placed = true;
      break;
    }
    if (placed) continue;
    active[activeSlot] = active[active.length - 1] as number;
    active.pop();
  }
  return points;
}
