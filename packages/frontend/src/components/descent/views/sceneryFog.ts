import { type FogOfWarState, isFogExplored } from "../logic/fog";
import type { AshenSceneryPlacement } from "./ashenTerrainLayout";
import { worldZToMapY } from "./mapOrientation";

/**
 * Lists the scenery the player may see. Scenery stands outside the playable
 * map and pokes up through the flat fog sheet, so each piece is hidden until
 * the map edge nearest any part of its footprint has been explored — the
 * same edge tiles the fog sheet stretches over the rim.
 * @param fog - Published fog, or null to reveal everything
 * @param placements - Scenery placements in world space
 * @param mapHeight - Playable map height, to turn world z into map y
 * @returns Ids of the placements to show
 */
export function revealedSceneryIds(
  fog: FogOfWarState | null,
  placements: readonly AshenSceneryPlacement[],
  mapHeight: number,
): Set<string> {
  const revealed = new Set<string>();
  for (const placement of placements) {
    if (isPlacementExplored(fog, placement, mapHeight)) {
      revealed.add(placement.id);
    }
  }
  return revealed;
}

/**
 * Samples the centre and the four corners of a placement's footprint.
 * @param fog - Published fog, or null
 * @param placement - Scenery placement in world space
 * @param mapHeight - Playable map height
 * @returns Whether any sampled point reads as explored
 */
function isPlacementExplored(
  fog: FogOfWarState | null,
  placement: AshenSceneryPlacement,
  mapHeight: number,
): boolean {
  const reach = placement.footprint / 2;
  const offsets = [
    [0, 0],
    [-reach, -reach],
    [-reach, reach],
    [reach, -reach],
    [reach, reach],
  ] as const;
  return offsets.some(([dx, dz]) =>
    isFogExplored(fog, {
      x: placement.x + dx,
      y: worldZToMapY(placement.z + dz, mapHeight),
    }),
  );
}
