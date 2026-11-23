/**
 * Deterministic coarse-grid navigation around static terrain obstacles.
 * When a unit's straight line to its destination is clear, movement keeps the
 * direct destination with zero grid work. When a ridge or canyon blocks the
 * line, a cached BFS distance field guides units smoothly through choke points
 * without getting stuck in concave rock pockets.
 */

import type { HurtDisk } from "./avoidHurt";

/** World-unit width of one coarse navigation cell. */
const CELL_SIZE = 2;

/** Extra padding around obstacles on the coarse grid so units clear rims. */
const GRID_PADDING = 0.65;

/** Maximum cached obstacle grids kept in memory. */
const MAX_GRID_CACHE = 8;

/** Maximum cached target distance fields per obstacle grid. */
const MAX_FIELD_CACHE = 32;

const DIRECTIONS: readonly { dx: number; dy: number }[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

interface NavPoint {
  readonly x: number;
  readonly y: number;
}

interface NavGridSize {
  readonly height: number;
  readonly width: number;
}

interface CoarseGrid {
  readonly blocked: Uint8Array;
  readonly cols: number;
  readonly fields: Map<number, Int32Array>;
  readonly rows: number;
}

const GRID_CACHE = new Map<string, CoarseGrid>();
const GRID_REF_CACHE = new WeakMap<
  readonly HurtDisk[],
  Map<string, CoarseGrid>
>();

/**
 * Reports whether the closed segment from `from` to `to` intersects any disk.
 * Uses exact point-to-segment distance so fast or long steps never tunnel.
 * @param from - Segment start
 * @param to - Segment end
 * @param disks - Circular obstacles to test
 * @param clearance - Extra radius around each obstacle
 * @returns True when any obstacle intersects the segment
 */
export function segmentHitsObstacles(
  from: NavPoint,
  to: NavPoint,
  disks: readonly HurtDisk[],
  clearance = 0.3,
): boolean {
  if (disks.length === 0) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const minX = from.x < to.x ? from.x : to.x;
  const maxX = from.x > to.x ? from.x : to.x;
  const minY = from.y < to.y ? from.y : to.y;
  const maxY = from.y > to.y ? from.y : to.y;
  for (const disk of disks) {
    const limit = disk.radius + clearance;
    if (
      disk.x + limit < minX ||
      disk.x - limit > maxX ||
      disk.y + limit < minY ||
      disk.y - limit > maxY
    ) {
      continue;
    }
    const t =
      lengthSq > 1e-9
        ? Math.max(
            0,
            Math.min(
              1,
              ((disk.x - from.x) * dx + (disk.y - from.y) * dy) / lengthSq,
            ),
          )
        : 0;
    const nearestX = from.x + dx * t;
    const nearestY = from.y + dy * t;
    const ox = nearestX - disk.x;
    const oy = nearestY - disk.y;
    if (ox * ox + oy * oy <= limit * limit) return true;
  }
  return false;
}

/**
 * Returns the next steering waypoint toward `destination` around static
 * terrain obstacles. Returns `destination` directly when the straight line is
 * unobstructed.
 * @param from - Current unit position
 * @param destination - Final target position
 * @param obstacles - Static impassable terrain disks
 * @param mapSize - Map bounds in tiles
 * @returns Immediate waypoint to steer toward
 */
export function terrainWaypoint(
  from: NavPoint,
  destination: NavPoint,
  obstacles: readonly HurtDisk[],
  mapSize: NavGridSize,
): NavPoint {
  if (obstacles.length === 0) return destination;
  if (!segmentHitsObstacles(from, destination, obstacles, 0.3)) {
    return destination;
  }
  const grid = getCoarseGrid(obstacles, mapSize);
  const rawGoalCol = clampInt(
    Math.floor(destination.x / CELL_SIZE),
    0,
    grid.cols - 1,
  );
  const rawGoalRow = clampInt(
    Math.floor(destination.y / CELL_SIZE),
    0,
    grid.rows - 1,
  );
  const goalCell = nearestOpenCell(grid, rawGoalCol, rawGoalRow);
  if (goalCell === null) return destination;

  const field = getDistanceField(grid, goalCell.col, goalCell.row);
  const startCol = clampInt(Math.floor(from.x / CELL_SIZE), 0, grid.cols - 1);
  const startRow = clampInt(Math.floor(from.y / CELL_SIZE), 0, grid.rows - 1);
  if (startCol === goalCell.col && startRow === goalCell.row) {
    return destination;
  }

  const first = bestNeighborCell(grid, field, startCol, startRow);
  if (first === null) return destination;

  // Look one extra cell ahead so units cut smoothly through choke points.
  const second = bestNeighborCell(grid, field, first.col, first.row);
  if (second !== null) {
    const ahead = cellCenter(second.col, second.row, mapSize);
    if (!segmentHitsObstacles(from, ahead, obstacles, 0.25)) {
      return ahead;
    }
  }
  return cellCenter(first.col, first.row, mapSize);
}

/**
 * Pushes a position outside every terrain obstacle it overlaps, keeping the
 * result inside the map bounds.
 * @param point - Position to adjust
 * @param bodyRadius - Radius of the moving body
 * @param obstacles - Impassable terrain disks
 * @param mapSize - Map bounds in tiles
 * @returns Adjusted position (same coordinates if already clear)
 */
export function pushOutOfObstacles(
  point: NavPoint,
  bodyRadius: number,
  obstacles: readonly HurtDisk[],
  mapSize: NavGridSize,
): { x: number; y: number } {
  let x = point.x;
  let y = point.y;
  for (const obstacle of obstacles) {
    const minDistance = obstacle.radius + bodyRadius;
    const dx = x - obstacle.x;
    if (dx >= minDistance || dx <= -minDistance) continue;
    const dy = y - obstacle.y;
    if (dy >= minDistance || dy <= -minDistance) continue;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDistance * minDistance) continue;
    const dist = Math.sqrt(distSq);
    const nx = dist > 1e-6 ? dx / dist : 1;
    const ny = dist > 1e-6 ? dy / dist : 0;
    x = clamp(obstacle.x + nx * (minDistance + 0.02), 0, mapSize.width - 1);
    y = clamp(obstacle.y + ny * (minDistance + 0.02), 0, mapSize.height - 1);
  }
  return { x, y };
}

