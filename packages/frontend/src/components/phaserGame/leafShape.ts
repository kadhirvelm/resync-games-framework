/** A point in canvas pixels. */
export interface PaintPoint {
  x: number;
  y: number;
}

/**
 * Outline of a pointed leaf, the game's visual signature.
 * The leaf runs from its stem to its tip along `angle`, widest in the middle.
 * @param centerX - Leaf center x
 * @param centerY - Leaf center y
 * @param length - Stem-to-tip length
 * @param width - Widest point across the leaf
 * @param angle - Direction from stem to tip, in radians. 0 points right.
 * @param segments - Points along each side. More points give smoother edges.
 * @returns Closed outline, stem first, up one side and back down the other
 */
export function leafOutline(
  centerX: number,
  centerY: number,
  length: number,
  width: number,
  angle = -Math.PI / 2,
  segments = 12,
): PaintPoint[] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const half = length / 2;
  const steps = Math.max(2, Math.floor(segments));
  const side = (sign: 1 | -1): PaintPoint[] =>
    Array.from({ length: steps + 1 }, (_, step) => {
      const t = step / steps;
      const along = -half + t * length;
      // sin^0.9 keeps the leaf full near the stem and pointed at the tip.
      const across = sign * (width / 2) * Math.sin(Math.PI * t) ** 0.9;
      return {
        x: centerX + along * cos - across * sin,
        y: centerY + along * sin + across * cos,
      };
    });
  const upper = side(1);
  const lower = side(-1).reverse().slice(1, -1);
  return [...upper, ...lower];
}

/** One translucent circle in a watercolor wash. */
export interface WashBlot {
  alpha: number;
  radius: number;
  x: number;
  y: number;
}

/**
 * Overlapping translucent circles that read as a watercolor wash.
 * The layout comes from `seed`, so a wash looks the same on every redraw.
 * @param centerX - Wash center x
 * @param centerY - Wash center y
 * @param radius - Overall wash radius
 * @param seed - Any integer; the same seed draws the same wash
 * @param count - Number of blots
 * @returns Blots to fill, largest first
 */
export function washBlots(
  centerX: number,
  centerY: number,
  radius: number,
  seed: number,
  count = 7,
): WashBlot[] {
  let state = seed | 0;
  const next = (): number => {
    state = (Math.imul(state, 1103515245) + 12345) | 0;
    return ((state >>> 8) & 0xffff) / 0xffff;
  };
  return Array.from({ length: count }, (_, index) => {
    const spread = radius * 0.45;
    const shrink = 1 - index / (count * 1.6);
    return {
      alpha: 0.1 + next() * 0.12,
      radius: radius * (0.55 + next() * 0.4) * shrink,
      x: centerX + (next() - 0.5) * 2 * spread,
      y: centerY + (next() - 0.5) * 2 * spread,
    };
  });
}

/**
 * @param text - Any string, such as a unit id
 * @returns A stable integer for seeding a wash
 */
export function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}
