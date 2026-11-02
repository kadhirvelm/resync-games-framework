import { describe, expect, test } from "bun:test";
import {
  fitModelCameraRadius,
  MODEL_CAMERA_MAX_RADIUS,
  MODEL_CAMERA_MIN_RADIUS,
  zoomModelCameraRadius,
} from "../modelCamera";

describe("model preview camera", () => {
  test("frames character-sized models with visible breathing room", () => {
    expect(fitModelCameraRadius(2.4)).toBe(4.2);
    expect(fitModelCameraRadius(1)).toBe(4);
    expect(fitModelCameraRadius(2.4, 7)).toBe(7);
  });

  test("zooms in and out without crossing camera limits", () => {
    expect(zoomModelCameraRadius(4, "out")).toBe(6);
    expect(zoomModelCameraRadius(4, "in")).toBeCloseTo(8 / 3);
    expect(zoomModelCameraRadius(100, "out")).toBe(MODEL_CAMERA_MAX_RADIUS);
    expect(zoomModelCameraRadius(0.1, "in")).toBe(MODEL_CAMERA_MIN_RADIUS);
  });
});
