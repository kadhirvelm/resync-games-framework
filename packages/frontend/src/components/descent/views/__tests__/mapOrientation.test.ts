import { describe, expect, test } from "bun:test";
import {
  cameraAlphaToMinimapRotation,
  mapYToWorldZ,
  worldZToMapY,
} from "../mapOrientation";

describe("Descent map orientation", () => {
  test("places map north at high world z and south at low world z", () => {
    expect(mapYToWorldZ(0, 80)).toBe(80);
    expect(mapYToWorldZ(20, 80)).toBe(60);
    expect(mapYToWorldZ(80, 80)).toBe(0);
  });

  test("round-trips map and Babylon ground coordinates", () => {
    expect(worldZToMapY(mapYToWorldZ(13, 80), 80)).toBe(13);
    expect(mapYToWorldZ(worldZToMapY(62, 80), 80)).toBe(62);
  });

  test("reflects camera turns into the top-origin minimap", () => {
    expect(cameraAlphaToMinimapRotation(-Math.PI / 2)).toBeCloseTo(0);
    expect(cameraAlphaToMinimapRotation(0)).toBeCloseTo(-Math.PI / 2);
    expect(cameraAlphaToMinimapRotation(-Math.PI)).toBeCloseTo(Math.PI / 2);
  });
});
