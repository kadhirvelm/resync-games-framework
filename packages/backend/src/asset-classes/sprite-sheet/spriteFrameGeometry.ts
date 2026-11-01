/**
 * Pixel math for turning a painted sprite sheet into normalized frames.
 * Every function works on raw RGBA bytes, so it can be tested without sharp.
 * The steps follow the normalization pass from the ai-game-spritesheets
 * pipeline: remove the background, recover frames from where the character
 * actually is, measure each frame, then lock scale and foot baseline.
 */

/** Raw RGBA pixels, four bytes per pixel, row by row. */
export interface RgbaImage {
  data: Uint8Array;
  height: number;
  width: number;
}

/** A rectangle inside an image. `right` and `bottom` are exclusive. */
export interface PixelRegion {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Where the visible character sits inside one frame region. */
export interface FrameMeasurement {
  /** Horizontal center of the feet, used as the frame's anchor */
  anchorX: number;
  /** Tight bounds of the opaque pixels, in sheet coordinates */
  bounds: PixelRegion;
}

/** How one recovered frame is scaled and placed on the shared frame canvas. */
export interface FramePlacement {
  /** Opaque bounds to copy from the sheet */
  source: PixelRegion;
  /** Left edge on the frame canvas after scaling */
  targetLeft: number;
  /** Top edge on the frame canvas after scaling */
  targetTop: number;
  /** Scaled height of `source` */
  targetHeight: number;
  /** Scaled width of `source` */
  targetWidth: number;
}

/** Frame canvas shared by every animation, and each frame's placement on it. */
export interface NormalizedFramePlan {
  /** Per animation, per frame. `undefined` marks an empty frame. */
  animations: (FramePlacement | undefined)[][];
  frameHeight: number;
  frameWidth: number;
}

/** Color distance below which a pixel counts as background. */
export const BACKGROUND_TOLERANCE = 48;

/**
 * Distance an enclosed area must stay within to count as background. The
 * painted background is flat; shaded white cloth spreads much wider.
 */
const ENCLOSED_BACKGROUND_TOLERANCE = 12;

/** Looser distance for pale edge pixels left between the outline and the background. */
const FRINGE_TOLERANCE = 96;

/** Rows or columns with this many opaque pixels or fewer count as empty. */
const PROFILE_NOISE_PIXELS = 2;

/** Fraction of the bounds height, from the feet up, used to find the feet center. */
const FOOT_BAND_FRACTION = 0.2;

/** Animation scale is kept within this range so a crouch or raised weapon is not undone. */
const SCALE_LIMITS = { max: 1.25, min: 0.8 } as const;

/** Transparent margin around the widest and tallest frame. */
const FRAME_PADDING_PX = 8;

/** A recovered frame or row may differ from the nominal grid by this factor. */
const SPLIT_SIZE_LIMITS = { max: 1.6, min: 0.5 } as const;

/**
 * Makes the flat background transparent.
 * Background-colored pixels connected to the image edge are removed. Enclosed
 * areas are removed only when they are flat background color and at least
 * `minEnclosedArea` pixels big, such as the gap between an arm and the body.
 * Painted white cloth and highlights are shaded, so they stay. A final pass
 * clears pale fringe pixels that touch the removed background.
 * @param image - Sheet pixels; alpha is written in place
 * @param minEnclosedArea - Smallest enclosed flat region removed as background
 * @returns The detected background color
 */
export function removeBackground(
  image: RgbaImage,
  minEnclosedArea: number,
): [number, number, number] {
  const background = detectBackgroundColor(image);
  const near = maskByDistance(image, background, BACKGROUND_TOLERANCE);
  forEachComponent(image, near, (component) => {
    if (component.touchesEdge) {
      clearPixels(image, component.pixels);
    }
  });

  const flat = maskByDistance(image, background, ENCLOSED_BACKGROUND_TOLERANCE);
  forEachComponent(image, flat, (component) => {
    if (component.pixels.length >= minEnclosedArea) {
      clearPixels(image, component.pixels);
    }
  });

  clearFringe(image, background);
  return background;
}

/**
 * @param image - Sheet pixels
 * @param color - Background color
 * @param tolerance - Largest RGB distance that counts as a match
 * @returns 1 for each still-opaque pixel within `tolerance` of `color`
 */
function maskByDistance(
  image: RgbaImage,
  color: [number, number, number],
  tolerance: number,
): Uint8Array {
  const pixelCount = image.width * image.height;
  const mask = new Uint8Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const opaque = (image.data[index * 4 + 3] ?? 0) > 0;
    if (opaque && colorDistance(image.data, index, color) <= tolerance) {
      mask[index] = 1;
    }
  }
  return mask;
}