/**
 * Builds or retrieves the cached coarse walkability grid for an obstacle set.
 * @param obstacles - Static terrain obstacles
 * @param mapSize - Map bounds in tiles
 * @returns Coarse grid with its own distance-field cache
 */
function getCoarseGrid(
  obstacles: readonly HurtDisk[],
  mapSize: NavGridSize,
): CoarseGrid {
  const sizeKey = `${mapSize.width}x${mapSize.height}`;
  let bySize = GRID_REF_CACHE.get(obstacles);
  const refHit = bySize?.get(sizeKey);
  if (refHit !== undefined) return refHit;

  const key = gridSignature(obstacles, mapSize);
  const existing = GRID_CACHE.get(key);
  if (existing !== undefined) {
    if (bySize === undefined) {
      bySize = new Map();
      GRID_REF_CACHE.set(obstacles, bySize);
    }
    bySize.set(sizeKey, existing);
    return existing;
  }

  const cols = Math.max(1, Math.ceil(mapSize.width / CELL_SIZE));
  const rows = Math.max(1, Math.ceil(mapSize.height / CELL_SIZE));
  const blocked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    const wy = row * CELL_SIZE + CELL_SIZE * 0.5;
    for (let col = 0; col < cols; col += 1) {
      const wx = col * CELL_SIZE + CELL_SIZE * 0.5;
      if (pointInAnyObstacle(wx, wy, obstacles, GRID_PADDING)) {
        blocked[row * cols + col] = 1;
      }
    }
  }
  const grid: CoarseGrid = {
    blocked,
    cols,
    fields: new Map(),
    rows,
  };
  if (GRID_CACHE.size >= MAX_GRID_CACHE) {
    const oldest = GRID_CACHE.keys().next().value;
    if (oldest !== undefined) GRID_CACHE.delete(oldest);
  }
  GRID_CACHE.set(key, grid);
  if (bySize === undefined) {
    bySize = new Map();
    GRID_REF_CACHE.set(obstacles, bySize);
  }
  bySize.set(sizeKey, grid);
  return grid;
}

/**
 * Computes or retrieves the cached 8-way distance field from a goal cell.
 * @param grid - Coarse walkability grid
 * @param goalCol - Goal column
 * @param goalRow - Goal row
 * @returns Distance array in tenths of a cell; -1 marks unreachable cells
 */
