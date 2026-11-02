import { describe, expect, test } from "bun:test";
import type {
  CardCharacterSetAsset,
  DungeonBlueprint,
  DungeonSlot,
  EnemyAsset,
  PlayableCardAsset,
  SpriteSheetAsset,
} from "@resync-game-framework/api";
import {
  buildTowerContent,
  characterBlurb,
  characterName,
  EMPTY_TOWER_CATALOG,
  listTowerChoices,
  shorten,
  type TowerCatalog,
  toUnitSprite,
} from "../buildTowerContent";
import { BUILT_IN_ENEMIES, BUILT_IN_TOWER } from "../builtInContent";

/**
 * @param slot - Slot fields that differ from the defaults
 * @returns A ready slot
 */
function slot(
  slot: Partial<DungeonSlot> & Pick<DungeonSlot, "id" | "kind">,
): DungeonSlot {
  return {
    prompt: `${slot.id} prompt`,
    status: "ready",
    title: slot.id,
    ...slot,
  } as DungeonSlot;
}

const CHARACTER: CardCharacterSetAsset = {
  createdAt: "2026-10-18T00:00:00.000Z",
  levels: [1, 2, 3, 4].map((level) => ({
    description: "Holds a lantern shield",
    fileName: `level-${level}.webp`,
    level: level as 1 | 2 | 3 | 4,
    title: `Warden ${level}`,
    url: `https://cdn.test/char/level-${level}.webp`,
  })),
  prompt:
    "Create a four-level portrait set for 'Mira Vell, Lantern Warden', a shield guardian.",
  setId: "set-1",
  theme: "A guardian of the gate",
};

const CARD: PlayableCardAsset = {
  aetherCost: 1,
  cardId: "card-1",
  createdAt: "2026-10-18T00:00:00.000Z",
  description: "The lantern remembers.",
  effects: [{ amount: 7, kind: "defend", text: "Gain 7 block." }],
  imageFileName: "card.webp",
  imageUrl: "https://cdn.test/card-1.webp",
  kind: "defend",
  loreSources: [],
  name: "Lantern Ward",
  prompt: "",
};

const ENEMY: EnemyAsset = {
  createdAt: "2026-10-18T00:00:00.000Z",
  description: "A corrupted construct.",
  id: "enemy-1",
  imageUrl: "https://cdn.test/enemy.webp",
  maxHitPoints: 36,
  pattern: [
    { amount: 9, kind: "attack", text: "Low lunging strike: Deal 9 damage." },
  ],
  prompt: "",
  title: "Resonant Tollhound",
};

const SPRITE: SpriteSheetAsset = {
  anchorUrl: "https://cdn.test/sprite/anchor.png",
  animations: (["idle", "attack", "defend", "hurt"] as const).map((kind) => ({
    description: `${kind} frames`,
    fps: kind === "attack" ? 12 : 8,
    frameCount: 6,
    kind,
    label: kind,
    loop: kind === "idle",
    stripUrl: `https://cdn.test/sprite/${kind}.png`,
  })),
  createdAt: "2026-10-18T00:00:00.000Z",
  description: "Mira in pixel art",
  facing: "right",
  frameHeight: 180,
  frameWidth: 140,
  id: "sprite-1",
  prompt: "",
  sheetUrl: "https://cdn.test/sprite/sheet.webp",
  title: "Mira Vell",
};

