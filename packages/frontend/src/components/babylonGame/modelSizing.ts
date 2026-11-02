import type { ThreeDAsset } from "@resync-game-framework/api";

const MIN_PLAUSIBLE_RIGGED_CHARACTER_HEIGHT = 0.25;
const STANDARD_RIGGED_CHARACTER_HEIGHT = 1.75;

/**
 * Returns a model's usable authored height in meters.
 * @param asset - Validated 3D asset metadata
 * @returns A stable height that compensates for centimeter-authored skin bounds
 */
export function getModelHeight(asset: ThreeDAsset): number {
  const { min, max } = asset.validation.bounds;
  const measuredHeight = Math.max(0.01, (max[1] ?? 1) - (min[1] ?? 0));
  const hasCompressedRigBounds =
    asset.kind === "character" &&
    asset.validation.skins > 0 &&
    measuredHeight < MIN_PLAUSIBLE_RIGGED_CHARACTER_HEIGHT;
  return hasCompressedRigBounds
    ? STANDARD_RIGGED_CHARACTER_HEIGHT
    : measuredHeight;
}

/**
 * Calculates a character scale from a desired world-space height.
 * @param asset - Character asset to size
 * @param targetHeight - Desired character height in meters
 * @returns Uniform scale for the model root
 */
export function getCharacterModelScale(
  asset: ThreeDAsset,
  targetHeight: number,
): number {
  return targetHeight / getModelHeight(asset);
}