function getDistanceField(
  grid: CoarseGrid,
  goalCol: number,
  goalRow: number,
): Int32Array {
  const goalIndex = goalRow * grid.cols + goalCol;
  const cached = grid.fields.get(goalIndex);
  if (cached !== undefined) return cached;

  const total = grid.cols * grid.rows;
  const dist = new Int32Array(total).fill(-1);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  dist[goalIndex] = 0;
  queue[tail] = goalIndex;
  tail += 1;

  while (head < tail) {
    const current = queue[head] as number;
    head += 1;
    const col = current % grid.cols;
    const row = Math.floor(current / grid.cols);
    const currentDist = dist[current] as number;
    for (const dir of DIRECTIONS) {
      const nc = col + dir.dx;
      const nr = row + dir.dy;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const nextIndex = nr * grid.cols + nc;
      if (grid.blocked[nextIndex] === 1) continue;
      if (dist[nextIndex] !== -1) continue;
      // Prevent diagonal corner-cutting through two touching blocked cells.
      if (dir.dx !== 0 && dir.dy !== 0) {
        if (
          grid.blocked[row * grid.cols + nc] === 1 ||
          grid.blocked[nr * grid.cols + col] === 1
        ) {
          continue;
        }
      }
      dist[nextIndex] = currentDist + 1;
      queue[tail] = nextIndex;
      tail += 1;
    }
  }

  if (grid.fields.size >= MAX_FIELD_CACHE) {
    const oldest = grid.fields.keys().next().value;
    if (oldest !== undefined) grid.fields.delete(oldest);
  }
  grid.fields.set(goalIndex, dist);
  return dist;
}

/**
 * Picks the reachable 8-neighbor with the lowest distance to the goal.
 * @param grid - Coarse grid
 * @param field - Distance field from the goal
 * @param col - Current column
 * @param row - Current row
 * @returns Best neighbor cell, or null when already at goal or trapped
 */
function bestNeighborCell(
  grid: CoarseGrid,
  field: Int32Array,
  col: number,
  row: number,
): { col: number; row: number } | null {
  const hereIndex = row * grid.cols + col;
  const hereDist = field[hereIndex] as number;
  let bestCol = -1;
  let bestRow = -1;
  let bestDist = hereDist >= 0 ? hereDist : Number.POSITIVE_INFINITY;

  for (const dir of DIRECTIONS) {
    const nc = col + dir.dx;
    const nr = row + dir.dy;
    if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
    const index = nr * grid.cols + nc;
    const d = field[index] as number;
    if (d < 0) continue;
    if (dir.dx !== 0 && dir.dy !== 0 && hereDist >= 0) {
      if (
        grid.blocked[row * grid.cols + nc] === 1 ||
        grid.blocked[nr * grid.cols + col] === 1
      ) {
        continue;
      }
    }
    if (d < bestDist) {
      bestDist = d;
      bestCol = nc;
      bestRow = nr;
    }
  }
  if (bestCol < 0) return null;
  return { col: bestCol, row: bestRow };
}

/**
 * Finds the nearest unblocked coarse cell to `(col, row)` in expanding rings.
 * @param grid - Coarse grid
 * @param col - Preferred column
 * @param row - Preferred row
 * @returns Nearest open cell, or null if the entire grid is blocked
 */
function nearestOpenCell(
  grid: CoarseGrid,
  col: number,
  row: number,
): { col: number; row: number } | null {
  if (grid.blocked[row * grid.cols + col] === 0) return { col, row };
  const maxRadius = Math.max(grid.cols, grid.rows);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const nc = col + dx;
        const nr = row + dy;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
        if (grid.blocked[nr * grid.cols + nc] === 0) {
          return { col: nc, row: nr };
        }
      }
    }
  }
  return null;
}

/**
 * @param col - Coarse grid column
 * @param row - Coarse grid row
 * @param mapSize - Map bounds
 * @returns World-space center of that coarse cell
 */
function cellCenter(
  col: number,
  row: number,
  mapSize: NavGridSize,
): { x: number; y: number } {
  return {
    x: clamp(col * CELL_SIZE + CELL_SIZE * 0.5, 0, mapSize.width - 1),
    y: clamp(row * CELL_SIZE + CELL_SIZE * 0.5, 0, mapSize.height - 1),
  };
}

/**
 * @param x - World x
 * @param y - World y
 * @param obstacles - Terrain obstacles
 * @param padding - Clearance radius
 * @returns Whether `(x, y)` lies inside any padded obstacle
 */
function pointInAnyObstacle(
  x: number,
  y: number,
  obstacles: readonly HurtDisk[],
  padding: number,
): boolean {
  for (const obs of obstacles) {
    const dx = x - obs.x;
    const dy = y - obs.y;
    const limit = obs.radius + padding;
    if (dx * dx + dy * dy <= limit * limit) return true;
  }
  return false;
}

/**
 * Builds a deterministic cache key for a terrain obstacle layout.
 * @param obstacles - Static obstacles
 * @param mapSize - Map bounds
 * @returns Stable string key
 */
function gridSignature(
  obstacles: readonly HurtDisk[],
  mapSize: NavGridSize,
): string {
  const parts = [`${mapSize.width}x${mapSize.height}`];
  for (const obs of obstacles) {
    parts.push(`${obs.x},${obs.y},${obs.radius}`);
  }
  return parts.join("|");
}

/**
 * @param value - Integer to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns Clamped integer
 */
function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param value - Number to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns Clamped number
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
