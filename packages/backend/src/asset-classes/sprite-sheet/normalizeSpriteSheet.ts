import sharp from "sharp";
import {
  columnProfile,
  type FrameMeasurement,
  type FramePlacement,
  measureFrame,
  type PixelRegion,
  planNormalizedFrames,
  type RgbaImage,
  removeBackground,
  rowProfile,
  splitAxis,
} from "./spriteFrameGeometry";

/**
 * Enclosed background areas this big, as a fraction of one cell, are removed
 * as background; smaller ones are kept as highlights.
 */
const ENCLOSED_BACKGROUND_CELL_FRACTION = 0.01;

/** One normalized animation strip. */
export interface NormalizedSpriteAnimation {
  /** Frames that had no visible character and were left transparent */
  emptyFrames: number;
  frameCount: number;
  /** Transparent PNG with every frame side by side */
  strip: Buffer;
}

/** Every animation from one sheet, on one shared frame size. */
export interface NormalizedSpriteSheet {
  animations: NormalizedSpriteAnimation[];
  frameHeight: number;
  frameWidth: number;
}

/**
 * Splits a painted sheet into animation strips with a stable frame canvas.
 * Rows and frames are recovered from the gaps in the character mask, falling
 * back to the even grid. Each frame keeps its feet center and baseline fixed.
 * @param source - Sheet path or bytes
 * @param layout - Rows (one per animation) and frames per row
 * @returns One transparent PNG strip per row, in row order
 * @throws Error when a row has no visible frames
 */
export async function normalizeSpriteSheet(
  source: Buffer | string,
  layout: { columns: number; rows: number },
): Promise<NormalizedSpriteSheet> {
  const image = await readRgba(source);
  const cellArea =
    (image.width / layout.columns) * (image.height / layout.rows);
  removeBackground(
    image,
    Math.round(cellArea * ENCLOSED_BACKGROUND_CELL_FRACTION),
  );

  const cells = recoverCells(image, layout);
  const measurements = cells.map((row) =>
    row.map((cell) => measureFrame(image, cell)),
  );
  const plan = planNormalizedFrames(measurements);

  const animations = await Promise.all(
    plan.animations.map(async (placements, rowIndex) => ({
      emptyFrames: countEmpty(measurements[rowIndex] ?? []),
      frameCount: placements.length,
      strip: await renderStrip(image, placements, plan),
    })),
  );
  return {
    animations,
    frameHeight: plan.frameHeight,
    frameWidth: plan.frameWidth,
  };
}

/**
 * Removes the background from one standalone frame, such as the identity anchor.
 * @param source - Image path or bytes
 * @returns Transparent PNG trimmed to the character with a small margin
 */
export async function removeSpriteBackground(
  source: Buffer | string,
): Promise<Buffer> {
  const image = await readRgba(source);
  removeBackground(
    image,
    Math.round(image.width * image.height * ENCLOSED_BACKGROUND_CELL_FRACTION),
  );
  const whole: PixelRegion = {
    bottom: image.height,
    left: 0,
    right: image.width,
    top: 0,
  };
  const measured = measureFrame(image, whole);
  const png = rawSharp(image);
  if (measured === undefined) {
    return png.png().toBuffer();
  }
  return png.extract(toExtractRegion(measured.bounds)).png().toBuffer();
}

/**
 * Finds every frame cell: rows across the whole sheet, then frames inside each row.
 * @param image - Sheet with background removed
 * @param layout - Expected rows and frames per row
 * @returns Cells by row, then by frame
 */
function recoverCells(
  image: RgbaImage,
  layout: { columns: number; rows: number },
): PixelRegion[][] {
  const whole: PixelRegion = {
    bottom: image.height,
    left: 0,
    right: image.width,
    top: 0,
  };
  const rowBounds = splitAxis(rowProfile(image, whole), layout.rows);
  return pairs(rowBounds).map(([top, bottom]) => {
    const band: PixelRegion = { bottom, left: 0, right: image.width, top };
    const columnBounds = splitAxis(columnProfile(image, band), layout.columns);
    return pairs(columnBounds).map(([left, right]) => ({
      bottom,
      left,
      right,
      top,
    }));
  });
}

