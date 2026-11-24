import {
  footprintCells,
  footprintCovers,
  footprintGap,
} from "../logic/economy/footprint";
import { isFogExplored } from "../logic/fog";
import type { MapPoint } from "./selection";
import type { ShellModel } from "./shellModel";

/** Model slices needed to preview whether ground can hold a building. */
export type PlacementValidityModel = Pick<
  ShellModel,
  "buildings" | "map" | "nodes" | "terrain"
> &
  Partial<Pick<ShellModel, "buildOptions" | "fog">>;

/**
 * Explains why a building cannot be placed at `point`, or returns null when
 * every visible check (tier, cost, bounds, explored fog, buildings, resource
 * nodes, and impassable terrain) allows placement.
 * @param model - Current shell model
 * @param buildingType - Building being placed
 * @param point - Cursor cell (already snapped by the caller or snapped here)
 * @returns Player-readable blocker, or null when placement is allowed
 */
export function placementBlockReason(
  model: PlacementValidityModel,
  buildingType: string,
  point: MapPoint,
): string | null {
  const option = model.buildOptions?.find(
    (entry) => entry.buildingType === buildingType,
  );
  if (option !== undefined) {
    if (!option.unlocked) {
      return option.lockedReason ?? `Requires ${option.tier}.`;
    }
    if (option.affordable === false) {
      return option.lockedReason ?? "Not enough resources.";
    }
  }
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
  if (!onMap) return "Does not fit on the map there.";
  const fog = model.fog;
  if (
    fog !== undefined &&
    fog !== null &&
    !cells.every((cell) => isFogExplored(fog, cell))
  ) {
    return "Explore that ground before building there.";
  }
  if (model.buildings.some((building) => footprintGap(building, site) === 0)) {
    return "That ground is already taken.";
  }
  if (model.nodes.some((node) => footprintCovers(site, node.x, node.y))) {
    return "That ground is blocked by a resource node.";
  }
  // Vents are hazards and bridges are walkable: only impassable terrain
  // obstacles block building placement in the sim.
  const blockedByTerrain = model.terrain.some(
    (obstacle) =>
      obstacle.kind !== "bridge" &&
      cells.some((cell) => {
        const dx = cell.x - obstacle.x;
        const dy = cell.y - obstacle.y;
        return dx * dx + dy * dy <= obstacle.radius * obstacle.radius;
      }),
  );
  if (blockedByTerrain) return "That ground is blocked by terrain.";
  return null;
}

/**
 * Preview of the economy's placement checks: tier, cost, map bounds,
 * explored fog, other footprints, resource nodes, and impassable terrain.
 * @param model - Current shell model
 * @param buildingType - Building being placed
 * @param point - Cursor cell (already snapped by the caller or snapped here)
 * @returns True when placement is allowed
 */
export function placementGroundValid(
  model: PlacementValidityModel,
  buildingType: string,
  point: MapPoint,
): boolean {
  return placementBlockReason(model, buildingType, point) === null;
}
