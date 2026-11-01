import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  normalizeSpriteSheet,
  removeSpriteBackground,
} from "../normalizeSpriteSheet";

const COLUMNS = 6;
const ROWS = 4;
const CELL = 64;
const FIGURE = [40, 30, 60];

describe("normalizeSpriteSheet", () => {
  test("splits rows into strips and locks every frame to one baseline and center", async () => {
    const sheet = await paintSheet((row, column) => ({
      driftX: (column % 3) * 4 - 4,
      driftY: (column % 2) * 5,
      height: row === 1 ? 30 : 36,
    }));

    const result = await normalizeSpriteSheet(sheet, {
      columns: COLUMNS,
      rows: ROWS,
    });

    expect(result.animations).toHaveLength(ROWS);
    for (const animation of result.animations) {
      expect(animation.frameCount).toBe(COLUMNS);
      expect(animation.emptyFrames).toBe(0);
      const metadata = await sharp(animation.strip).metadata();
      expect(metadata.width).toBe(result.frameWidth * COLUMNS);
      expect(metadata.height).toBe(result.frameHeight);

      const frames = await measureStrip(
        animation.strip,
        result.frameWidth,
        result.frameHeight,
      );
      const baselines = new Set(frames.map((frame) => frame.bottom));
      const centers = new Set(frames.map((frame) => frame.center));
      expect(baselines.size).toBe(1);
      expect(centers.size).toBe(1);
    }
  });

  test("scales a row painted smaller back to the idle row's height", async () => {
    const sheet = await paintSheet((row) => ({
      driftX: 0,
      driftY: 0,
      height: row === 2 ? 30 : 36,
    }));

    const result = await normalizeSpriteSheet(sheet, {
      columns: COLUMNS,
      rows: ROWS,
    });
    const [idle] = await measureStrip(
      result.animations[0]?.strip ?? Buffer.alloc(0),
      result.frameWidth,
      result.frameHeight,
    );
    const [defend] = await measureStrip(
      result.animations[2]?.strip ?? Buffer.alloc(0),
      result.frameWidth,
      result.frameHeight,
    );

    expect(defend?.height).toBe(idle?.height);
  });

  test("rejects a sheet with an empty animation row", async () => {
    const sheet = await paintSheet((row) =>
      row === 3 ? undefined : { driftX: 0, driftY: 0, height: 36 },
    );

    const error = await normalizeSpriteSheet(sheet, {
      columns: COLUMNS,
      rows: ROWS,
    }).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error instanceof Error ? error.message : "").toContain(
      "no visible frames",
    );
  });

  test("keeps a soft edge with the character's color in every strip, scaled or not", async () => {
    const sheet = await paintSheet(
      (row) => ({ driftX: 0, driftY: 0, height: row === 2 ? 30 : 36 }),
      true,
    );

    const result = await normalizeSpriteSheet(sheet, {
      columns: COLUMNS,
      rows: ROWS,
    });

    for (const animation of result.animations) {
      const edges = await partialAlphaPixels(animation.strip);
      expect(edges).not.toHaveLength(0);
      for (const edge of edges) {
        expect(Math.max(...edge.rgb)).toBeLessThan(90);
      }
    }
  });
});

describe("removeSpriteBackground", () => {
  test("returns a transparent PNG trimmed to the character", async () => {
    const anchor = await paintSheet(() => ({
      driftX: 0,
      driftY: 0,
      height: 36,
    }));
    const single = await sharp(anchor)
      .extract({ height: CELL, left: 0, top: 0, width: CELL })
      .png()
      .toBuffer();

    const trimmed = await removeSpriteBackground(single);
    const metadata = await sharp(trimmed).metadata();

    expect(metadata.hasAlpha).toBe(true);
    expect(metadata.width).toBe(16);
    expect(metadata.height).toBe(36);
  });

  test("keeps the soft edge of the identity anchor", async () => {
    const anchor = await paintSheet(
      () => ({ driftX: 0, driftY: 0, height: 36 }),
      true,
    );
    const single = await sharp(anchor)
      .extract({ height: CELL, left: 0, top: 0, width: CELL })
      .png()
      .toBuffer();

    const trimmed = await removeSpriteBackground(single);
    const metadata = await sharp(trimmed).metadata();
    const edges = await partialAlphaPixels(trimmed);

    expect(metadata.width).toBe(18);
    expect(metadata.height).toBe(38);
    expect(edges).not.toHaveLength(0);
    for (const edge of edges) {
      expect(edge.alpha).toBe(128);
      expect(edge.rgb).toEqual(FIGURE);
    }
  });
});

interface PaintedFrame {
  driftX: number;
  driftY: number;
  height: number;
}

/**
 * Paints a white sheet with one outlined figure per cell, drifted inside its cell.
 * @param figure - Size and drift for each cell, or undefined to leave it empty
 * @param softEdge - Adds a one-pixel ring of the figure blended half and half with white
 * @returns PNG bytes
 */
async function paintSheet(
  figure: (row: number, column: number) => PaintedFrame | undefined,
  softEdge = false,
): Promise<Buffer> {
  const width = CELL * COLUMNS;
  const height = CELL * ROWS;
  const data = Buffer.alloc(width * height * 4, 255);
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const painted = figure(row, column);
      if (painted === undefined) {
        continue;
      }
      const left = column * CELL + 24 + painted.driftX;
      const bottom = row * CELL + 56 - painted.driftY;
      if (softEdge) {
        const ring = FIGURE.map((channel) => (channel + 255) / 2);
        for (let y = bottom - painted.height - 1; y < bottom + 1; y += 1) {
          for (let x = left - 1; x < left + 17; x += 1) {
            data.set([...ring, 255], (y * width + x) * 4);
          }
        }
      }
      for (let y = bottom - painted.height; y < bottom; y += 1) {
        for (let x = left; x < left + 16; x += 1) {
          data.set([...FIGURE, 255], (y * width + x) * 4);
        }
      }
    }
  }
  return sharp(data, { raw: { channels: 4, height, width } })
    .png()
    .toBuffer();
}

/**
 * @param strip - Normalized animation strip
 * @param frameWidth - Width of one frame
 * @param frameHeight - Height of one frame
 * @returns Lowest opaque row, horizontal center, and height for each frame
 */
async function measureStrip(
  strip: Buffer,
  frameWidth: number,
  frameHeight: number,
): Promise<{ bottom: number; center: number; height: number }[]> {
  const { data, info } = await sharp(strip)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameCount = info.width / frameWidth;
  return Array.from({ length: frameCount }, (_, frame) => {
    let top = frameHeight;
    let bottom = -1;
    let left = frameWidth;
    let right = -1;
    for (let y = 0; y < frameHeight; y += 1) {
      for (let x = 0; x < frameWidth; x += 1) {
        const alpha = data[(y * info.width + frame * frameWidth + x) * 4 + 3];
        if ((alpha ?? 0) === 0) {
          continue;
        }
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    return {
      bottom,
      center: (left + right) / 2,
      height: bottom - top + 1,
    };
  });
}

/**
 * @param png - PNG bytes
 * @returns Every pixel that is neither fully transparent nor fully opaque
 */
async function partialAlphaPixels(
  png: Buffer,
): Promise<{ alpha: number; rgb: number[] }[]> {
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const pixels: { alpha: number; rgb: number[] }[] = [];
  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    if (alpha === 0 || alpha === 255) {
      continue;
    }
    pixels.push({ alpha, rgb: Array.from(data.subarray(offset, offset + 3)) });
  }
  return pixels;
}
