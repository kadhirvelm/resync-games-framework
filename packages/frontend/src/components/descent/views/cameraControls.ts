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
 * Reads the held rotation keys as a signed turn direction.
 * @param keys - Currently held keys
 * @returns 1 to rotate left, -1 to rotate right, or 0
 */
export function cameraRotationInput(keys: CameraKeyState): number {
  return Number(keys.rotateLeft) - Number(keys.rotateRight);
}