const DUNGEON: DungeonBlueprint = {
  createdAt: "2026-10-18T00:00:00.000Z",
  id: "dungeon-1",
  jsonUrl: "",
  prompt: "Lantern Ford waystation. Relight the beacon.",
  slots: [
    slot({ assetId: "bg-1", id: "room-1", kind: "battle-background" }),
    slot({ id: "room-2", kind: "battle-background", status: "planned" }),
    slot({
      assetId: "set-1",
      id: "char-1",
      kind: "card-character",
      title: "Mira Vell",
    }),
    slot({
      id: "char-2",
      kind: "card-character",
      prompt: "An archer with a bow",
      status: "planned",
      title: "Ilyan Rook",
    }),
    slot({
      assetId: "card-1",
      characterSlotId: "char-1",
      id: "card-1-1",
      kind: "playable-card",
      level: 1,
    }),
    slot({
      assetId: "sprite-1",
      id: "char-1-sprite",
      kind: "sprite-sheet",
      ownerSlotId: "char-1",
    }),
    slot({
      id: "char-2-sprite",
      kind: "sprite-sheet",
      ownerSlotId: "char-2",
      status: "planned",
    }),
    slot({ assetId: "enemy-1", id: "enemy-a", kind: "enemy" }),
    slot({
      assetId: "sprite-1",
      id: "enemy-a-sprite",
      kind: "sprite-sheet",
      ownerSlotId: "enemy-a",
    }),
    slot({
      id: "enemy-b",
      kind: "enemy",
      status: "planned",
      title: "Hollow Warden",
    }),
    slot({
      id: "enemy-b-sprite",
      kind: "sprite-sheet",
      ownerSlotId: "enemy-b",
      status: "planned",
    }),
    {
      assetId: "audio-room",
      cue: "room",
      id: "room-1-room",
      kind: "audio",
      loop: true,
      ownerSlotId: "room-1",
      preview: {
        audioUrl: "https://cdn.test/room.mp3",
        subtitle: "ambience · room",
        title: "Gate tone",
      },
      prompt: "Rain on stone",
      role: "ambience",
      status: "ready",
      title: "Gate tone",
    },
    {
      assetId: "audio-attack",
      cue: "attack",
      id: "enemy-a-attack",
      kind: "audio",
      loop: false,
      ownerSlotId: "enemy-a",
      preview: {
        audioUrl: "https://cdn.test/attack.mp3",
        subtitle: "effect · attack",
        title: "Lantern slam",
      },
      prompt: "A lantern slammed shut",
      role: "effect",
      status: "ready",
      title: "Lantern slam",
    },
    {
      assetId: "audio-battle",
      cue: "battle",
      id: "dungeon-1-audio-battle",
      kind: "audio",
      loop: true,
      preview: {
        audioUrl: "https://cdn.test/battle.mp3",
        subtitle: "music · battle",
        title: "Battle music",
      },
      prompt: "A driving bed",
      role: "music",
      status: "ready",
      title: "Battle music",
    },
    {
      assetId: "audio-victory",
      cue: "victory",
      id: "dungeon-1-audio-victory",
      kind: "audio",
      loop: false,
      preview: {
        audioUrl: "https://cdn.test/victory.mp3",
        subtitle: "effect · victory",
        title: "Victory stinger",
      },
      prompt: "Bright bells",
      role: "effect",
      status: "ready",
      title: "Victory stinger",
    },
  ],
  summary: "Relight the beacon before the procession.",
};

const CATALOG: TowerCatalog = {
  audio: [],
  backgrounds: [
    {
      createdAt: "",
      description: "A rain-wet gate court.",
      id: "bg-1",
      imageUrl: "https://cdn.test/bg.webp",
      prompt: "",
      title: "The Processional Gate",
    },
  ],
  cards: [CARD],
  characters: [CHARACTER],
  dungeons: [DUNGEON],
  enemies: [ENEMY],
  spriteSheets: [SPRITE],
};

describe("listTowerChoices", () => {
  test("lists dungeons, then the gallery, then the built-in tower", () => {
    const choices = listTowerChoices(CATALOG);
    expect(choices.map((choice) => choice.source)).toEqual([
      "dungeon",
      "gallery",
      "built-in",
    ]);
    expect(choices[0]).toMatchObject({
      readySlots: 10,
      title: "Lantern Ford waystation",
      totalSlots: 15,
    });
  });

  test("an empty workshop still offers the built-in tower", () => {
    expect(
      listTowerChoices(EMPTY_TOWER_CATALOG).map((choice) => choice.source),
    ).toEqual(["built-in"]);
  });
});