/**
 * Visits every 4-connected region of masked pixels once.
 * @param image - Sheet pixels
 * @param mask - 1 where a pixel belongs to some region
 * @param visit - Called with each region
 */
function forEachComponent(
  image: RgbaImage,
  mask: Uint8Array,
  visit: (component: BackgroundComponent) => void,
): void {
  const visited = new Uint8Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) {
      continue;
    }
    visit(collectComponent(image, mask, visited, start));
  }
}

/**
 * @param image - Sheet pixels; alpha is written in place
 * @param pixels - Pixel indexes to make transparent
 */
function clearPixels(image: RgbaImage, pixels: readonly number[]): void {
  for (const index of pixels) {
    image.data[index * 4 + 3] = 0;
  }
}

/**
 * Splits a sheet axis into `expected` spans using the empty gaps between
 * opaque pixels. When the gaps do not give a believable split, returns the
 * nominal even grid instead, as the pipeline recommends measuring before
 * trusting the grid.
 * @param profile - Opaque pixel count for each row or column
 * @param expected - Number of rows or frames on this axis
 * @returns `expected + 1` boundaries from 0 to `profile.length`
 */
export function splitAxis(
  profile: readonly number[],
  expected: number,
): number[] {
  return (
    findGapSplits(profile, expected) ?? nominalSplits(profile.length, expected)
  );
}

/**
 * @param length - Pixels on the axis
 * @param count - Number of equal spans
 * @returns `count + 1` evenly spaced boundaries
 */
export function nominalSplits(length: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) =>
    Math.round((index * length) / count),
  );
}

/**
 * Splits an axis at the midpoints of the gaps between opaque runs.
 * Runs separated by the smallest gaps are merged until `expected` remain, so a
 * detached spark joins its frame instead of becoming one.
 * @param profile - Opaque pixel count for each row or column
 * @param expected - Number of spans wanted
 * @returns Boundaries, or undefined when the gaps cannot give `expected` believable spans
 */
export function findGapSplits(
  profile: readonly number[],
  expected: number,
): number[] | undefined {
  const runs = findOpaqueRuns(profile);
  while (runs.length > expected) {
    mergeClosestRuns(runs);
  }
  if (runs.length < expected) {
    return undefined;
  }

  const boundaries = [0];
  for (let index = 1; index < runs.length; index += 1) {
    const previousEnd = runs[index - 1]?.end ?? 0;
    const nextStart = runs[index]?.start ?? 0;
    boundaries.push(Math.round((previousEnd + nextStart) / 2));
  }
  boundaries.push(profile.length);

  const nominal = profile.length / expected;
  const believable = boundaries.slice(1).every((boundary, index) => {
    const size = boundary - (boundaries[index] ?? 0);
    return (
      size >= nominal * SPLIT_SIZE_LIMITS.min &&
      size <= nominal * SPLIT_SIZE_LIMITS.max
    );
  });
  return believable ? boundaries : undefined;
}

/**
 * @param image - Sheet with background already transparent
 * @param region - Area to count
 * @returns Opaque pixel count for each row of the region
 */
export function rowProfile(image: RgbaImage, region: PixelRegion): number[] {
  const profile: number[] = [];
  for (let y = region.top; y < region.bottom; y += 1) {
    let count = 0;
    for (let x = region.left; x < region.right; x += 1) {
      count += isOpaque(image, x, y) ? 1 : 0;
    }
    profile.push(count);
  }
  return profile;
}

