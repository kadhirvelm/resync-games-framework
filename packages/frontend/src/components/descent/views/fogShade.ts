import { FOG_CELL, type FogOfWarState } from "../logic/fog";

/** How dark each fog state is drawn, 0 (clear) to 1 (black). */
export const FOG_SHADE = {
  explored: 0.55,
  unseen: 1,
  visible: 0,
} as const;

/** The fog's ink, a near-black that matches the cavern void. */
export const FOG_COLOR = { b: 8, g: 5, r: 6 } as const;

/** One opacity per tile, ready to paint. */
export interface FogShadeGrid {
  /** Row-major opacities, 0 to 255. */
  alpha: Uint8ClampedArray;
  height: number;
  width: number;
}

/**
 * Turns fog into per-tile opacity. A margin repeats the edge tiles outward
 * so ground beyond the playable map darkens with its nearest edge.
 * @param fog - Published fog
 * @param margin - Extra tiles on every side
 * @returns Opacity grid of `(fog.width + 2·margin) × (fog.height + 2·margin)`
 */
export function fogShadeGrid(fog: FogOfWarState, margin = 0): FogShadeGrid {
  const pad = Math.max(0, Math.floor(margin));
  const width = fog.width + pad * 2;
  const height = fog.height + pad * 2;
  const alpha = new Uint8ClampedArray(width * height);
  const shades = {
    [FOG_CELL.explored]: Math.round(FOG_SHADE.explored * 255),
    [FOG_CELL.unseen]: Math.round(FOG_SHADE.unseen * 255),
    [FOG_CELL.visible]: Math.round(FOG_SHADE.visible * 255),
  } as Record<number, number>;
  for (let row = 0; row < height; row += 1) {
    const sourceRow = clamp(row - pad, fog.height);
    for (let column = 0; column < width; column += 1) {
      const sourceColumn = clamp(column - pad, fog.width);
      const code = fog.cells.charCodeAt(sourceRow * fog.width + sourceColumn);
      alpha[row * width + column] = shades[code] ?? 255;
    }
  }
  return { alpha, height, width };
}

/**
 * Expands an opacity grid into RGBA pixels in the fog color.
 * @param grid - Opacity grid
 * @returns Pixel data for `ImageData`
 */
export function fogShadePixels(grid: FogShadeGrid): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(grid.width * grid.height * 4);
  for (let index = 0; index < grid.alpha.length; index += 1) {
    const offset = index * 4;
    pixels[offset] = FOG_COLOR.r;
    pixels[offset + 1] = FOG_COLOR.g;
    pixels[offset + 2] = FOG_COLOR.b;
    pixels[offset + 3] = grid.alpha[index] ?? 255;
  }
  return pixels;
}

/**
 * Paints fog onto a canvas one pixel per tile. CSS or a scaled draw can
 * stretch it smoothly.
 * @param canvas - Target canvas; resized to the grid
 * @param grid - Opacity grid
 * @returns Whether a 2D context was available
 */
export function paintFogShade(
  canvas: HTMLCanvasElement,
  grid: FogShadeGrid,
): boolean {
  if (canvas.width !== grid.width) canvas.width = grid.width;
  if (canvas.height !== grid.height) canvas.height = grid.height;
  const context = canvas.getContext("2d");
  if (context === null) return false;
  const image = context.createImageData(grid.width, grid.height);
  image.data.set(fogShadePixels(grid));
  context.putImageData(image, 0, 0);
  return true;
}

/**
 * @param value - Candidate index
 * @param size - Axis length
 * @returns The index clamped onto the axis
 */
function clamp(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}
