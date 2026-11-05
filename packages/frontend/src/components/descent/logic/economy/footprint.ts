/**
 * Building footprints. A building stands on the center cell of an odd square
 * of cells and owns every cell of that square: nothing else may be placed on
 * it, and walls of the square block whoever the building blocks. Distances
 * to a building are measured to the nearest cell of its square.
 */

import type { Point } from "./model";
import { buildingDef } from "./tables";

/** Anything placed on the map by building type. */
export interface FootprintSite extends Point {
  buildingType: string;
}

/**
 * @param buildingType - Building id from `buildings.json`
 * @returns Side length in cells; unknown types cover one cell
 */
export function footprintSide(buildingType: string): number {
  return buildingDef(buildingType)?.footprint ?? 1;
}

/**
 * @param buildingType - Building id from `buildings.json`
 * @returns Cells from the center to the edge of the square; 0 for one cell
 */
export function footprintRadius(buildingType: string): number {
  return (footprintSide(buildingType) - 1) / 2;
}

/**
 * Chebyshev reach a walker needs to stand beside the building: the edge of
 * its square plus one cell.
 * @param site - Building being approached
 * @returns The largest center distance that still touches the square
 */
export function footprintReach(site: { buildingType: string }): number {
  return footprintRadius(site.buildingType) + 1;
}

/** Share of a building's side used as its round body in free-moving combat. */
const BODY_SHARE = 0.58;

/**
 * Round stand-in for a building's square in combat, where bodies move freely
 * instead of cell by cell. It reaches a little past each wall's midpoint so
 * walkers skirt the square instead of clipping it.
 * @param buildingType - Building id from `buildings.json`
 * @returns Body radius in cells; 0 for one-cell pieces such as walls
 */
export function footprintBodyRadius(buildingType: string): number {
  const side = footprintSide(buildingType);
  if (side <= 1) return 0;
  return side * BODY_SHARE;
}

/**
 * @param site - Building and its center cell
 * @param x - Cell column
 * @param y - Cell row
 * @returns Whether the cell lies under the building
 */
export function footprintCovers(
  site: FootprintSite,
  x: number,
  y: number,
): boolean {
  const radius = footprintRadius(site.buildingType);
  return Math.abs(x - site.x) <= radius && Math.abs(y - site.y) <= radius;
}

/**
 * @param site - Building and its center cell
 * @param point - Cell or unit position
 * @returns Chebyshev cells from the point to the nearest covered cell; 0 when
 *   the point is under the building and 1 when it stands beside it
 */
export function footprintDistance(site: FootprintSite, point: Point): number {
  const radius = footprintRadius(site.buildingType);
  return Math.max(
    0,
    Math.abs(point.x - site.x) - radius,
    Math.abs(point.y - site.y) - radius,
  );
}

/**
 * @param left - First building
 * @param right - Second building
 * @returns Chebyshev cells between the nearest covered cells of the two
 *   squares; 0 when they overlap and 1 when they touch
 */
export function footprintGap(
  left: FootprintSite,
  right: FootprintSite,
): number {
  const reach =
    footprintRadius(left.buildingType) + footprintRadius(right.buildingType);
  return Math.max(
    0,
    Math.abs(left.x - right.x) - reach,
    Math.abs(left.y - right.y) - reach,
  );
}

/**
 * @param site - Building and its center cell
 * @returns Every covered cell, row by row
 */
export function footprintCells(site: FootprintSite): Point[] {
  const radius = footprintRadius(site.buildingType);
  const cells: Point[] = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      cells.push({ x: site.x + dx, y: site.y + dy });
    }
  }
  return cells;
}

/**
 * @param sites - Buildings on the map
 * @param x - Cell column
 * @param y - Cell row
 * @returns The first building whose square covers the cell
 */
export function buildingCovering<T extends FootprintSite>(
  sites: readonly T[],
  x: number,
  y: number,
): T | undefined {
  return sites.find((site) => footprintCovers(site, x, y));
}
