import { describe, expect, test } from "bun:test";
import {
  buildSpriteSheetImagePrompts,
  describeFacing,
  type SpriteSheetDesign,
} from "../buildSpriteSheetImagePrompts";

const DESIGN: SpriteSheetDesign = {
  attackEffect: "a compact amber spark burst",
  attackMove: "an overhead hammer smash",
  costumeAndPalette: "soot-black apron, brass goggles, rust and amber palette",
  defendMove: "raises a riveted forge shield",
  description: "A forge-keeper of the Spire who fights with a smithing hammer.",
  facing: "right",
  name: "Ember Smith",
  prop: "a short smithing hammer",
  silhouette: "stocky, broad shoulders, short legs",
};

describe("buildSpriteSheetImagePrompts", () => {
  test("lays out idle, attack, defend, and hurt rows in splitter order", () => {
    const { sheetPrompt } = buildSpriteSheetImagePrompts(DESIGN);

    expect(sheetPrompt).toContain("4 rows by 6 columns");
    expect(sheetPrompt).toContain(
      "Row 1 idle, Row 2 attack, Row 3 defend, Row 4 hurt",
    );
    expect(sheetPrompt.indexOf("Row 1 — idle")).toBeLessThan(
      sheetPrompt.indexOf("Row 4 — hurt"),
    );
    expect(sheetPrompt).toContain("Frame 6:");
    expect(sheetPrompt).not.toContain("Frame 7:");
  });

  test("puts the attack effect only on the attack row", () => {
    const { anchorPrompt, sheetPrompt } = buildSpriteSheetImagePrompts(DESIGN);

    expect(sheetPrompt).toContain(
      "Only the attack row may show a compact amber spark burst",
    );
    expect(sheetPrompt).toContain(
      "an overhead hammer smash strikes toward the right edge",
    );
    expect(sheetPrompt).toContain("raises a riveted forge shield");
    expect(anchorPrompt).not.toContain(DESIGN.attackEffect);
  });

  test("asks both images for a removable pure white background", () => {
    const { anchorPrompt, sheetPrompt } = buildSpriteSheetImagePrompts(DESIGN);

    for (const prompt of [anchorPrompt, sheetPrompt]) {
      expect(prompt).toContain("pure white #FFFFFF");
      expect(prompt).toContain("Use cream or pale gray for highlights");
      expect(prompt).toContain(describeFacing("right"));
    }
  });

  test("stays within the generate-image prompt limit", () => {
    const { anchorPrompt, sheetPrompt } = buildSpriteSheetImagePrompts({
      ...DESIGN,
      costumeAndPalette: "x".repeat(600),
      description: "y".repeat(800),
      silhouette: "z".repeat(600),
    });

    expect(anchorPrompt.length).toBeLessThan(8000);
    expect(sheetPrompt.length).toBeLessThan(8000);
  });
});

describe("describeFacing", () => {
  test("names the edge the sprite faces and the one its back points to", () => {
    expect(describeFacing("left")).toContain("LEFT EDGE OF THE IMAGE");
    expect(describeFacing("left")).toContain("back points right");
  });
});
