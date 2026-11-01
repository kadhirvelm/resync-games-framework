import { describe, expect, mock, test } from "bun:test";
import type { StoredDungeonSlot } from "../dungeonBlueprint";
import {
  CHARACTER_SPRITE_FACING,
  DungeonSlotGenerator,
  ENEMY_SPRITE_FACING,
} from "../dungeonSlotGenerator";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";
const CHARACTER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CARD_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENEMY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("DungeonSlotGenerator", () => {
  test("prepares a card with its character context and progression", async () => {
    const progression = {
      aetherCost: 2,
      level: 2,
      previousEffects: [{ amount: 4, kind: "defend" as const, text: "Block." }],
    };
    const progressionFor = mock(async () => progression);
    const generator = createGenerator({ progressionFor });

    const prepared = await generator.prepare(cardSlot(), [
      characterSlot(),
      cardSlot(),
    ]);

    expect(prepared.prompt).toContain("Character:\nA drowned bell keeper");
    expect(prepared.prompt).toContain("Card request:\nStrike the bell harder");
    expect(prepared.progression).toEqual(progression);
    expect(progressionFor).toHaveBeenCalledTimes(1);
  });

  test("prepares a sprite with its character context", async () => {
    const generator = createGenerator({});

    const prepared = await generator.prepare(spriteSlot(), [
      characterSlot(),
      spriteSlot(),
    ]);

    expect(prepared.prompt).toBe(
      `Character:\nA drowned bell keeper\n\nSprite request:\n${CHARACTER_SPRITE_FACING}\nSwings a bell hammer`,
    );
    expect(prepared.prompt).toContain("Facing: right");
    expect(prepared.progression).toBeUndefined();
  });

  test("prepares an enemy sprite with its enemy context, facing left", async () => {
    const generator = createGenerator({});
    const sprite = enemySpriteSlot();

    const prepared = await generator.prepare(sprite, [enemySlot(), sprite]);

    expect(prepared.prompt).toBe(
      `Enemy:\nA moss-covered bell beast\n\nSprite request:\n${ENEMY_SPRITE_FACING}\nRears up and slams its bell shell`,
    );
    expect(prepared.prompt).toContain("Facing: left");
  });

  test("sends a sprite prompt alone when its owner is missing", async () => {
    const generator = createGenerator({});

    const prepared = await generator.prepare(spriteSlot(), [spriteSlot()]);

    expect(prepared.prompt).toBe("Swings a bell hammer");
  });

  test("dispatches each slot kind to its asset agent", async () => {
    const backgroundQuery = mock(async () => ({ id: "room-id", summary: "" }));
    const characterQuery = mock(async () => ({
      setId: "character-id",
      summary: "",
    }));
    const enemyQuery = mock(async () => ({ id: "enemy-id", summary: "" }));
    const spriteQuery = mock(async () => ({ id: "sprite-id", summary: "" }));
    const cardQuery = mock(async () => ({
      aetherCost: 2,
      cardId: "card-id",
      effects: [{ amount: 5, kind: "defend" as const, text: "Block." }],
    }));
    const generator = createGenerator({
      backgroundQuery,
      cardQuery,
      characterQuery,
      enemyQuery,
      spriteQuery,
    });

    const ids = await Promise.all([
      generator.generate(runInput(backgroundSlot())),
      generator.generate(runInput(characterSlot())),
      generator.generate(runInput(enemySlot())),
      generator.generate(runInput(spriteSlot())),
      generator.generate({
        ...runInput(cardSlot()),
        progression: {
          aetherCost: 2,
          level: 2,
          previousEffects: [
            { amount: 4, kind: "defend" as const, text: "Block." },
          ],
        },
      }),
    ]);

    expect(ids).toEqual([
      "room-id",
      "character-id",
      "enemy-id",
      "sprite-id",
      "card-id",
    ]);
    expect(backgroundQuery).toHaveBeenCalledTimes(1);
    expect(characterQuery).toHaveBeenCalledTimes(1);
    expect(enemyQuery).toHaveBeenCalledTimes(1);
    expect(cardQuery).toHaveBeenCalledTimes(1);
    expect(spriteQuery).toHaveBeenCalledTimes(1);
  });
});

