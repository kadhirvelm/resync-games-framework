/** A box in client pixels, as `getBoundingClientRect` returns it. */
export interface PointerBox {
  height: number;
  left: number;
  top: number;
  width: number;
}

/** How a card leans toward the pointer. */
export interface TiltPose {
  /** Glare center across the card, 0 to 100 percent */
  glareX: number;
  /** Glare center down the card, 0 to 100 percent */
  glareY: number;
  /** Degrees around the horizontal axis; positive leans the top back */
  rotateX: number;
  /** Degrees around the vertical axis; positive turns the right edge away */
  rotateY: number;
}

/**
 * @param value - Any number
 * @returns The number clamped to [0, 1]; not-a-number counts as the middle
 */
function unit(value: number): number {
  if (Number.isNaN(value)) {
    return 0.5;
  }
  return Math.min(1, Math.max(0, value));
}

/**
 * Leans a card toward the pointer, like holding it up to the light.
 * @param box - The card's box
 * @param x - Pointer x in client pixels
 * @param y - Pointer y in client pixels
 * @param maxDegrees - Lean at the very edge
 * @returns Rotation and glare position for the pose
 */
export function tiltFromPointer(
  box: PointerBox,
  x: number,
  y: number,
  maxDegrees = 8,
): TiltPose {
  const across = unit((x - box.left) / box.width);
  const down = unit((y - box.top) / box.height);
  return {
    glareX: Math.round(across * 100),
    glareY: Math.round(down * 100),
    rotateX: Number(((0.5 - down) * 2 * maxDegrees).toFixed(2)),
    rotateY: Number(((across - 0.5) * 2 * maxDegrees).toFixed(2)),
  };
}

/**
 * Pointer position relative to the middle of a view, for parallax layers.
 * @param x - Pointer x in pixels
 * @param y - Pointer y in pixels
 * @param width - View width
 * @param height - View height
 * @returns Offsets from -1 at the left or top edge to 1 at the other
 */
export function pointerParallax(
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: Number(((unit(x / width) - 0.5) * 2).toFixed(3)),
    y: Number(((unit(y / height) - 0.5) * 2).toFixed(3)),
  };
}