/**
 * @param image - Sheet with background already transparent
 * @param region - Area to count
 * @returns Opaque pixel count for each column of the region
 */
export function columnProfile(image: RgbaImage, region: PixelRegion): number[] {
  const profile: number[] = [];
  for (let x = region.left; x < region.right; x += 1) {
    let count = 0;
    for (let y = region.top; y < region.bottom; y += 1) {
      count += isOpaque(image, x, y) ? 1 : 0;
    }
    profile.push(count);
  }
  return profile;
}

/**
 * Finds the character inside one recovered frame.
 * @param image - Sheet with background already transparent
 * @param region - The frame's cell on the sheet
 * @returns Opaque bounds and feet center, or undefined for an empty cell
 */
export function measureFrame(
  image: RgbaImage,
  region: PixelRegion,
): FrameMeasurement | undefined {
  const rows = rowProfile(image, region);
  const columns = columnProfile(image, region);
  const top = rows.findIndex((count) => count > PROFILE_NOISE_PIXELS);
  const left = columns.findIndex((count) => count > PROFILE_NOISE_PIXELS);
  if (top === -1 || left === -1) {
    return undefined;
  }
  const bottom = findLastIndex(rows, (count) => count > PROFILE_NOISE_PIXELS);
  const right = findLastIndex(columns, (count) => count > PROFILE_NOISE_PIXELS);
  const bounds: PixelRegion = {
    bottom: region.top + bottom + 1,
    left: region.left + left,
    right: region.left + right + 1,
    top: region.top + top,
  };
  return { anchorX: footCenter(image, bounds), bounds };
}

/**
 * Plans one shared frame canvas for every animation.
 * Each animation gets one scale that brings its median height to the first
 * animation's median height, clamped so intended crouches and raised weapons
 * remain. Every frame is placed with its feet center on the canvas center and
 * its lowest pixel on the same baseline.
 * @param animations - Measurements per animation; the first is the reference, usually idle
 * @returns Frame size and the placement of every frame
 * @throws Error when an animation has no visible frames
 */
export function planNormalizedFrames(
  animations: readonly (FrameMeasurement | undefined)[][],
): NormalizedFramePlan {
  const referenceHeight = medianHeight(animations[0] ?? []);
  const scaled = animations.map((frames) => {
    const scale = clamp(
      referenceHeight / medianHeight(frames),
      SCALE_LIMITS.min,
      SCALE_LIMITS.max,
    );
    return frames.map((frame) =>
      frame === undefined ? undefined : scaleFrame(frame, scale),
    );
  });

  const visible = scaled.flat().filter((frame) => frame !== undefined);
  const halfWidth = Math.max(
    ...visible.map((frame) =>
      Math.max(frame.leftOfAnchor, frame.rightOfAnchor),
    ),
  );
  const tallest = Math.max(...visible.map((frame) => frame.height));
  const frameWidth = roundUpToEven(
    Math.ceil(halfWidth) * 2 + FRAME_PADDING_PX * 2,
  );
  const frameHeight = roundUpToEven(tallest + FRAME_PADDING_PX * 2);
  const baseline = frameHeight - FRAME_PADDING_PX;

  return {
    animations: scaled.map((frames) =>
      frames.map((frame) =>
        frame === undefined
          ? undefined
          : {
              source: frame.source,
              targetHeight: frame.height,
              targetLeft: Math.round(frameWidth / 2 - frame.leftOfAnchor),
              targetTop: baseline - frame.height,
              targetWidth: frame.width,
            },
      ),
    ),
    frameHeight,
    frameWidth,
  };
}

interface ScaledFrame {
  height: number;
  leftOfAnchor: number;
  rightOfAnchor: number;
  source: PixelRegion;
  width: number;
}

/**
 * @param frame - Measured frame
 * @param scale - Animation scale
 * @returns Scaled size and distances from the feet center
 */
