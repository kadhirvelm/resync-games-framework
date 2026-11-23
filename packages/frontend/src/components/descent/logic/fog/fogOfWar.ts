/**
 * Age of Empires style fog of war over a tile grid.
 *
 * Every tile is in one of three states:
 * - `unseen`: never inside anyone's sight; drawn black
 * - `explored`: seen before; terrain and deposits are remembered, but
 *   nothing moving there is shown
 * - `visible`: inside a sight source right now; drawn live
 *
 * The grid is a JSON-safe string with one character per tile, row-major,
 * so it can sit in sim meta, ride along in snapshots, and be saved.
 */

import type { MapBounds } from "../types";

/** What the player can see of one tile. */
export type FogVisibility = "explored" | "unseen" | "visible";

/** Saved fog grid. `cells` holds one `FOG_CELL` character per tile. */
export interface FogOfWarState {
  cells: string;
  height: number;
  width: number;
}

/** Something that reveals a disk of tiles around itself. */
export interface SightSource {
  radius: number;
  x: number;
  y: number;
}

/** Character codes stored in `FogOfWarState.cells`. */
export const FOG_CELL = {
  explored: "1".charCodeAt(0),
  unseen: "0".charCodeAt(0),
  visible: "2".charCodeAt(0),
} as const;

const textDecoder = new TextDecoder();
const VISIBLE_CHAR = String.fromCharCode(FOG_CELL.visible);
const EXPLORED_CHAR = String.fromCharCode(FOG_CELL.explored);

let scratchBuffer = new Uint8Array(0);

/**
 * Returns a reusable byte view of length `size`, growing the backing store
 * only when a larger map is encountered.
 * @param size - Number of cells needed
 * @returns A `Uint8Array` view of length `size`
 */
function acquireScratchBuffer(size: number): Uint8Array {
  if (scratchBuffer.length < size) {
    scratchBuffer = new Uint8Array(size);
  }
  return scratchBuffer.subarray(0, size);
}

/**
 * Ensures a fog state is frozen so snapshots can reuse it without cloning.
 * @param fog - Fog grid to freeze if needed
 * @returns Frozen fog grid
 */
function freezeFog(fog: FogOfWarState): FogOfWarState {
  if (Object.isFrozen(fog)) return fog;
  return Object.freeze({
    cells: fog.cells,
    height: fog.height,
    width: fog.width,
  });
}

/**
 * A fully unexplored grid.
 * @param bounds - Map size in tiles
 * @returns Fog where every tile is unseen
 */
export function createFogOfWar(bounds: MapBounds): FogOfWarState {
  const width = Math.max(1, Math.ceil(bounds.width));
  const height = Math.max(1, Math.ceil(bounds.height));
  return Object.freeze({
    cells: String.fromCharCode(FOG_CELL.unseen).repeat(width * height),
    height,
    width,
  });
}

/**
 * Recomputes what is visible now. Tiles that were visible but are out of
 * every source's sight fall back to explored; explored tiles never return
 * to unseen.
 * @param previous - Fog from the last update
 * @param sources - Every sight source the player owns
 * @returns Recomputed fog, reusing `previous` when its cells are unchanged
 */
export function revealFogOfWar(
  previous: FogOfWarState,
  sources: readonly SightSource[],
): FogOfWarState {
  const { height, width } = previous;
  const previousCells = previous.cells;
  if (sources.length === 0) {
    if (previousCells.indexOf(VISIBLE_CHAR) === -1) return freezeFog(previous);
    const nextCells = previousCells.replaceAll(VISIBLE_CHAR, EXPLORED_CHAR);
    return Object.freeze({ cells: nextCells, height, width });
  }
  const size = width * height;
  const cells = acquireScratchBuffer(size);
  const unseen = FOG_CELL.unseen;
  const explored = FOG_CELL.explored;
  for (let index = 0; index < size; index += 1) {
    const code = previousCells.charCodeAt(index);
    cells[index] = code === unseen ? unseen : explored;
  }
  for (let index = 0; index < sources.length; index += 1) {
    stampSight(cells, width, height, sources[index] as SightSource);
  }
  const nextCells = textDecoder.decode(cells);
  if (nextCells === previousCells) return freezeFog(previous);
  return Object.freeze({ cells: nextCells, height, width });
}

