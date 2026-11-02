import { describe, expect, test } from "bun:test";
import type { ThreeDAsset } from "@resync-game-framework/api";
import { getCharacterModelScale, getModelHeight } from "../modelSizing";

/** Builds the validation fields needed by model sizing tests. */
function characterWithHeight(height: number, skins: number): ThreeDAsset {
  return {
    createdAt: "2026-11-01T00:00:00.000Z",
    id: "test-character",
    kind: "character",
    name: "Test character",
    prompt: "",
    provenance: {
      elapsedMs: 0,
      estimatedCredits: null,
      jobIds: [],
      provider: "demo",
    },
    thumbnailUrl: "",
    url: "",
    validation: {
      animations: [],
      bounds: { max: [0.5, height, 0.5], min: [-0.5, 0, -0.5] },
      bytes: 1,
      materials: 1,
      meshes: 1,
      skins,
      textures: 0,
      triangles: 1,
      valid: true,
      warnings: [],
    },
  };
}

describe("model sizing", () => {
  test("treats compressed skinned bounds as a meter-scale character", () => {
    const asset = characterWithHeight(0.0175, 1);

    expect(getModelHeight(asset)).toBe(1.75);
    expect(getCharacterModelScale(asset, 1.75)).toBe(1);
  });

  test("preserves credible authored character bounds", () => {
    const asset = characterWithHeight(1.8, 1);

    expect(getModelHeight(asset)).toBe(1.8);
    expect(getCharacterModelScale(asset, 1.8)).toBe(1);
  });
});