function scaleFrame(frame: FrameMeasurement, scale: number): ScaledFrame {
  const { bounds } = frame;
  const width = Math.max(1, Math.round((bounds.right - bounds.left) * scale));
  const height = Math.max(1, Math.round((bounds.bottom - bounds.top) * scale));
  const leftOfAnchor = (frame.anchorX - bounds.left) * scale;
  return {
    height,
    leftOfAnchor,
    rightOfAnchor: width - leftOfAnchor,
    source: bounds,
    width,
  };
}

/**
 * @param frames - Measurements for one animation
 * @returns Median opaque height
 * @throws Error when every frame is empty
 */
function medianHeight(
  frames: readonly (FrameMeasurement | undefined)[],
): number {
  const heights = frames
    .filter((frame) => frame !== undefined)
    .map((frame) => frame.bounds.bottom - frame.bounds.top)
    .sort((left, right) => left - right);
  if (heights.length === 0) {
    throw new Error("A sprite animation row has no visible frames.");
  }
  return heights[Math.floor(heights.length / 2)] ?? 1;
}

/**
 * Averages the x position of opaque pixels in the lowest band of the bounds.
 * Feet stay put while attack effects and swinging arms move, so this is a
 * steadier anchor than the bounds center.
 * @param image - Sheet with background already transparent
 * @param bounds - Opaque bounds of one frame
 * @returns Feet center x in sheet coordinates
 */
function footCenter(image: RgbaImage, bounds: PixelRegion): number {
  const bandHeight = Math.max(
    1,
    Math.round((bounds.bottom - bounds.top) * FOOT_BAND_FRACTION),
  );
  let sum = 0;
  let count = 0;
  for (let y = bounds.bottom - bandHeight; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (isOpaque(image, x, y)) {
        sum += x;
        count += 1;
      }
    }
  }
  return count === 0 ? (bounds.left + bounds.right) / 2 : sum / count + 0.5;
}

interface OpaqueRun {
  end: number;
  start: number;
}

/**
 * @param profile - Opaque pixel counts along an axis
 * @returns Runs of non-empty rows or columns; `end` is exclusive
 */
function findOpaqueRuns(profile: readonly number[]): OpaqueRun[] {
  const runs: OpaqueRun[] = [];
  let start: number | undefined;
  profile.forEach((count, index) => {
    const filled = count > PROFILE_NOISE_PIXELS;
    if (filled && start === undefined) {
      start = index;
    }
    if (!filled && start !== undefined) {
      runs.push({ end: index, start });
      start = undefined;
    }
  });
  if (start !== undefined) {
    runs.push({ end: profile.length, start });
  }
  return runs;
}

/**
 * Merges the two neighboring runs separated by the smallest gap.
 * @param runs - Runs in axis order; changed in place
 */
function mergeClosestRuns(runs: OpaqueRun[]): void {
  let closest = 1;
  let smallestGap = Number.POSITIVE_INFINITY;
  for (let index = 1; index < runs.length; index += 1) {
    const gap = (runs[index]?.start ?? 0) - (runs[index - 1]?.end ?? 0);
    if (gap < smallestGap) {
      smallestGap = gap;
      closest = index;
    }
  }
  const previous = runs[closest - 1];
  const next = runs[closest];
  if (previous === undefined || next === undefined) {
    return;
  }
  runs.splice(closest - 1, 2, { end: next.end, start: previous.start });
}

interface BackgroundComponent {
  pixels: number[];
  touchesEdge: boolean;
}

/**
 * Collects one 4-connected region of background-colored pixels.
 * @param image - Sheet pixels
 * @param isBackground - 1 where the pixel matches the background color
 * @param visited - Pixels already assigned to a region; updated in place
 * @param start - First pixel index
 * @returns The region's pixels and whether it reaches the image edge
 */
function collectComponent(
  image: RgbaImage,
  isBackground: Uint8Array,
  visited: Uint8Array,
  start: number,
): BackgroundComponent {
  const { height, width } = image;
  const pixels: number[] = [];
  const stack = [start];
  visited[start] = 1;
  let touchesEdge = false;

  while (stack.length > 0) {
    const index = stack.pop() ?? 0;
    pixels.push(index);
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      touchesEdge = true;
    }
    for (const neighbor of neighborIndexes(x, y, width, height)) {
      if (isBackground[neighbor] === 1 && visited[neighbor] === 0) {
        visited[neighbor] = 1;
        stack.push(neighbor);
      }
    }
  }

  return { pixels, touchesEdge };
}