describe("buildTowerContent from a dungeon", () => {
  const choice = listTowerChoices(CATALOG)[0];
  if (!choice) {
    throw new Error("expected a dungeon choice");
  }
  const content = buildTowerContent(choice, CATALOG);

  test("uses linked portraits and cards, filling missing tiers", () => {
    const mira = content.coreborn.find((entry) => entry.id === "char-1");
    expect(mira?.name).toBe("Mira Vell");
    expect(mira?.role).toBe("guardian");
    expect(mira?.tiers.map((tier) => tier.portraitUrl)).toEqual(
      CHARACTER.levels.map((level) => level.url),
    );
    expect(mira?.tiers[0]?.card).toMatchObject({
      flavor: CARD.description,
      id: "card-1",
      imageUrl: CARD.imageUrl,
    });
    expect(mira?.tiers[3]?.card.rules.name).toBe("Lantern Ward +3");
  });

  test("a character with a linked sprite sheet fights as that sprite", () => {
    const mira = content.coreborn.find((entry) => entry.id === "char-1");
    expect(mira?.sprite).toEqual(toUnitSprite(SPRITE));
    expect(mira?.sprite?.animations.attack).toEqual({
      fps: 12,
      frameCount: 6,
      loop: false,
      stripUrl: "https://cdn.test/sprite/attack.png",
    });
    const rook = content.coreborn.find((entry) => entry.id === "char-2");
    expect(rook?.sprite).toBeUndefined();
  });

  test("an enemy with a linked sprite sheet fights as that sprite", () => {
    const [generated, standIn] = content.enemies;
    expect(generated?.sprite).toEqual(toUnitSprite(SPRITE));
    expect(standIn?.name).toBe("Hollow Warden");
    expect(standIn?.sprite).toBeUndefined();
  });

  test("an ungenerated character still plays with stand-in cards", () => {
    const rook = content.coreborn.find((entry) => entry.id === "char-2");
    expect(rook?.role).toBe("striker");
    expect(rook?.tiers.every((tier) => tier.portraitUrl === undefined)).toBe(
      true,
    );
    expect(rook?.tiers).toHaveLength(4);
  });

  test("ungenerated enemies borrow a built-in fighter under the slot's name", () => {
    expect(content.enemies[0]?.moves[0]?.target).toBe("back");
    expect(content.enemies[1]).toMatchObject({
      id: "enemy-b",
      name: "Hollow Warden",
    });
    expect(content.enemies[1]?.moves).toEqual(BUILT_IN_ENEMIES[1]?.moves ?? []);
  });

  test("rooms keep art when linked and the slot's words when not", () => {
    expect(content.scenes.map((scene) => scene.title)).toEqual([
      "The Processional Gate",
      "room-2",
    ]);
    expect(content.scenes[1]?.imageUrl).toBeUndefined();
  });

  test("plays generated room tone, attacks, music, and stingers", () => {
    expect(content.scenes[0]?.ambienceUrl).toBe("https://cdn.test/room.mp3");
    expect(content.scenes[1]?.ambienceUrl).toBeUndefined();
    expect(content.enemies[0]?.attackSoundUrl).toBe(
      "https://cdn.test/attack.mp3",
    );
    expect(content.enemies[1]?.attackSoundUrl).toBeUndefined();
    expect(content.soundtrack).toEqual({
      music: { battle: "https://cdn.test/battle.mp3" },
      stingers: { victory: "https://cdn.test/victory.mp3" },
    });
  });
});

describe("buildTowerContent fallbacks", () => {
  test("the built-in choice ignores the catalog", () => {
    const builtIn = listTowerChoices(CATALOG).at(-1);
    expect(builtIn && buildTowerContent(builtIn, CATALOG)).toBe(BUILT_IN_TOWER);
  });

  test("the gallery offers generated cards as cultivator techniques", () => {
    const gallery = listTowerChoices(CATALOG)[1];
    const content = gallery && buildTowerContent(gallery, CATALOG);
    expect(content?.techniques[0]?.id).toBe("card-1");
    expect(content?.coreborn[0]?.name).toBe("Mira Vell, Lantern Warden");
  });
});

describe("text helpers", () => {
  test("characterName reads the quoted name, else the first level title", () => {
    expect(characterName(CHARACTER)).toBe("Mira Vell, Lantern Warden");
    expect(characterName({ ...CHARACTER, prompt: "No quotes here" })).toBe(
      "Warden 1",
    );
  });

  test("characterBlurb drops the request wording and quotes", () => {
    expect(characterBlurb(CHARACTER.prompt)).toBe(
      "Mira Vell, Lantern Warden, a shield guardian.",
    );
  });

  test("shorten keeps whole sentences within the limit", () => {
    expect(shorten("One. Two two. Three three three.", 15)).toBe(
      "One. Two two.",
    );
    expect(shorten("short")).toBe("short");
  });
});
