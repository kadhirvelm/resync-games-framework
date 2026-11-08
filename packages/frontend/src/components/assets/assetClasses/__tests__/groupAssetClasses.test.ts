import { describe, expect, test } from "bun:test";
import {
  assetClassEyebrow,
  assetClassMatchesQuery,
  groupAssetClassesByMedium,
} from "../groupAssetClasses";

const dungeon = {
  category: "Dungeons",
  id: "dungeons",
  medium: "2d" as const,
  subtitle: "dungeon package",
  tabLabel: "Dungeons",
};

const character = {
  category: "Characters",
  id: "card-characters",
  medium: "2d" as const,
  subtitle: "card character generation",
  tabLabel: "Card characters",
};

const enemy = {
  category: "Characters",
  id: "enemies",
  medium: "2d" as const,
  subtitle: "enemy portrait generation",
  tabLabel: "Enemies",
};

const models = {
  category: "3D models",
  id: "three-d-models",
  medium: "3d" as const,
  subtitle: "3D world and model studio",
  tabLabel: "3D models",
};

const audio = {
  category: "Sound",
  id: "audio",
  medium: "both" as const,
  subtitle: "effects, ambience, and music",
  tabLabel: "Audio",
};

describe("groupAssetClassesByMedium", () => {
  test("splits mixed generators into 2D, then 3D, then Both", () => {
    const sections = groupAssetClassesByMedium([
      audio,
      models,
      enemy,
      dungeon,
      character,
    ]);

    expect(sections.map((section) => section.label)).toEqual([
      "2D",
      "3D",
      "Both",
    ]);
    expect(sections[0]?.categories.map((group) => group.category)).toEqual([
      "Characters",
      "Dungeons",
    ]);
    expect(sections[0]?.categories[0]?.classes.map((item) => item.id)).toEqual([
      "enemies",
      "card-characters",
    ]);
    expect(sections[1]?.categories[0]?.classes.map((item) => item.id)).toEqual([
      "three-d-models",
    ]);
    expect(sections[2]?.categories[0]?.classes.map((item) => item.id)).toEqual([
      "audio",
    ]);
  });

  test("drops a section that has no matches", () => {
    const sections = groupAssetClassesByMedium([dungeon, character]);

    expect(sections.map((section) => section.medium)).toEqual(["2d"]);
  });
});

describe("assetClassMatchesQuery", () => {
  test("matches the section name as well as the generator", () => {
    expect(assetClassMatchesQuery("both", audio)).toBe(true);
    expect(assetClassMatchesQuery("2d", dungeon)).toBe(true);
    expect(assetClassMatchesQuery("2d", models)).toBe(false);
    expect(assetClassMatchesQuery("sprite", audio)).toBe(false);
  });
});

describe("assetClassEyebrow", () => {
  test("prefixes the sidebar section unless one already names the other", () => {
    expect(assetClassEyebrow(character)).toBe("2D art · Characters");
    expect(assetClassEyebrow(audio)).toBe("Any game · Sound");
    expect(assetClassEyebrow(models)).toBe("3D models");
    expect(assetClassEyebrow({ ...models, category: "Models" })).toBe(
      "3D models",
    );
  });
});
