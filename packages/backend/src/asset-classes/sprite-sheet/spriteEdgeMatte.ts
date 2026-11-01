/**
 * Soft matte for the silhouette of a sprite keyed off a flat background.
 * Background removal decides which pixels are background; this pass then
 * looks only at a thin band of opaque pixels along that boundary. Each band
 * pixel is treated as a blend of the character and the background: its alpha
 * is estimated from how far it sits from the background color, and its color
 * is unmixed so the edge keeps the character's color instead of a pale tint.
 */

import type { RgbaImage } from "./spriteFrameGeometry";

/** RGB triple, 0 to 255 per channel. */
export type Rgb = [number, number, number];

/**
 * How many pixels inward from the background the matte reaches. Image models
 * anti-alias a silhouette over one or two pixels; anything deeper is the
 * character's own painting, such as white cloth or a highlight.
 */
export const EDGE_BAND_PX = 2;

/** Estimated alpha below this clears the pixel; it is almost all background. */
export const MATTE_TRANSPARENT_ALPHA = 0.2;

/** Estimated alpha at or above this keeps the pixel untouched and opaque. */
export const MATTE_OPAQUE_ALPHA = 0.9;

/**
 * Smallest alpha byte a pixel needs to count as part of the character when
 * measuring frames. Matched to the matte's cut-off, so every pixel the matte
 * keeps is counted and only fainter input alpha is ignored.
 */
export const MIN_VISIBLE_ALPHA = Math.round(255 * MATTE_TRANSPARENT_ALPHA);

/**
 * A foreground color closer than this to the background gives no reliable
 * direction to unmix along, so only the color-to-alpha bound is used.
 */
const MIN_UNMIX_DISTANCE = 12;

/** Depth value for opaque pixels deeper than the band. */
const DEEP = EDGE_BAND_PX + 1;

/**
 * Softens the silhouette left by background removal.
 * Opaque pixels within `EDGE_BAND_PX` of a transparent pixel, and with a
 * deeper pixel next to them, get an estimated alpha and an unmixed color. The
 * matte grows inward only through pixels it softened, so a solid outline
 * shields any white highlight painted just behind it. One- and two-pixel
 * strokes have no deeper pixel; they keep their color, and are cleared only
 * when they are almost background, which also removes stray pale specks.
 * @param image - Pixels with the background already transparent; written in place
 * @param background - Detected background color
 */
export function softenEdges(image: RgbaImage, background: Rgb): void {
  const depth = measureEdgeDepth(image);
  const { bandByDepth, thinStrokeEdges } = classifyEdgePixels(image, depth);
  const foregroundSource = findForegroundSources(image, depth, bandByDepth);
  const softened = new Uint8Array(image.width * image.height);

  for (const index of thinStrokeEdges) {
    const color = readRgb(image.data, index);
    if (minimumAlpha(color, background) < MATTE_TRANSPARENT_ALPHA) {
      image.data[index * 4 + 3] = 0;
    }
  }

  bandByDepth.forEach((pixels, level) => {
    for (const index of pixels) {
      if (!isMatteReachable(image, depth, softened, index, level + 1)) {
        continue;
      }
      const source = foregroundSource[index] ?? -1;
      const foreground =
        source === -1 ? undefined : readRgb(image.data, source);
      const alpha = estimateEdgeAlpha(
        readRgb(image.data, index),
        background,
        foreground,
      );
      softened[index] = applyMatte(image.data, index, alpha, background)
        ? 1
        : 0;
    }
  });
}

/**
 * Estimates how much of a blended edge pixel is foreground.
 * The color-to-alpha bound is the least alpha that can explain the pixel as
 * any color mixed with the background. When a nearby foreground color is
 * known, the pixel is projected onto the line from the background to that
 * color, which also handles pale foreground colors the bound underrates.
 * @param color - Edge pixel color
 * @param background - Background color
 * @param foreground - Nearest solid character color, when one is known
 * @returns Alpha from 0 to 1
 */
export function estimateEdgeAlpha(
  color: Rgb,
  background: Rgb,
  foreground: Rgb | undefined,
): number {
  const bound = minimumAlpha(color, background);
  if (foreground === undefined) {
    return bound;
  }
  const direction = subtract(foreground, background);
  const lengthSquared = dot(direction, direction);
  if (lengthSquared < MIN_UNMIX_DISTANCE * MIN_UNMIX_DISTANCE) {
    return bound;
  }
  const projected = dot(subtract(color, background), direction) / lengthSquared;
  return clampUnit(Math.max(bound, projected));
}

