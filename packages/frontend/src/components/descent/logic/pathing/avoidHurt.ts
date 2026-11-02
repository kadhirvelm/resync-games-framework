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
 * Reports whether the open segment from `from` to `to` crosses a disk.
 * The start point is not tested, so a unit already inside can still step out.
 * @param from - Segment start
 * @param to - Segment end
 * @param disks - Disks the segment must miss
 * @returns True when any sample along the segment is inside a disk
 */
function segmentHits(
  from: { x: number; y: number },
  to: { x: number; y: number },
  disks: readonly HurtDisk[],
): boolean {
  if (disks.length === 0) return false;
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const samples = Math.max(1, Math.ceil(length / 0.25));
  for (let index = 1; index <= samples; index += 1) {
    const t = index / samples;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (pointHurts(disks, x, y, CLEARANCE)) return true;
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

/**
 * Steps away from the center of the disk the unit is standing in.
 * @param from - Point inside `disk`
 * @param step - Distance to move
 * @param disk - Disk to leave
 * @param disks - Other disks the exit must miss
 * @returns The exit step, or `from` when the way out is blocked
 */
function leaveDisk(
  from: { x: number; y: number },
  step: number,
  disk: HurtDisk,
  disks: readonly HurtDisk[],
): { x: number; y: number } {
  const others = disks.filter((entry) => entry !== disk);
  const rx = from.x - disk.x;
  const ry = from.y - disk.y;
  const radial = Math.hypot(rx, ry);
  if (radial < 1e-9) {
    return clearStep(from, 1, 0, step, others) ?? from;
  }
  return clearStep(from, rx / radial, ry / radial, step, others) ?? from;
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
  const occupied = diskAt(disks, from.x, from.y);
  if (occupied) return leaveDisk(from, step, occupied, disks);
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
