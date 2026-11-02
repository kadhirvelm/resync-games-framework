import { describe, expect, test } from "bun:test";
import { CHARACTER_SPRITE_FACING } from "src/dungeon/dungeonSlotGenerator";
import {
  cultivatorPortraitPrompt,
  cultivatorSpritePrompt,
} from "../cultivatorPrompts";

const CULTIVATOR = {
  appearance: "A tall woman with a burn scar and a moth-eaten grey robe.",
  name: "Lin Wei",
  title: "Keeper of Ash",
};

describe("cultivator prompts", () => {
  test("the portrait names the cultivator and asks for four realms", () => {
    const prompt = cultivatorPortraitPrompt(CULTIVATOR);
    expect(prompt).toContain("Name: Lin Wei");
    expect(prompt).toContain(`Appearance: ${CULTIVATOR.appearance}`);
    expect(prompt).toContain("four cultivation realms");
  });

  test("the sprite faces right like every party member", () => {
    const prompt = cultivatorSpritePrompt(CULTIVATOR);
    expect(prompt).toContain("Title: Keeper of Ash");
    expect(prompt).toContain(`Sprite request:\n${CHARACTER_SPRITE_FACING}`);
  });
});