/**
 * @param options - Agent and asset lookup stand-ins
 * @returns A slot generator with observable dependencies
 */
function createGenerator(options: {
  backgroundQuery?: (
    input: unknown,
  ) => Promise<{ id: string; summary: string }>;
  cardQuery?: (input: unknown) => Promise<{
    aetherCost: number;
    cardId: string;
    effects: Array<{ amount: number; kind: "defend"; text: string }>;
  }>;
  characterQuery?: (
    input: unknown,
  ) => Promise<{ setId: string; summary: string }>;
  enemyQuery?: (input: unknown) => Promise<{ id: string; summary: string }>;
  progressionFor?: (slot: unknown, slots: unknown[]) => Promise<unknown>;
  spriteQuery?: (input: unknown) => Promise<{ id: string; summary: string }>;
}): DungeonSlotGenerator {
  const agent = (query: (input: unknown) => Promise<unknown>) => ({
    abort: async () => true,
    query,
  });
  return new DungeonSlotGenerator(
    agent(
      options.backgroundQuery ?? (async () => ({ id: "room-id", summary: "" })),
    ) as never,
    agent(
      options.characterQuery ??
        (async () => ({ setId: "character-id", summary: "" })),
    ) as never,
    agent(
      options.cardQuery ??
        (async () => ({
          aetherCost: 2,
          cardId: "card-id",
          effects: [],
        })),
    ) as never,
    agent(
      options.enemyQuery ?? (async () => ({ id: "enemy-id", summary: "" })),
    ) as never,
    agent(
      options.spriteQuery ?? (async () => ({ id: "sprite-id", summary: "" })),
    ) as never,
    {
      progressionFor:
        options.progressionFor ?? (async () => Promise.resolve(undefined)),
    } as never,
  );
}

/**
 * @param slot - Prepared slot to run
 * @returns Complete generation input
 */
function runInput(slot: StoredDungeonSlot) {
  return {
    generationId: GENERATION_ID,
    prompt: slot.prompt,
    sessionId: "session-1",
    slot,
  };
}

/** @returns A room slot */
function backgroundSlot(): StoredDungeonSlot {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    kind: "battle-background",
    prompt: "A flooded bell chamber",
    status: "planned",
    title: "Bell chamber",
  };
}

/** @returns A character slot */
function characterSlot(): StoredDungeonSlot {
  return {
    id: CHARACTER_ID,
    kind: "card-character",
    prompt: "A drowned bell keeper",
    status: "planned",
    title: "Bell keeper",
  };
}

/** @returns An enemy slot */
function enemySlot(): StoredDungeonSlot {
  return {
    id: ENEMY_ID,
    kind: "enemy",
    prompt: "A moss-covered bell beast",
    status: "planned",
    title: "Bell beast",
  };
}

/** @returns A level-two card slot */
function cardSlot(): StoredDungeonSlot {
  return {
    characterSlotId: CHARACTER_ID,
    id: CARD_ID,
    kind: "playable-card",
    level: 2,
    prompt: "Strike the bell harder",
    status: "planned",
    title: "Bell strike II",
  };
}

/** @returns The bell keeper's sprite slot */
function spriteSlot(): StoredDungeonSlot {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    kind: "sprite-sheet",
    ownerSlotId: CHARACTER_ID,
    prompt: "Swings a bell hammer",
    status: "planned",
    title: "Bell keeper sprite",
  };
}

/** @returns The bell beast's sprite slot */
function enemySpriteSlot(): StoredDungeonSlot {
  return {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    kind: "sprite-sheet",
    ownerSlotId: ENEMY_ID,
    prompt: "Rears up and slams its bell shell",
    status: "planned",
    title: "Bell beast sprite",
  };
}
