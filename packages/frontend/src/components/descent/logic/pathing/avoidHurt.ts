/**
 * Steps that stay off circular ground which hurts a unit standing on it.
 * Callers pass the disks (ember vents). A unit already inside a disk walks
 * straight out; everyone else skirts the rim instead of crossing it.
 */

/** A circular patch of ground that hurts a unit inside it. */
export interface HurtDisk {
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

/** How far outside a disk a moving body stays, so it never rides the rim. */
const CLEARANCE = 0.05;

/** Four-way steps, nearest-first, used when a villager is standing in a disk. */
const ESCAPE_DIRS: readonly { x: number; y: number }[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * Reports whether a point lies on hurting ground.
 * @param disks - Disks to test
 * @param x - Point x
 * @param y - Point y
 * @param clearance - Extra radius, so a mover stays off the rim
 * @returns True when the point is inside any disk
 */
function pointHurts(
  disks: readonly HurtDisk[],
  x: number,
  y: number,
  clearance: number,
): boolean {
  return disks.some((disk) => {
    const dx = x - disk.x;
    const dy = y - disk.y;
    const radius = disk.radius + clearance;
    return dx * dx + dy * dy <= radius * radius;
  });
}

/**
 * Reports whether the closed segment from `from` to `to` touches a disk.
 * @param from - Segment start
 * @param to - Segment end
 * @param disks - Disks the segment must miss
 * @returns True when any point along the segment is inside a disk
 */
function segmentHits(
  from: { x: number; y: number },
  to: { x: number; y: number },
  disks: readonly HurtDisk[],
): boolean {
  if (disks.length === 0) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squaredLength = dx * dx + dy * dy;
  for (const disk of disks) {
    const projection =
      squaredLength === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((disk.x - from.x) * dx + (disk.y - from.y) * dy) / squaredLength,
            ),
          );
    if (
      pointHurts(
        [disk],
        from.x + dx * projection,
        from.y + dy * projection,
        CLEARANCE,
      )
    )
      return true;
  }
  return false;
}

/**
 * Walks `step` along a unit direction, shortening until the segment is clear.
 * @param from - Current point
 * @param dirX - Unit direction x
 * @param dirY - Unit direction y
 * @param step - Preferred distance
 * @param disks - Disks the step must miss
 * @returns A clear point, or null when even a short step still hits
 */
function clearStep(
  from: { x: number; y: number },
  dirX: number,
  dirY: number,
  step: number,
  disks: readonly HurtDisk[],
): { x: number; y: number } | null {
  let length = step;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = { x: from.x + dirX * length, y: from.y + dirY * length };
    if (!segmentHits(from, next, disks)) return next;
    length *= 0.5;
  }
  return null;
}

/** Number of fixed escape rays; fixed ordering makes overlap exits deterministic. */
const ESCAPE_RAYS = Array.from({ length: 64 }, (_, index) => ({
  x: Math.cos((index * 2 * Math.PI) / 64),
  y: Math.sin((index * 2 * Math.PI) / 64),
}));

/**
 * Measures distance to the occupied union's boundary along a unit ray.
 * All supplied disks contain the start, so their ray intervals are connected.
 * @param from - Current point
 * @param direction - Unit escape ray
 * @param occupied - Disks containing the point, including clearance
 * @returns Distance until the ray has left every occupied disk
 */
function exitDistance(
  from: { x: number; y: number },
  direction: { x: number; y: number },
  occupied: readonly HurtDisk[],
): number {
  let distance = 0;
  for (const disk of occupied) {
    const dx = from.x - disk.x;
    const dy = from.y - disk.y;
    const projection = dx * direction.x + dy * direction.y;
    const radius = disk.radius + CLEARANCE;
    const discriminant =
      projection * projection + radius * radius - dx * dx - dy * dy;
    distance = Math.max(
      distance,
      -projection + Math.sqrt(Math.max(0, discriminant)),
    );
  }
  return distance;
}

/**
 * Takes a bounded step toward the nearest safe sampled exit from the union.
 * Remaining ray distance decreases with movement, even in concave overlaps
 * where getting out requires initially moving deeper into one occupied disk.
 * Never enters a disk that did not already contain the starting point.
 * @param from - Point inside the expanded obstacle union
 * @param step - Maximum movement distance
 * @param disks - All obstacles
 * @returns A safe escape step, or the start when no sampled ray is safe
 */
