/**
 * Deterministic coarse-grid navigation around static terrain obstacles.
 * When a unit's straight line to its destination is clear, movement keeps the
 * direct destination with zero grid work. When a ridge or canyon blocks the
 * line, a cached weighted distance field guides units smoothly through choke points
 * without getting stuck in concave rock pockets.
 */

import type { HurtDisk } from "./avoidHurt";

/** World-unit width of one coarse navigation cell. */
const CELL_SIZE = 2;

/** Shared clearance for grid nodes, edges, endpoint connectors and shortcuts. */
const GRID_PADDING = 0.35;

/** Maximum cached obstacle grids kept in memory. */
const MAX_GRID_CACHE = 8;

/** Maximum cached target distance fields per obstacle grid. */
const MAX_FIELD_CACHE = 32;

/** A few nearby visible anchors retain endpoint flexibility without field churn. */
const GOAL_CONNECTORS_PER_COMPONENT = 4;

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
  readonly fields: Map<string, DistanceField>;
  readonly components: Int32Array;
  readonly connectors: Map<string, readonly number[]>;
  readonly points: readonly NavPoint[];
  readonly edges: readonly (readonly number[])[];
  readonly rows: number;
}

interface DistanceField {
  readonly distances: Float64Array;
  readonly next: Int32Array;
}

interface HeapEntry {
  readonly index: number;
  readonly cost: number;
}

/** Stable minimum heap: equal costs are ordered by cell index. */
class MinHeap {
  private readonly entries: HeapEntry[] = [];

  /** Adds an entry and restores heap order. */
  push(entry: HeapEntry): void {
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const above = this.entries[parent] as HeapEntry;
      if (!this.before(entry, above)) break;
      this.entries[index] = above;
      index = parent;
    }
    this.entries[index] = entry;
  }

  /** Removes the cheapest entry, or returns undefined for an empty heap. */
  pop(): HeapEntry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (this.entries.length === 0 || last === undefined) return first;
    let index = 0;
    while (index * 2 + 1 < this.entries.length) {
      let child = index * 2 + 1;
      const right = this.entries[child + 1];
      if (right && this.before(right, this.entries[child] as HeapEntry))
        child += 1;
      if (!this.before(this.entries[child] as HeapEntry, last)) break;
      this.entries[index] = this.entries[child] as HeapEntry;
      index = child;
    }
    this.entries[index] = last;
    return first;
  }

  /** Reports deterministic priority between two entries. */
  private before(a: HeapEntry, b: HeapEntry): boolean {
    return a.cost < b.cost || (a.cost === b.cost && a.index < b.index);
  }
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
  clearance = GRID_PADDING,
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
  const goal = {
    x: clamp(destination.x, 0, mapSize.width - 1),
    y: clamp(destination.y, 0, mapSize.height - 1),
  };
  if (canConnect(from, goal, obstacles)) {
    return goal.x === destination.x && goal.y === destination.y
      ? destination
      : goal;
  }
  const grid = getCoarseGrid(obstacles, mapSize);
  let goals = goalConnectors(grid, goal, obstacles);
  let field = getDistanceField(grid, goals);
  let best = startConnector(grid, field, from, obstacles, false);
  if (best < 0) {
    // Rare disconnected/embedded endpoints need a wider choice of goal region.
    goals = goalConnectors(grid, goal, obstacles, true);
    field = getDistanceField(grid, goals);
    best = startConnector(grid, field, from, obstacles, true);
  }
  // No reachable connector: holding position is safer than walking into a wall.
  if (best < 0) return from;
  let waypoint = grid.points[best] as NavPoint;
  let current = best;
  // Smooth the entire strictly descending route, not just its first two cells.
  // Every shortcut is checked with exactly the same clearance as grid edges.
  while (current >= 0) {
    const point = grid.points[current] as NavPoint;
    if (canConnect(from, point, obstacles)) waypoint = point;
    if (field.next[current] === -1) {
      const approach = approachGoal(point, goal, obstacles);
      if (canConnect(from, approach, obstacles)) waypoint = approach;
      break;
    }
    current = field.next[current] as number;
  }
  return waypoint;
}

