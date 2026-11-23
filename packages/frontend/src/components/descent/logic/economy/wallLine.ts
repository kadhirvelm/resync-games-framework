/** A map cell on the building grid. */
export interface WallCell {
  x: number;
  y: number;
}

/** Most wall pieces one drag may lay, so a stray drag cannot flood the sim. */
export const MAX_WALL_LINE_CELLS = 64;

/**
 * Whether a building type is a wall that can be dragged out as a line.
 * @param buildingType - Building id being placed
 * @returns True for wall and wall-variant buildings
 */
export function isWallType(buildingType: string | null | undefined): boolean {
  return buildingType != null && buildingType.endsWith("wall");
}

/**
 * Cells for a gap-free wall from one corner to another, like Age of Empires
 * II's drag-to-wall. Steps are 4-connected, so diagonal runs form a staircase
 * that units and hordes cannot slip through.
 * @param start - First cell, already snapped
 * @param end - Last cell, already snapped
 * @returns Ordered cells from start to end, capped at {@link MAX_WALL_LINE_CELLS}
 */
export function wallLineCells(start: WallCell, end: WallCell): WallCell[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const cells: WallCell[] = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  let doneX = 0;
  let doneY = 0;
  while (doneX < absX || doneY < absY) {
    if (cells.length >= MAX_WALL_LINE_CELLS) break;
    // Take the step that keeps the walk closest to the ideal straight line.
    const advanceX =
      doneY >= absY ||
      (doneX < absX && (doneX + 0.5) * absY <= (doneY + 0.5) * absX);
    if (advanceX) {
      x += stepX;
      doneX += 1;
    } else {
      y += stepY;
      doneY += 1;
    }
    cells.push({ x, y });
  }
  return cells;
}
