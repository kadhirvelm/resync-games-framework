/**
 * Converts top-origin map y into Babylon's ground-plane z axis. The reflection
 * keeps north at the top of both the 3D battlefield and the DOM/minimap views.
 * @param mapY - Vertical map coordinate, increasing toward the map bottom
 * @param mapHeight - Full playable map height
 * @returns Babylon world z for the same location
 */
export function mapYToWorldZ(mapY: number, mapHeight: number): number {
  return mapHeight - mapY;
}

/**
 * Converts Babylon ground-plane z back into top-origin map y.
 * @param worldZ - Babylon ground-plane coordinate
 * @param mapHeight - Full playable map height
 * @returns Vertical map coordinate for simulation and UI commands
 */
export function worldZToMapY(worldZ: number, mapHeight: number): number {
  return mapHeight - worldZ;
}

/**
 * Reflects a Babylon camera heading into the minimap's top-origin coordinate
 * system. The opening camera remains at zero rotation while later turns match
 * their visible clockwise direction.
 * @param alpha - ArcRotateCamera longitudinal angle in radians
 * @returns CSS rotation for the minimap camera footprint
 */
export function cameraAlphaToMinimapRotation(alpha: number): number {
  return -(alpha + Math.PI / 2);
}