/**
 * Draws one animation's frames side by side on a transparent strip.
 * @param image - Sheet with background removed
 * @param placements - Planned placement for each frame
 * @param plan - Shared frame size
 * @returns PNG bytes
 */
async function renderStrip(
  image: RgbaImage,
  placements: readonly (FramePlacement | undefined)[],
  plan: { frameHeight: number; frameWidth: number },
): Promise<Buffer> {
  const stripWidth = plan.frameWidth * placements.length;
  const strip = new Uint8Array(stripWidth * plan.frameHeight * 4);

  for (const [frameIndex, placement] of placements.entries()) {
    if (placement === undefined) {
      continue;
    }
    const frame = await rawSharp(image)
      .extract(toExtractRegion(placement.source))
      .resize(placement.targetWidth, placement.targetHeight, {
        fit: "fill",
        kernel: "nearest",
      })
      .raw()
      .toBuffer();
    blit(
      {
        data: new Uint8Array(frame),
        height: placement.targetHeight,
        width: placement.targetWidth,
      },
      { data: strip, height: plan.frameHeight, width: stripWidth },
      frameIndex * plan.frameWidth + placement.targetLeft,
      placement.targetTop,
      {
        left: frameIndex * plan.frameWidth,
        right: (frameIndex + 1) * plan.frameWidth,
      },
    );
  }

  return rawSharp({ data: strip, height: plan.frameHeight, width: stripWidth })
    .png()
    .toBuffer();
}

/**
 * Copies opaque pixels from one image onto another, clipped to a column range.
 * @param from - Source pixels
 * @param to - Destination pixels; written in place
 * @param left - Destination x of the source's left edge
 * @param top - Destination y of the source's top edge
 * @param clip - Destination columns the copy may write to
 */
function blit(
  from: RgbaImage,
  to: RgbaImage,
  left: number,
  top: number,
  clip: { left: number; right: number },
): void {
  for (let y = 0; y < from.height; y += 1) {
    const targetY = top + y;
    if (targetY < 0 || targetY >= to.height) {
      continue;
    }
    for (let x = 0; x < from.width; x += 1) {
      const targetX = left + x;
      if (targetX < clip.left || targetX >= clip.right) {
        continue;
      }
      const sourceOffset = (y * from.width + x) * 4;
      if ((from.data[sourceOffset + 3] ?? 0) === 0) {
        continue;
      }
      to.data.set(
        from.data.subarray(sourceOffset, sourceOffset + 4),
        (targetY * to.width + targetX) * 4,
      );
    }
  }
}

/**
 * @param source - Image path or bytes
 * @returns Raw RGBA pixels
 */
async function readRgba(source: Buffer | string): Promise<RgbaImage> {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), height: info.height, width: info.width };
}

/**
 * @param image - Raw RGBA pixels
 * @returns A sharp pipeline over those pixels, without copying them
 */
function rawSharp(image: RgbaImage) {
  const bytes = Buffer.from(
    image.data.buffer,
    image.data.byteOffset,
    image.data.byteLength,
  );
  return sharp(bytes, {
    raw: { channels: 4, height: image.height, width: image.width },
  });
}

/**
 * @param region - Exclusive-edge region
 * @returns The region in sharp's `extract` shape
 */
function toExtractRegion(region: PixelRegion) {
  return {
    height: region.bottom - region.top,
    left: region.left,
    top: region.top,
    width: region.right - region.left,
  };
}

/**
 * @param boundaries - Sorted split points
 * @returns Each neighboring pair as `[start, end]`
 */
function pairs(boundaries: readonly number[]): [number, number][] {
  return boundaries
    .slice(1)
    .map((end, index) => [boundaries[index] ?? 0, end] as [number, number]);
}

/**
 * @param frames - Measurements for one row
 * @returns How many cells had no visible character
 */
function countEmpty(frames: readonly (FrameMeasurement | undefined)[]): number {
  return frames.filter((frame) => frame === undefined).length;
}