/**
 * Marks the tiles inside one sight disk as visible.
 * @param cells - Grid being built, row-major
 * @param width - Grid width
 * @param height - Grid height
 * @param source - Sight disk
 */
function stampSight(
  cells: Uint8Array,
  width: number,
  height: number,
  source: SightSource,
): void {
  if (!(source.radius > 0)) return;
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return;
  const radiusSquared = source.radius * source.radius;
  const top = Math.max(0, Math.ceil(source.y - source.radius));
  const bottom = Math.min(height - 1, Math.floor(source.y + source.radius));
  const left = Math.max(0, Math.ceil(source.x - source.radius));
  const right = Math.min(width - 1, Math.floor(source.x + source.radius));
  for (let y = top; y <= bottom; y += 1) {
    const dy = y - source.y;
    const row = y * width;
    for (let x = left; x <= right; x += 1) {
      const dx = x - source.x;
      if (dx * dx + dy * dy > radiusSquared) continue;
      cells[row + x] = FOG_CELL.visible;
    }
  }
}

/**
 * Reads one map point. Points off the grid take the nearest edge tile.
 * @param fog - Fog grid, or null when the layer has no fog
 * @param x - Map x
 * @param y - Map y
 * @returns The tile's visibility; everything is visible without fog
 */
export function fogVisibilityAt(
  fog: FogOfWarState | null,
  x: number,
  y: number,
): FogVisibility {
  if (fog === null) return "visible";
  const column = clampIndex(Math.round(x), fog.width);
  const row = clampIndex(Math.round(y), fog.height);
  const code = fog.cells.charCodeAt(row * fog.width + column);
  if (code === FOG_CELL.visible) return "visible";
  if (code === FOG_CELL.explored) return "explored";
  return "unseen";
}

/**
 * @param fog - Fog grid, or null when the layer has no fog
 * @param point - Map point
 * @returns Whether anything moving at the point is shown live
 */
export function isFogVisible(
  fog: FogOfWarState | null,
  point: { x: number; y: number },
): boolean {
  return fogVisibilityAt(fog, point.x, point.y) === "visible";
}

/**
 * @param fog - Fog grid, or null when the layer has no fog
 * @param point - Map point
 * @returns Whether the point has ever been seen
 */
export function isFogExplored(
  fog: FogOfWarState | null,
  point: { x: number; y: number },
): boolean {
  return fogVisibilityAt(fog, point.x, point.y) !== "unseen";
}

/**
 * @param fog - Fog grid
 * @param bounds - Map size in tiles
 * @returns Whether the grid covers exactly this map
 */
export function fogMatchesBounds(
  fog: FogOfWarState,
  bounds: MapBounds,
): boolean {
  return (
    fog.width === Math.max(1, Math.ceil(bounds.width)) &&
    fog.height === Math.max(1, Math.ceil(bounds.height))
  );
}

/**
 * Validates a loaded or published fog grid.
 * @param value - Candidate value
 * @returns Whether it is a well-formed fog grid
 */
export function isFogOfWarState(value: unknown): value is FogOfWarState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FogOfWarState>;
  if (!Number.isSafeInteger(candidate.width)) return false;
  if (!Number.isSafeInteger(candidate.height)) return false;
  if (typeof candidate.cells !== "string") return false;
  const width = candidate.width as number;
  const height = candidate.height as number;
  return width > 0 && height > 0 && candidate.cells.length === width * height;
}

/**
 * @param value - Candidate index
 * @param size - Axis length
 * @returns The index clamped onto the axis
 */
function clampIndex(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}
