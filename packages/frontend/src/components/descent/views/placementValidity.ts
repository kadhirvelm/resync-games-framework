import {
  footprintCells,
  footprintCovers,
  footprintGap,
} from "../logic/economy/footprint";
import type { MapPoint } from "./selection";
import type { ShellModel } from "./shellModel";

/** Model slices needed to preview whether ground can hold a building. */
export type PlacementValidityModel = Pick<
  ShellModel,
  "buildings" | "map" | "nodes" | "terrain"
>;

/**
 * Preview of the economy's ground checks for `placeBuilding`: on the map,
 * clear of other footprints and resource nodes, and off hazard vents. Rocky
 * terrain obstacles are not published to the shell, so the sim still has the
 * final say; this only turns the ghost red for rejections we can see.
 * @param model - Current shell model
 * @param buildingType - Building being placed
 * @param point - Cursor cell (already snapped by the caller or snapped here)
 * @returns True when the visible ground allows placement
 */
export function placementGroundValid(
  model: PlacementValidityModel,
  buildingType: string,
  point: MapPoint,
): boolean {
  const site = {
    buildingType,
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
  const cells = footprintCells(site);
  const onMap = cells.every(
    (cell) =>
      cell.x >= 0 &&
      cell.y >= 0 &&
      cell.x < model.map.width &&
      cell.y < model.map.height,
  );
  if (!onMap) return false;
  if (model.buildings.some((building) => footprintGap(building, site) === 0)) {
    return false;
  }
  if (model.nodes.some((node) => footprintCovers(site, node.x, node.y))) {
    return false;
  }
  // Vents are hazards, not blockers: the sim allows building beside them.
  return !model.terrain.some((obstacle) =>
    cells.some((cell) => {
      const dx = cell.x - obstacle.x;
      const dy = cell.y - obstacle.y;
      return dx * dx + dy * dy <= obstacle.radius * obstacle.radius;
    }),
  );
}