/**
 * Color-to-alpha bound: for each channel, how far the pixel moved from the
 * background relative to how far it could have moved in that direction.
 * @param color - Pixel color
 * @param background - Background color
 * @returns The smallest alpha from 0 to 1 that keeps the unmixed color in range
 */
export function minimumAlpha(color: Rgb, background: Rgb): number {
  let alpha = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    alpha = Math.max(
      alpha,
      channelAlpha(color[channel] ?? 0, background[channel] ?? 0),
    );
  }
  return clampUnit(alpha);
}

/**
 * Removes the background's share from a blended pixel:
 * F = (C − (1 − α)·B) / α.
 * @param color - Blended pixel color
 * @param background - Background color
 * @param alpha - Foreground share, greater than 0
 * @returns The foreground color, rounded and clamped to 0..255
 */
export function unmixColor(color: Rgb, background: Rgb, alpha: number): Rgb {
  const unmix = (channel: number) =>
    clampByte(
      ((color[channel] ?? 0) - (1 - alpha) * (background[channel] ?? 0)) /
        alpha,
    );
  return [unmix(0), unmix(1), unmix(2)];
}

/**
 * @param x - Column
 * @param y - Row
 * @param width - Image width
 * @param height - Image height
 * @param includeDiagonals - Also return the four diagonal neighbors
 * @returns Indexes of the neighbors that lie inside the image
 */
export function neighborIndexes(
  x: number,
  y: number,
  width: number,
  height: number,
  includeDiagonals = false,
): number[] {
  const neighbors: number[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const isSelf = dx === 0 && dy === 0;
      const isDiagonal = dx !== 0 && dy !== 0;
      const nx = x + dx;
      const ny = y + dy;
      const inside = nx >= 0 && ny >= 0 && nx < width && ny < height;
      if (isSelf || !inside || (isDiagonal && !includeDiagonals)) {
        continue;
      }
      neighbors.push(ny * width + nx);
    }
  }
  return neighbors;
}

/**
 * Step distance of every opaque pixel from the nearest transparent pixel.
 * @param image - Pixels with the background already transparent
 * @returns 0 for transparent pixels, 1..`EDGE_BAND_PX` in the band, `DEEP` beyond it
 */