/**
 * Clears opaque pixels that touch the removed background and are close to its
 * color: the pale halo an anti-aliased outline leaves behind.
 * @param image - Sheet pixels; alpha is written in place
 * @param background - Detected background color
 */
function clearFringe(
  image: RgbaImage,
  background: [number, number, number],
): void {
  const { height, width } = image;
  const fringe: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (image.data[index * 4 + 3] === 0) {
        continue;
      }
      if (colorDistance(image.data, index, background) > FRINGE_TOLERANCE) {
        continue;
      }
      const touchesBackground = neighborIndexes(x, y, width, height).some(
        (neighbor) => image.data[neighbor * 4 + 3] === 0,
      );
      if (touchesBackground) {
        fringe.push(index);
      }
    }
  }
  for (const index of fringe) {
    image.data[index * 4 + 3] = 0;
  }
}

/**
 * The background is the per-channel median of the outermost pixels, which the
 * prompt keeps clear of the character.
 * @param image - Sheet pixels
 * @returns Background RGB
 */
function detectBackgroundColor(image: RgbaImage): [number, number, number] {
  const channels: [number[], number[], number[]] = [[], [], []];
  const { height, width } = image;
  const addPixel = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    channels[0].push(image.data[offset] ?? 0);
    channels[1].push(image.data[offset + 1] ?? 0);
    channels[2].push(image.data[offset + 2] ?? 0);
  };
  for (let x = 0; x < width; x += 1) {
    addPixel(x, 0);
    addPixel(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addPixel(0, y);
    addPixel(width - 1, y);
  }
  const median = (values: number[]) =>
    values.sort((left, right) => left - right)[Math.floor(values.length / 2)] ??
    255;
  return [median(channels[0]), median(channels[1]), median(channels[2])];
}

/**
 * @param data - RGBA bytes
 * @param index - Pixel index
 * @param color - RGB to compare against
 * @returns Euclidean RGB distance
 */
function colorDistance(
  data: Uint8Array,
  index: number,
  color: [number, number, number],
): number {
  const offset = index * 4;
  const red = (data[offset] ?? 0) - color[0];
  const green = (data[offset + 1] ?? 0) - color[1];
  const blue = (data[offset + 2] ?? 0) - color[2];
  return Math.sqrt(red * red + green * green + blue * blue);
}

/**
 * @param x - Column
 * @param y - Row
 * @param width - Image width
 * @param height - Image height
 * @returns Indexes of the up, down, left, and right neighbors inside the image
 */
function neighborIndexes(
  x: number,
  y: number,
  width: number,
  height: number,
): number[] {
  const neighbors: number[] = [];
  if (x > 0) {
    neighbors.push(y * width + x - 1);
  }
  if (x < width - 1) {
    neighbors.push(y * width + x + 1);
  }
  if (y > 0) {
    neighbors.push((y - 1) * width + x);
  }
  if (y < height - 1) {
    neighbors.push((y + 1) * width + x);
  }
  return neighbors;
}

/**
 * @param image - Sheet pixels
 * @param x - Column
 * @param y - Row
 * @returns Whether the pixel survived background removal
 */
function isOpaque(image: RgbaImage, x: number, y: number): boolean {
  return (image.data[(y * image.width + x) * 4 + 3] ?? 0) > 0;
}

/**
 * @param values - Array to search
 * @param predicate - Match test
 * @returns Last matching index, or -1
 */
function findLastIndex<Value>(
  values: readonly Value[],
  predicate: (value: Value) => boolean,
): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && predicate(value)) {
      return index;
    }
  }
  return -1;
}

/**
 * @param value - Number to limit
 * @param min - Lower bound
 * @param max - Upper bound
 * @returns `value` inside the bounds
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param value - Pixel size
 * @returns The next even integer at or above `value`
 */
function roundUpToEven(value: number): number {
  const rounded = Math.ceil(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}
