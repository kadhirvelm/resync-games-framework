/** A point in viewport CSS pixels. */
export interface ScreenPoint {
  x: number;
  y: number;
}

/** A unit's on-screen body: the projected segment from its feet to its head. */
export interface ScreenTarget {
  feet: ScreenPoint;
  head: ScreenPoint;
  id: string;
}

/** Smallest click radius, in CSS pixels, around a unit's on-screen body. */
export const MIN_UNIT_CLICK_RADIUS = 14;

/**
 * Distance from a point to a line segment.
 * @param point - Query point
 * @param start - Segment start
 * @param end - Segment end
 * @returns The shortest distance, in the points' units
 */
export function distanceToSegment(
  point: ScreenPoint,
  start: ScreenPoint,
  end: ScreenPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0)
    return Math.hypot(point.x - start.x, point.y - start.y);
  const along =
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, along));
  return Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t));
}

/**
 * Finds the unit a click lands on by its projected body rather than its
 * mesh, so animated (skinned) models stay clickable whatever their bind pose.
 * The click radius grows with the unit's on-screen height, so zoomed-in units
 * are as easy to hit as they look.
 * @param click - Pointer position in viewport CSS pixels
 * @param targets - Units projected to the screen
 * @returns The id of the nearest unit within reach, or null
 */
export function unitAtScreenPoint(
  click: ScreenPoint,
  targets: readonly ScreenTarget[],
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const height = Math.hypot(
      target.head.x - target.feet.x,
      target.head.y - target.feet.y,
    );
    const reach = Math.max(MIN_UNIT_CLICK_RADIUS, height * 0.35);
    const distance = distanceToSegment(click, target.feet, target.head);
    if (distance > reach || distance >= bestDistance) continue;
    bestId = target.id;
    bestDistance = distance;
  }
  return bestId;
}