/**
 * Pushes a position outside every terrain obstacle it overlaps, keeping the
 * result inside the map bounds. If the entire map is covered, holds the bounded
 * input instead of cycling or returning an out-of-bounds projection.
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
  const bounded = {
    x: clamp(point.x, 0, mapSize.width - 1),
    y: clamp(point.y, 0, mapSize.height - 1),
  };
  if (!pointInAnyObstacle(bounded.x, bounded.y, obstacles, bodyRadius))
    return bounded;
  // The nearest exterior point of a disk union lies on a radial projection,
  // a pairwise circle intersection, or the map boundary. Testing those exact
  // candidates avoids order-dependent projection cycles in concave overlaps.
  const disks = obstacles.map((disk) => ({
    radius: disk.radius + bodyRadius + 0.02,
    x: disk.x,
    y: disk.y,
  }));
  const candidates: NavPoint[] = [
    { x: 0, y: 0 },
    { x: mapSize.width - 1, y: 0 },
    { x: 0, y: mapSize.height - 1 },
    { x: mapSize.width - 1, y: mapSize.height - 1 },
  ];
  for (let index = 0; index < disks.length; index += 1) {
    const disk = disks[index] as HurtDisk;
    const dx = bounded.x - disk.x;
    const dy = bounded.y - disk.y;
    const length = Math.hypot(dx, dy);
    const direction =
      length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    candidates.push({
      x: disk.x + direction.x * disk.radius,
      y: disk.y + direction.y * disk.radius,
    });
    candidates.push(...diskMapIntersections(disk, mapSize));
    for (let other = index + 1; other < disks.length; other += 1) {
      candidates.push(...diskIntersections(disk, disks[other] as HurtDisk));
    }
  }
  candidates.sort(
    (a, b) =>
      distance(a, bounded) - distance(b, bounded) || a.x - b.x || a.y - b.y,
  );
  for (const candidate of candidates) {
    if (
      candidate.x < 0 ||
      candidate.y < 0 ||
      candidate.x > mapSize.width - 1 ||
      candidate.y > mapSize.height - 1
    )
      continue;
    // The small expansion above absorbs intersection rounding without allowing
    // re-entry into any original body-expanded obstacle.
    if (pointInAnyObstacle(candidate.x, candidate.y, obstacles, bodyRadius))
      continue;
    return { x: candidate.x, y: candidate.y };
  }
  // No valid exterior exists (for example, a disk covers the entire map).
  return bounded;
}

/**
 * Computes intersections of two expanded disk boundaries, including tangency.
 * @param a - First expanded obstacle
 * @param b - Second expanded obstacle
 * @returns Up to two candidate union-boundary points; none for nested circles
 */
function diskIntersections(a: HurtDisk, b: HurtDisk): NavPoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const separation = Math.hypot(dx, dy);
  if (
    separation < 1e-9 ||
    separation > a.radius + b.radius ||
    separation < Math.abs(a.radius - b.radius)
  )
    return [];
  const along =
    (a.radius * a.radius - b.radius * b.radius + separation * separation) /
    (2 * separation);
  const height = Math.sqrt(Math.max(0, a.radius * a.radius - along * along));
  const x = a.x + (dx * along) / separation;
  const y = a.y + (dy * along) / separation;
  const ox = (-dy * height) / separation;
  const oy = (dx * height) / separation;
  return [
    { x: x + ox, y: y + oy },
    { x: x - ox, y: y - oy },
  ];
}

/**
 * Computes expanded-circle intersections with the four bounded map edges.
 * @param disk - Body-expanded obstacle with an extra numerical margin
 * @param mapSize - Map bounds
 * @returns Candidate boundary exits, subsequently filtered against the full union
 */