function measureEdgeDepth(image: RgbaImage): Uint8Array {
  const { height, width } = image;
  const depth = new Uint8Array(width * height);
  let frontier: number[] = [];
  for (let index = 0; index < depth.length; index += 1) {
    if (!isTransparent(image, index)) {
      depth[index] = DEEP;
    }
  }
  for (let index = 0; index < depth.length; index += 1) {
    if (depth[index] === 0) {
      continue;
    }
    const touchesTransparent = neighborsOf(index, width, height).some(
      (neighbor) => depth[neighbor] === 0,
    );
    if (touchesTransparent) {
      depth[index] = 1;
      frontier.push(index);
    }
  }

  for (let level = 2; level <= EDGE_BAND_PX; level += 1) {
    const next: number[] = [];
    for (const index of frontier) {
      for (const neighbor of neighborsOf(index, width, height)) {
        if (depth[neighbor] === DEEP) {
          depth[neighbor] = level;
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

interface EdgePixels {
  /** Band pixels grouped by depth; index 0 holds depth 1 */
  bandByDepth: number[][];
  /** Pixels on one- or two-pixel strokes that touch the background */
  thinStrokeEdges: number[];
}

/**
 * Splits shallow pixels into the matte band, which has a deeper pixel inside
 * it, and thin-stroke pixels, which do not.
 * @param image - Pixels with the background already transparent
 * @param depth - Output of `measureEdgeDepth`
 * @returns Band pixels by depth and thin-stroke pixels touching the background
 */
function classifyEdgePixels(image: RgbaImage, depth: Uint8Array): EdgePixels {
  const { height, width } = image;
  const bandByDepth: number[][] = Array.from(
    { length: EDGE_BAND_PX },
    () => [],
  );
  const thinStrokeEdges: number[] = [];
  for (let index = 0; index < depth.length; index += 1) {
    const level = depth[index] ?? 0;
    if (level === 0 || level === DEEP) {
      continue;
    }
    const hasDeeperNeighbor = neighborsOf(index, width, height, true).some(
      (neighbor) => (depth[neighbor] ?? 0) > level,
    );
    if (hasDeeperNeighbor) {
      bandByDepth[level - 1]?.push(index);
      continue;
    }
    if (level === 1) {
      thinStrokeEdges.push(index);
    }
  }
  return { bandByDepth, thinStrokeEdges };
}

/**
 * Gives each band pixel the nearest solid pixel to unmix toward. Solid pixels
 * are every opaque pixel outside the band; the search walks through band
 * pixels only.
 * @param image - Pixels with the background already transparent
 * @param depth - Output of `measureEdgeDepth`
 * @param bandByDepth - Band pixels grouped by depth
 * @returns For each pixel, the index of its solid source, or -1
 */
function findForegroundSources(
  image: RgbaImage,
  depth: Uint8Array,
  bandByDepth: readonly number[][],
): Int32Array {
  const { height, width } = image;
  const inBand = new Uint8Array(depth.length);
  for (const index of bandByDepth.flat()) {
    inBand[index] = 1;
  }
  const source = new Int32Array(depth.length).fill(-1);
  let frontier: number[] = [];
  for (const index of bandByDepth.flat()) {
    const solid = neighborsOf(index, width, height, true).find(
      (neighbor) => depth[neighbor] !== 0 && inBand[neighbor] === 0,
    );
    if (solid !== undefined) {
      source[index] = solid;
      frontier.push(index);
    }
  }

  while (frontier.length > 0) {
    const next: number[] = [];
    for (const index of frontier) {
      for (const neighbor of neighborsOf(index, width, height, true)) {
        if (inBand[neighbor] === 1 && source[neighbor] === -1) {
          source[neighbor] = source[index] ?? -1;
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return source;
}

/**
 * The matte reaches a pixel only from the background or through a pixel it
 * already softened, so a solid outline stops it.
 * @param image - Pixels being matted
 * @param depth - Output of `measureEdgeDepth`
 * @param softened - 1 where the matte lowered alpha
 * @param index - Pixel to test
 * @param level - The pixel's depth
 * @returns Whether the pixel may be matted
 */
function isMatteReachable(
  image: RgbaImage,
  depth: Uint8Array,
  softened: Uint8Array,
  index: number,
  level: number,
): boolean {
  if (level === 1) {
    return true;
  }
  return neighborsOf(index, image.width, image.height).some(
    (neighbor) => depth[neighbor] === level - 1 && softened[neighbor] === 1,
  );
}

/**
 * Writes the matte result for one pixel.
 * @param data - RGBA bytes; written in place
 * @param index - Pixel index
 * @param alpha - Estimated foreground share
 * @param background - Background color
 * @returns Whether the pixel lost any opacity
 */
function applyMatte(
  data: Uint8Array,
  index: number,
  alpha: number,
  background: Rgb,
): boolean {
  if (alpha >= MATTE_OPAQUE_ALPHA) {
    return false;
  }
  if (alpha < MATTE_TRANSPARENT_ALPHA) {
    data[index * 4 + 3] = 0;
    return true;
  }
  data.set(
    [
      ...unmixColor(readRgb(data, index), background, alpha),
      clampByte(alpha * 255),
    ],
    index * 4,
  );
  return true;
}

/**
 * @param value - Channel value
 * @param background - Background channel value
 * @returns How far `value` moved from `background`, as a share of the room in that direction
 */
function channelAlpha(value: number, background: number): number {
  if (value < background) {
    return (background - value) / background;
  }
  if (value > background) {
    return (value - background) / (255 - background);
  }
  return 0;
}

/**
 * @param index - Pixel index
 * @param width - Image width
 * @param height - Image height
 * @param includeDiagonals - Also return diagonal neighbors
 * @returns Neighbor indexes inside the image
 */
function neighborsOf(
  index: number,
  width: number,
  height: number,
  includeDiagonals = false,
): number[] {
  return neighborIndexes(
    index % width,
    Math.floor(index / width),
    width,
    height,
    includeDiagonals,
  );
}

/**
 * @param image - Pixels
 * @param index - Pixel index
 * @returns Whether the pixel is fully transparent
 */
function isTransparent(image: RgbaImage, index: number): boolean {
  return (image.data[index * 4 + 3] ?? 0) === 0;
}

/**
 * @param data - RGBA bytes
 * @param index - Pixel index
 * @returns The pixel's RGB
 */
function readRgb(data: Uint8Array, index: number): Rgb {
  const offset = index * 4;
  return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
}

/**
 * @param left - Minuend
 * @param right - Subtrahend
 * @returns Per-channel difference
 */
function subtract(left: Rgb, right: Rgb): Rgb {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

/**
 * @param left - First vector
 * @param right - Second vector
 * @returns Dot product
 */
function dot(left: Rgb, right: Rgb): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

/**
 * @param value - Number to limit
 * @returns `value` within 0..1
 */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * @param value - Channel value
 * @returns `value` rounded and limited to 0..255
 */
function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}
