/**
 * Thin ink line drawn around every unit and building. Dark rather than
 * light, so the figure keeps its own colors and simply gains a crisp edge
 * against the dimmed ground.
 */
export const SILHOUETTE_OUTLINE_COLOR = "#0b0705";

/** Faction ring painted into the dark foot marker under each unit. */
export const UNIT_MARKER_RING = {
  hold: "#e8bf6a",
  horde: "#e0523c",
} as const;

/** Outline thickness in screen pixels at the current zoom. */
const OUTLINE_PIXELS = 1.6;

/** Largest world-space outline, so a fully zoomed-out figure does not grow a shell. */
const MAX_OUTLINE_WIDTH = 0.1;

/** Smallest world-space outline, so a close camera still keeps an edge. */
const MIN_OUTLINE_WIDTH = 0.012;

/**
 * World-space outline width that stays about {@link OUTLINE_PIXELS} thick
 * as the RTS camera zooms.
 * @param radius - Camera distance from its target
 * @param viewHeight - Render height in pixels
 * @param fov - Vertical field of view in radians
 * @returns Outline width in world units
 */
export function unitOutlineWidth(
  radius: number,
  viewHeight: number,
  fov: number,
): number {
  const span = 2 * Math.max(0.01, radius) * Math.tan(Math.max(0.01, fov) / 2);
  const worldPerPixel = span / Math.max(1, viewHeight);
  return Math.min(
    MAX_OUTLINE_WIDTH,
    Math.max(MIN_OUTLINE_WIDTH, worldPerPixel * OUTLINE_PIXELS),
  );
}

/**
 * Width of the dark foot marker under one figure.
 * @param role - Generated character role
 * @returns Diameter in world units
 */
export function unitMarkerDiameter(role: string): number {
  if (role === "cinderjaw") return 2.35;
  return 1.55;
}

/**
 * Selection ring diameter, just outside the foot marker.
 * @param role - Generated character role
 * @returns Diameter in world units
 */
export function selectionRingDiameter(role: string): number {
  return unitMarkerDiameter(role) + 0.24;
}