function diskMapIntersections(
  disk: HurtDisk,
  mapSize: NavGridSize,
): NavPoint[] {
  const candidates: NavPoint[] = [];
  for (const x of [0, mapSize.width - 1]) {
    const remaining = disk.radius * disk.radius - (x - disk.x) ** 2;
    if (remaining < 0) continue;
    const offset = Math.sqrt(remaining);
    candidates.push({ x, y: disk.y - offset }, { x, y: disk.y + offset });
  }
  for (const y of [0, mapSize.height - 1]) {
    const remaining = disk.radius * disk.radius - (y - disk.y) ** 2;
    if (remaining < 0) continue;
    const offset = Math.sqrt(remaining);
    candidates.push({ x: disk.x - offset, y }, { x: disk.x + offset, y });
  }
  return candidates;
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
  const points: NavPoint[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const point = cellCenter(col, row, mapSize);
      points.push(point);
      if (pointInAnyObstacle(point.x, point.y, obstacles, GRID_PADDING)) {
        blocked[row * cols + col] = 1;
      }
    }
  }
  const edges: number[][] = points.map(() => []);
  for (let index = 0; index < points.length; index += 1) {
    if (blocked[index]) continue;
    const col = index % cols;
    const row = Math.floor(index / cols);
    for (const dir of DIRECTIONS) {
      const nc = col + dir.dx;
      const nr = row + dir.dy;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const neighbor = nr * cols + nc;
      if (blocked[neighbor]) continue;
      if (
        segmentHitsObstacles(
          points[index] as NavPoint,
          points[neighbor] as NavPoint,
          obstacles,
          GRID_PADDING,
        )
      )
        continue;
      (edges[index] as number[]).push(neighbor);
    }
  }
  const grid: CoarseGrid = {
    blocked,
    cols,
    components: connectedComponents(edges, blocked),
    connectors: new Map(),
    edges,
    fields: new Map(),
    points,
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
 * Labels connected graph regions once, so blocked goals can offer a visible
 * connector on either side without arbitrarily choosing an unreachable region.
 * @param edges - Validated undirected adjacency lists
 * @param blocked - Closed grid centers
 * @returns Region ids, with -1 for blocked centers
 */
function connectedComponents(
  edges: readonly (readonly number[])[],
  blocked: Uint8Array,
): Int32Array {
  const components = new Int32Array(edges.length).fill(-1);
  const queue = new Int32Array(edges.length);
  let component = 0;
  for (let index = 0; index < edges.length; index += 1) {
    if (blocked[index] || components[index] !== -1) continue;
    let head = 0;
    let tail = 1;
    queue[0] = index;
    components[index] = component;
    while (head < tail) {
      const current = queue[head++] as number;
      for (const neighbor of edges[current] as readonly number[]) {
        if (components[neighbor] !== -1) continue;
        components[neighbor] = component;
        queue[tail++] = neighbor;
      }
    }
    component += 1;
  }
  return components;
}

/**
 * Selects the nearest visible anchors in each connected region. Ranking is
 * geometric and deterministic; visibility is checked only for competitive
 * candidates. Fields stay reusable even when the exact destination moves.
 * @param grid - Cached graph and component labels
 * @param goal - Exact bounded destination, possibly embedded
 * @param obstacles - Current static obstacles
 * @param global - Search all regions only when local planning cannot connect
 * @returns Nearby reachable goal anchors, including alternatives across walls
 */
function goalConnectors(
  grid: CoarseGrid,
  goal: NavPoint,
  obstacles: readonly HurtDisk[],
  global = false,
): readonly number[] {
  const key = `${goal.x},${goal.y},${global}`;
  const cached = grid.connectors.get(key);
  if (cached) return cached;
  const regions = new Map<number, HeapEntry[]>();
  const indices = global ? grid.points.keys() : nearbyCells(grid, goal);
  for (const index of indices) {
    const component = grid.components[index] as number;
    if (component < 0) continue;
    const point = grid.points[index] as NavPoint;
    const dx = point.x - goal.x;
    const dy = point.y - goal.y;
    const cost = dx * dx + dy * dy;
    const nearest = regions.get(component) ?? [];
    if (
      nearest.length === GOAL_CONNECTORS_PER_COMPONENT &&
      cost >= (nearest[nearest.length - 1] as HeapEntry).cost
    )
      continue;
    if (!canConnect(goal, point, obstacles)) continue;
    nearest.push({ cost, index });
    nearest.sort((a, b) => a.cost - b.cost || a.index - b.index);
    if (nearest.length > GOAL_CONNECTORS_PER_COMPONENT) nearest.pop();
    regions.set(component, nearest);
  }
  const connectors = [...regions.values()]
    .flatMap((entries) => entries.map((entry) => entry.index))
    .sort((a, b) => a - b);
  if (grid.connectors.size >= MAX_FIELD_CACHE) {
    const oldest = grid.connectors.keys().next().value;
    if (oldest !== undefined) grid.connectors.delete(oldest);
  }
  grid.connectors.set(key, connectors);
  return connectors;
}

/**
 * Enumerates a bounded neighborhood around an exact endpoint, including cells
 * across its containing-cell boundaries. Off-map endpoints clamp only the search.
 * @param grid - Cached graph dimensions
 * @param point - Exact start or goal
 * @returns At most 25 nearby cells in deterministic row-major order
 */
function nearbyCells(grid: CoarseGrid, point: NavPoint): number[] {
  const col = clamp(Math.floor(point.x / CELL_SIZE), 0, grid.cols - 1);
  const row = clamp(Math.floor(point.y / CELL_SIZE), 0, grid.rows - 1);
  const cells: number[] = [];
  for (
    let y = Math.max(0, row - 2);
    y <= Math.min(grid.rows - 1, row + 2);
    y += 1
  ) {
    for (
      let x = Math.max(0, col - 2);
      x <= Math.min(grid.cols - 1, col + 2);
      x += 1
    ) {
      cells.push(y * grid.cols + x);
    }
  }
  return cells;
}

/**
 * Picks a visible start connector using local cells first; exhaustive search is
 * reserved for blocked/off-grid starts with no locally reachable graph edge.
 * @param grid - Shared graph
 * @param field - Weighted goal field
 * @param from - Exact unit position
 * @param obstacles - Movement hazards
 * @param global - Whether to search beyond the local neighborhood
 * @returns Cheapest visible connector, or -1 when none is reachable
 */
function startConnector(
  grid: CoarseGrid,
  field: DistanceField,
  from: NavPoint,
  obstacles: readonly HurtDisk[],
  global: boolean,
): number {
  let best = -1;
  let cost = Number.POSITIVE_INFINITY;
  const indices = global ? grid.points.keys() : nearbyCells(grid, from);
  for (const index of indices) {
    const remaining = field.distances[index] as number;
    if (!Number.isFinite(remaining)) continue;
    const point = grid.points[index] as NavPoint;
    const candidate = distance(from, point) + remaining;
    if (candidate >= cost || !canConnect(from, point, obstacles)) continue;
    cost = candidate;
    best = index;
  }
  return best;
}

/**
 * Builds or retrieves a Euclidean-cost Dijkstra field rooted at stable anchors.
 * Unlike exact-goal fields, this remains valid as pursuit targets move.
 * @param grid - Cached segment-validated graph
 * @param goals - Validated nearby goal anchors (sorted cell ids)
 * @returns Weighted graph distances and strictly descending successor links
 */
function getDistanceField(
  grid: CoarseGrid,
  goals: readonly number[],
): DistanceField {
  const key = goals.join(",");
  const cached = grid.fields.get(key);
  if (cached) {
    // Refresh bounded LRU order, retaining anchors shared by nearby targets.
    grid.fields.delete(key);
    grid.fields.set(key, cached);
    return cached;
  }
  const distances = new Float64Array(grid.points.length).fill(
    Number.POSITIVE_INFINITY,
  );
  const next = new Int32Array(grid.points.length).fill(-1);
  const heap = new MinHeap();
  // Seed weights depend on stable anchors, not the moving exact destination.
  const center = { x: 0, y: 0 };
  for (const index of goals) {
    center.x += (grid.points[index] as NavPoint).x / goals.length;
    center.y += (grid.points[index] as NavPoint).y / goals.length;
  }
  for (const index of goals) {
    const cost = distance(grid.points[index] as NavPoint, center);
    distances[index] = cost;
    heap.push({ cost, index });
  }
  for (let entry = heap.pop(); entry; entry = heap.pop()) {
    if (entry.cost !== distances[entry.index]) continue;
    for (const neighbor of grid.edges[entry.index] as readonly number[]) {
      const cost =
        entry.cost +
        distance(
          grid.points[entry.index] as NavPoint,
          grid.points[neighbor] as NavPoint,
        );
      if (cost >= (distances[neighbor] as number)) continue;
      distances[neighbor] = cost;
      next[neighbor] = entry.index;
      heap.push({ cost, index: neighbor });
    }
  }
  const field = { distances, next };
  if (grid.fields.size >= MAX_FIELD_CACHE) {
    const oldest = grid.fields.keys().next().value;
    if (oldest !== undefined) grid.fields.delete(oldest);
  }
  grid.fields.set(key, field);
  return field;
}

/** Returns Euclidean world-space distance between two navigation points. */
function distance(a: NavPoint, b: NavPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Checks an exact connector, allowing only outward escape from disks already
 * containing its start. It may never enter another disk or end inside one.
 */
function canConnect(
  from: NavPoint,
  to: NavPoint,
  obstacles: readonly HurtDisk[],
): boolean {
  const vx = to.x - from.x;
  const vy = to.y - from.y;
  const lengthSq = vx * vx + vy * vy;
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);
  for (const disk of obstacles) {
    const radius = disk.radius + GRID_PADDING;
    if (
      disk.x + radius < minX ||
      disk.x - radius > maxX ||
      disk.y + radius < minY ||
      disk.y - radius > maxY
    )
      continue;
    const dx = from.x - disk.x;
    const dy = from.y - disk.y;
    const radiusSq = radius * radius;
    if (dx * dx + dy * dy <= radiusSq) {
      const endX = to.x - disk.x;
      const endY = to.y - disk.y;
      if (endX * endX + endY * endY <= radiusSq) return false;
      if (dx * vx + dy * vy < 0) return false;
      continue;
    }
    // Same exact closed-segment test as segmentHitsObstacles, with segment
    // invariants hoisted and no temporary one-element obstacle arrays.
    const t =
      lengthSq > 1e-9 ? clamp(-(dx * vx + dy * vy) / lengthSq, 0, 1) : 0;
    const ox = dx + vx * t;
    const oy = dy + vy * t;
    if (ox * ox + oy * oy <= radiusSq) return false;
  }
  return true;
}

/**
 * Resolves a selected goal connector lazily using its first disk intersection.
 * @param from - Clear grid center
 * @param goal - Possibly embedded destination
 * @param obstacles - Static disks
 * @returns Goal or a point just before the first padded obstacle rim
 */
function approachGoal(
  from: NavPoint,
  goal: NavPoint,
  obstacles: readonly HurtDisk[],
): NavPoint {
  const dx = goal.x - from.x;
  const dy = goal.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return from;
  let fraction = 1;
  for (const disk of obstacles) {
    const ox = from.x - disk.x;
    const oy = from.y - disk.y;
    // Combat rounds coordinates to 0.001. Inflating radially by a millitile
    // exceeds its maximum sqrt(2) * 0.0005 rounding displacement, including
    // nearly tangent approaches where an along-segment margin is insufficient.
    const radius = disk.radius + GRID_PADDING + 0.001;
    if (ox * ox + oy * oy <= radius * radius) return from;
    const projection = ox * dx + oy * dy;
    const discriminant =
      projection * projection -
      lengthSq * (ox * ox + oy * oy - radius * radius);
    if (discriminant < 0) continue;
    const entry = (-projection - Math.sqrt(discriminant)) / lengthSq;
    if (entry >= 0 && entry <= fraction) {
      fraction = Math.max(0, entry - 1e-6 / Math.sqrt(lengthSq));
    }
  }
  return { x: from.x + dx * fraction, y: from.y + dy * fraction };
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
 * @param value - Number to clamp
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns Clamped number
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
