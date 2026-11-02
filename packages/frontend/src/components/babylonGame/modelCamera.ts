/** Supported explicit camera zoom actions in a standalone model preview. */
export type ModelCameraZoomDirection = "in" | "out";

export const MODEL_CAMERA_MIN_RADIUS = 2;
export const MODEL_CAMERA_MAX_RADIUS = 60;

/** Restricts an orbit-camera radius to the safe interactive range. */
export function clampModelCameraRadius(radius: number): number {
  return Math.max(
    MODEL_CAMERA_MIN_RADIUS,
    Math.min(MODEL_CAMERA_MAX_RADIUS, radius),
  );
}

/**
 * Calculates the next orbit radius for an explicit zoom action.
 * @param radius - Current distance from the camera target
 * @param direction - Whether the user wants a closer or wider view
 * @returns A bounded camera radius
 */
export function zoomModelCameraRadius(
  radius: number,
  direction: ModelCameraZoomDirection,
): number {
  return clampModelCameraRadius(radius * (direction === "out" ? 1.5 : 2 / 3));
}

/**
 * Calculates a padded radius that keeps one model comfortably in frame.
 * @param diagonal - Length of the model's world-space bounding-box diagonal
 * @param minimumRadius - Smallest comfortable radius for this model category
 * @returns A bounded radius with extra breathing room for model previews
 */
export function fitModelCameraRadius(
  diagonal: number,
  minimumRadius = 4,
): number {
  return clampModelCameraRadius(Math.max(minimumRadius, diagonal * 1.75));
}
