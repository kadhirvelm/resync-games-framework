import { describe, expect, test } from "bun:test";
import {
  cameraKeyFromInput,
  cameraPanDirection,
  cameraRotationInput,
  emptyCameraKeys,
} from "../cameraControls";

/** The ArcRotateCamera heading the battlefield opens with. */
const OPENING_ALPHA = -Math.PI / 2;

describe("cameraKeyFromInput", () => {
  test("maps WASD, arrows, and Q/E regardless of case", () => {
    expect(cameraKeyFromInput("w")).toBe("forward");
    expect(cameraKeyFromInput("W")).toBe("forward");
    expect(cameraKeyFromInput("ArrowUp")).toBe("forward");
    expect(cameraKeyFromInput("s")).toBe("back");
    expect(cameraKeyFromInput("ArrowLeft")).toBe("left");
    expect(cameraKeyFromInput("d")).toBe("right");
    expect(cameraKeyFromInput("q")).toBe("rotateLeft");
    expect(cameraKeyFromInput("E")).toBe("rotateRight");
  });

  test("ignores keys that do not move the camera", () => {
    expect(cameraKeyFromInput("b")).toBeNull();
    expect(cameraKeyFromInput(" ")).toBeNull();
    expect(cameraKeyFromInput("Escape")).toBeNull();
  });
});

describe("cameraPanDirection", () => {
  test("is zero with nothing held or opposing keys held", () => {
    expect(cameraPanDirection(emptyCameraKeys(), OPENING_ALPHA)).toEqual({
      x: 0,
      z: 0,
    });
    const opposed = { ...emptyCameraKeys(), back: true, forward: true };
    expect(cameraPanDirection(opposed, OPENING_ALPHA)).toEqual({ x: 0, z: 0 });
  });

  test("moves up the screen (+z) and right (+x) at the opening heading", () => {
    const forward = cameraPanDirection(
      { ...emptyCameraKeys(), forward: true },
      OPENING_ALPHA,
    );
    expect(forward.x).toBeCloseTo(0);
    expect(forward.z).toBeCloseTo(1);
    const right = cameraPanDirection(
      { ...emptyCameraKeys(), right: true },
      OPENING_ALPHA,
    );
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  test("follows the camera heading when the camera is rotated", () => {
    // At alpha 0 the camera sits on +x looking toward -x.
    const forward = cameraPanDirection(
      { ...emptyCameraKeys(), forward: true },
      0,
    );
    expect(forward.x).toBeCloseTo(-1);
    expect(forward.z).toBeCloseTo(0);
    const right = cameraPanDirection({ ...emptyCameraKeys(), right: true }, 0);
    expect(right.x).toBeCloseTo(0);
    expect(right.z).toBeCloseTo(1);
  });

  test("normalizes diagonal movement", () => {
    const diagonal = cameraPanDirection(
      { ...emptyCameraKeys(), forward: true, left: true },
      0.7,
    );
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });
});

describe("cameraRotationInput", () => {
  test("returns a signed turn from the rotation keys", () => {
    expect(cameraRotationInput(emptyCameraKeys())).toBe(0);
    expect(
      cameraRotationInput({ ...emptyCameraKeys(), rotateLeft: true }),
    ).toBe(1);
    expect(
      cameraRotationInput({ ...emptyCameraKeys(), rotateRight: true }),
    ).toBe(-1);
  });
});
