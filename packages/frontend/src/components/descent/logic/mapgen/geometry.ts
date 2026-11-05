/** A point on the map, in tiles. */
export interface MapPoint {
  x: number;
  y: number;
}

/**
 * @param from - First point
 * @param to - Second point
 * @returns Straight-line distance between them
 */
export function distance(from: MapPoint, to: MapPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * @param point - Point to test
 * @param others - Points already placed
 * @returns Distance to the closest of `others`, or Infinity when empty
 */
export function nearestDistance(
  point: MapPoint,
  others: readonly MapPoint[],
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const other of others) {
    nearest = Math.min(nearest, distance(point, other));
  }
  return nearest;
}

/**
 * @param value - Value to clamp
 * @param min - Lowest allowed value
 * @param max - Highest allowed value
 * @returns `value` limited to `[min, max]`
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param origin - Start point
 * @param angle - Heading in radians, 0 pointing east and y growing south
 * @param length - Distance to travel
 * @returns The point `length` tiles from `origin` along `angle`
 */
export function polarOffset(
  origin: MapPoint,
  angle: number,
  length: number,
): MapPoint {
  return {
    x: origin.x + Math.cos(angle) * length,
    y: origin.y + Math.sin(angle) * length,
  };
}

/**
 * @param from - Start point
 * @param to - End point
 * @returns Heading from `from` to `to`, in radians
 */
export function headingBetween(from: MapPoint, to: MapPoint): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * @param left - First angle in radians
 * @param right - Second angle in radians
 * @returns The smallest absolute difference, in `[0, π]`
 */
export function angleBetween(left: number, right: number): number {
  const turn = Math.abs(left - right) % (Math.PI * 2);
  return turn > Math.PI ? Math.PI * 2 - turn : turn;
}

/**
 * Distance from a point to a line segment.
 * @param point - Point to measure
 * @param start - Segment start
 * @param end - Segment end
 * @returns Shortest distance from `point` to any point on the segment
 */
export function distanceToSegment(
  point: MapPoint,
  start: MapPoint,
  end: MapPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distance(point, start);
  const along =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = clamp(along, 0, 1);
  return distance(point, { x: start.x + t * dx, y: start.y + t * dy });
}

/**
 * Which side of a directed line a point lies on.
 * @param point - Point to classify
 * @param start - Line start
 * @param end - Line end; the line runs from `start` toward `end`
 * @returns 1 for the right-hand side in screen space (y down), -1 for the left, 0 on the line
 */
export function sideOfLine(
  point: MapPoint,
  start: MapPoint,
  end: MapPoint,
): -1 | 0 | 1 {
  const cross =
    (end.x - start.x) * (point.y - start.y) -
    (end.y - start.y) * (point.x - start.x);
  if (cross === 0) return 0;
  return cross > 0 ? 1 : -1;
}

/**
 * @param point - Point to round
 * @returns The nearest whole-tile cell
 */
export function toCell(point: MapPoint): MapPoint {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}
