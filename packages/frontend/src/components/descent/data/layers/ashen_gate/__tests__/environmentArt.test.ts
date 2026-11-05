import { describe, expect, test } from "bun:test";
import {
  ASHEN_GATE_TEXTURES,
  ashenGateTexturePrompt,
  resolveAshenGateTextures,
} from "../environmentArt";

/**
 * @param prompt - Stored generation prompt
 * @param createdAt - ISO creation time
 * @returns A stored image with the fields lookup reads
 */
function image(prompt: string, createdAt: string) {
  return { createdAt, imageUrl: `https://assets/${createdAt}.webp`, prompt };
}

describe("ashen gate environment art", () => {
  test("finds the newest image for each tagged texture", () => {
    const ground = ASHEN_GATE_TEXTURES[0].tag;
    const resolved = resolveAshenGateTextures([
      image(ashenGateTexturePrompt(ground, "old"), "2026-01-01"),
      image(ashenGateTexturePrompt(ground, "new"), "2026-02-01"),
    ]);

    expect(resolved.ground).toBe("https://assets/2026-02-01.webp");
    expect(resolved.lava).toBeUndefined();
  });

  test("ignores images whose prompt only mentions a tag", () => {
    const resolved = resolveAshenGateTextures([
      image(`A painting of ${ASHEN_GATE_TEXTURES[1].tag}.`, "2026-01-01"),
    ]);

    expect(resolved).toEqual({});
  });
});