function leaveDisks(
  from: { x: number; y: number },
  step: number,
  disks: readonly HurtDisk[],
): { x: number; y: number } {
  const occupied = disks.filter((disk) =>
    pointHurts([disk], from.x, from.y, CLEARANCE),
  );
  const others = disks.filter((disk) => !occupied.includes(disk));
  let best = from;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestExits = false;
  for (const direction of ESCAPE_RAYS) {
    const distance = exitDistance(from, direction, occupied);
    const exitLength = distance + CLEARANCE;
    const exits = !segmentHits(
      from,
      {
        x: from.x + direction.x * exitLength,
        y: from.y + direction.y * exitLength,
      },
      others,
    );
    // Prefer an unobstructed exit over repeatedly approaching a nearby blocker.
    if (bestExits && !exits) continue;
    if (exits === bestExits && distance >= bestDistance - 1e-9) continue;
    // Do not let a long movement order make distant obstacles block a local exit.
    const length = Math.min(step, exitLength);
    const next = clearStep(from, direction.x, direction.y, length, others);
    if (!next) continue;
    best = next;
    bestDistance = distance;
    bestExits = exits;
  }
  return best;
}

/**
 * The disk a point is standing in, ignoring clearance so it matches damage.
 * @param disks - Disks to test
 * @param x - Point x
 * @param y - Point y
 * @returns The first disk containing the point, or null
 */
function diskAt(
  disks: readonly HurtDisk[],
  x: number,
  y: number,
): HurtDisk | null {
  return disks.find((disk) => pointHurts([disk], x, y, 0)) ?? null;
}

/**
 * Replaces a straight step that would enter a hurt disk with a step along
 * the rim. A unit already inside walks out. A clear step is unchanged.
 * @param from - Where the unit is
 * @param proposed - Where a straight step would land
 * @param destination - Where the unit is ultimately going
 * @param disks - Ground that hurts
 * @returns The step to take; equal to `from` when every way forward still hits
 */
export function stepAroundHurt(
  from: { x: number; y: number },
  proposed: { x: number; y: number },
  destination: { x: number; y: number },
  disks: readonly HurtDisk[],
): { x: number; y: number } {
  if (disks.length === 0) return proposed;
  const step = Math.hypot(proposed.x - from.x, proposed.y - from.y);
  if (step === 0) return proposed;
  if (pointHurts(disks, from.x, from.y, CLEARANCE)) {
    return leaveDisks(from, step, disks);
  }
  if (!segmentHits(from, proposed, disks)) return proposed;
  const blocker = disks.find((disk) => segmentHits(from, proposed, [disk]));
  if (!blocker) return proposed;
  const rx = from.x - blocker.x;
  const ry = from.y - blocker.y;
  const radial = Math.hypot(rx, ry) || 1;
  const tx = -ry / radial;
  const ty = rx / radial;
  const towardX = destination.x - from.x;
  const towardY = destination.y - from.y;
  const side = towardX * tx + towardY * ty >= 0 ? 1 : -1;
  const primary = clearStep(from, tx * side, ty * side, step, disks);
  if (primary) return primary;
  return clearStep(from, tx * -side, ty * -side, step, disks) ?? from;
}

/**
 * Reports whether a map cell is outside every hurt disk.
 * @param disks - Ground that hurts
 * @param x - Cell column
 * @param y - Cell row
 * @returns True when a unit can stand on that cell without being hurt
 */
export function cellStaysClear(
  disks: readonly HurtDisk[],
  x: number,
  y: number,
): boolean {
  return diskAt(disks, x, y) === null;
}

/**
 * The next cell for a unit that is already standing in a hurt disk.
 * Picks the open neighbor farthest from the disk's center.
 * @param from - Cell the unit occupies
 * @param disks - Ground that hurts
 * @param open - Whether a neighboring cell can be entered, ignoring hurt
 * @returns The escape cell, or null when the unit is safe or boxed in
 */
export function escapeHurtCell(
  from: { x: number; y: number },
  disks: readonly HurtDisk[],
  open: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  const disk = diskAt(disks, from.x, from.y);
  if (!disk) return null;
  let best: { x: number; y: number } | null = null;
  let bestDistance = Math.hypot(from.x - disk.x, from.y - disk.y);
  for (const dir of ESCAPE_DIRS) {
    const next = { x: from.x + dir.x, y: from.y + dir.y };
    if (!open(next.x, next.y)) continue;
    const distance = Math.hypot(next.x - disk.x, next.y - disk.y);
    if (distance <= bestDistance) continue;
    best = next;
    bestDistance = distance;
  }
  return best;
}
