/** Directional and rotation keys currently held for the 3D RTS camera. */
export interface CameraKeyState {
  back: boolean;
  forward: boolean;
  left: boolean;
  right: boolean;
  rotateLeft: boolean;
  rotateRight: boolean;
}

/** Which held-key flag one keyboard key drives. */
export type CameraKey = keyof CameraKeyState;

/** A movement on the ground plane in Babylon world axes. */
export interface GroundVector {
  x: number;
  z: number;
}

/** Pointer position in browser client coordinates. */
export interface EdgeScrollPointer {
  x: number;
  y: number;
}

/** A viewport or HUD rectangle in browser client coordinates. */
export interface EdgeScrollRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Optional edge size and HUD hit-testing for edge scrolling. */
export interface EdgeScrollOptions {
  /** Width of the active band inside each viewport edge, in pixels. */
  edgeSize?: number;
  /** HUD rectangles over which edge scrolling must stay inactive. */
  hudRects?: readonly EdgeScrollRect[];
  /** Additional HUD hit-test, useful for DOM element-based integration. */
  isPointerOverHud?: (pointer: EdgeScrollPointer) => boolean;
}

/** Default width of the pointer band that activates edge scrolling. */
export const EDGE_SCROLL_MARGIN_PX = 24;

/**
 * Creates a key state with nothing held.
 * @returns A fresh, fully released key state
 */
export function emptyCameraKeys(): CameraKeyState {
  return {
    back: false,
    forward: false,
    left: false,
    right: false,
    rotateLeft: false,
    rotateRight: false,
  };
}

/**
 * Maps a `KeyboardEvent.key` to the camera control it drives.
 * @param key - The event's `key` value
 * @returns The camera control, or null when the key does not move the camera
 */
export function cameraKeyFromInput(key: string): CameraKey | null {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  switch (normalized) {
    case "w":
    case "ArrowUp":
      return "forward";
    case "s":
    case "ArrowDown":
      return "back";
    case "a":
    case "ArrowLeft":
      return "left";
    case "d":
    case "ArrowRight":
      return "right";
    case "q":
      return "rotateLeft";
    case "e":
      return "rotateRight";
    default:
      return null;
  }
}

/**
 * Converts held pan keys into a unit ground-plane direction relative to an
 * ArcRotateCamera's heading. Forward points from the camera toward its target,
 * so W always moves "up the screen" whatever the camera's rotation.
 * @param keys - Currently held keys
 * @param alpha - ArcRotateCamera longitudinal angle in radians
 * @returns A normalized direction, or a zero vector when no pan key is held
 */
export function cameraPanDirection(
  keys: CameraKeyState,
  alpha: number,
): GroundVector {
  const forwardInput = Number(keys.forward) - Number(keys.back);
  const rightInput = Number(keys.right) - Number(keys.left);
  return groundPanDirection(forwardInput, rightInput, alpha);
}

/**
 * Converts screen-relative forward/right input into a normalized world vector.
 * @param forwardInput - Positive toward the top of the screen
 * @param rightInput - Positive toward the right of the screen
 * @param alpha - ArcRotateCamera longitudinal angle in radians
 * @returns A normalized ground direction, or zero for no/cancelled input
 */
function groundPanDirection(
  forwardInput: number,
  rightInput: number,
  alpha: number,
): GroundVector {
  if (forwardInput === 0 && rightInput === 0) return { x: 0, z: 0 };
  // The camera sits at target + (cos α, sin α) on the ground plane, so the
  // view direction is the negation; screen-right is up × forward.
  const forwardX = -Math.cos(alpha);
  const forwardZ = -Math.sin(alpha);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  const x = forwardX * forwardInput + rightX * rightInput;
  const z = forwardZ * forwardInput + rightZ * rightInput;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

/**
 * Tests a pointer against a client rectangle with an exclusive right/bottom.
 * @param pointer - Browser pointer position
 * @param rect - Viewport or HUD rectangle
 * @returns Whether the pointer lies inside the rectangle
 */
function pointerInsideRect(
  pointer: EdgeScrollPointer,
  rect: EdgeScrollRect,
): boolean {
  return (
    pointer.x >= rect.left &&
    pointer.x < rect.right &&
    pointer.y >= rect.top &&
    pointer.y < rect.bottom
  );
}

/**
 * Computes camera-relative panning from a pointer near the viewport edges.
 * A null/outside pointer, HUD hit, interior pointer, or opposing edge input
 * produces zero movement. The result uses the same heading and speed pathway
 * as keyboard panning.
 * @param pointer - Current browser pointer position, or null when unavailable
 * @param viewport - Canvas rectangle in browser client coordinates
 * @param alpha - ArcRotateCamera longitudinal angle in radians
 * @param options - Edge size and HUD hit-testing
 * @returns A normalized ground direction, or zero when edge scroll is inactive
 */
export function edgeScrollPanDirection(
  pointer: EdgeScrollPointer | null,
  viewport: EdgeScrollRect,
  alpha: number,
  options: EdgeScrollOptions = {},
): GroundVector {
  if (pointer === null || !pointerInsideRect(pointer, viewport)) {
    return { x: 0, z: 0 };
  }
  const edgeSize = Math.max(0, options.edgeSize ?? EDGE_SCROLL_MARGIN_PX);
  const forwardInput =
    Number(pointer.y < viewport.top + edgeSize) -
    Number(pointer.y >= viewport.bottom - edgeSize);
  const rightInput =
    Number(pointer.x >= viewport.right - edgeSize) -
    Number(pointer.x < viewport.left + edgeSize);
  if (forwardInput === 0 && rightInput === 0) return { x: 0, z: 0 };
  if (options.isPointerOverHud?.(pointer) === true) return { x: 0, z: 0 };
  if (options.hudRects?.some((rect) => pointerInsideRect(pointer, rect))) {
    return { x: 0, z: 0 };
  }
  return groundPanDirection(forwardInput, rightInput, alpha);
}

/**
 * Reads the held rotation keys as a signed turn direction.
 * @param keys - Currently held keys
 * @returns 1 to rotate left, -1 to rotate right, or 0
 */
export function cameraRotationInput(keys: CameraKeyState): number {
  return Number(keys.rotateLeft) - Number(keys.rotateRight);
}
