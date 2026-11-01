import { describe, expect, test } from "bun:test";
import type { DungeonSlot } from "@towers-of-coreborn/api";
import {
  cardsForCharacter,
  slotsStartedWith,
  spriteForOwner,
} from "../dungeonSlotGroups";

const character: DungeonSlot = {
  id: "keeper",
  kind: "card-character",
  prompt: "A drowned bell keeper",
  status: "planned",
  title: "Bell keeper",
};

const enemy: DungeonSlot = {
  id: "beast",
  kind: "enemy",
  prompt: "A moss-covered bell beast",
  status: "planned",
  title: "Bell beast",
};

const enemySprite: DungeonSlot = {
  id: "beast-sprite",
  kind: "sprite-sheet",
  ownerSlotId: "beast",
  prompt: "Rears up and slams its shell",
  status: "planned",
  title: "Bell beast sprite",
};

/**
 * @param status - Sprite slot status
 * @returns The keeper's sprite slot in that status
 */
function sprite(status: DungeonSlot["status"]): DungeonSlot {
  return {
    id: "keeper-sprite",
    kind: "sprite-sheet",
    ownerSlotId: "keeper",
    prompt: "Swings a bell hammer",
    status,
    title: "Bell keeper sprite",
  };
}

describe("dungeon slot groups", () => {
  test("orders a character's cards by level", () => {
    const slots: DungeonSlot[] = [2, 1].map((level) => ({
      characterSlotId: "keeper",
      id: `card-${level}`,
      kind: "playable-card",
      level: level as 1 | 2,
      prompt: "Ring",
      status: "planned",
      title: `Ring ${level}`,
    }));

    expect(cardsForCharacter(slots, "keeper").map((slot) => slot.id)).toEqual([
      "card-1",
      "card-2",
    ]);
  });

  test("finds the sprite that animates a character or an enemy", () => {
    const slots = [character, sprite("planned"), enemy, enemySprite];
    expect(spriteForOwner(slots, "keeper")?.id).toBe("keeper-sprite");
    expect(spriteForOwner(slots, "beast")?.id).toBe("beast-sprite");
    expect(spriteForOwner([character], "keeper")).toBeUndefined();
  });

  test("starts a planned sprite with its enemy", () => {
    const slots = [character, sprite("ready"), enemy, enemySprite];
    expect(slotsStartedWith(enemy, slots).map((slot) => slot.id)).toEqual([
      "beast",
      "beast-sprite",
    ]);
  });

  test("starts a planned or failed sprite with its character", () => {
    for (const status of ["planned", "failed"] as const) {
      const slots = [character, sprite(status)];
      expect(slotsStartedWith(character, slots).map((slot) => slot.id)).toEqual(
        ["keeper", "keeper-sprite"],
      );
    }
  });

  test("starts only the character when its sprite is ready or running", () => {
    for (const status of ["ready", "generating"] as const) {
      const slots = [character, sprite(status)];
      expect(slotsStartedWith(character, slots)).toEqual([character]);
    }
  });

  test("starts only the requested slot for other kinds", () => {
    const keeperSprite = sprite("planned");
    expect(slotsStartedWith(keeperSprite, [character, keeperSprite])).toEqual([
      keeperSprite,
    ]);
  });
});
