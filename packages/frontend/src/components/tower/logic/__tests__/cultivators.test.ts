import { describe, expect, test } from "bun:test";
import type {
  CultivatorRecord,
  SpriteSheetAsset,
} from "@resync-game-framework/api";
import { BUILT_IN_CULTIVATOR, BUILT_IN_TOWER } from "../builtInContent";
import {
  cultivatorArtLine,
  cultivatorDefinition,
  isCultivatorPainting,
  withCultivator,
} from "../cultivators";

const SPRITE: SpriteSheetAsset = {
  anchorUrl: "anchor.png",
  animations: [
    {
      description: "Breathing",
      fps: 8,
      frameCount: 6,
      kind: "idle",
      label: "Idle",
      loop: true,
      stripUrl: "idle.png",
    },
  ],
  createdAt: "2026-11-01T00:00:00.000Z",
  description: "A cultivator",
  facing: "right",
  frameHeight: 128,
  frameWidth: 96,
  id: "sheet-1",
  prompt: "",
  sheetUrl: "sheet.png",
  title: "Lin Wei",
};

/**
 * @param change - Fields to override
 * @returns A cultivator record with no art
 */
function record(change: Partial<CultivatorRecord> = {}): CultivatorRecord {
  return {
    appearance: "Silver hair and a jade pin.",
    createdAt: "2026-11-01T00:00:00.000Z",
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Lin Wei",
    portrait: { status: "none" },
    sprite: { status: "none" },
    title: "Keeper of Ash",
    ...change,
  };
}

const PORTRAITS: CultivatorRecord["portrait"] = {
  asset: {
    createdAt: "2026-11-01T00:00:00.000Z",
    levels: [1, 2, 3, 4].map((level) => ({
      description: "",
      fileName: `level-${level}.webp`,
      level: level as 1 | 2 | 3 | 4,
      title: `Realm ${level}`,
      url: `realm-${level}.webp`,
    })),
    prompt: "",
    setId: "set-1",
    theme: "",
  },
  status: "ready",
};

describe("cultivatorDefinition", () => {
  test("keeps built-in stats under the cultivator's own identity and art", () => {
    const definition = cultivatorDefinition(
      record({
        portrait: PORTRAITS,
        sprite: { asset: SPRITE, status: "ready" },
      }),
    );
    expect(definition).toMatchObject({
      aetherPerTurn: BUILT_IN_CULTIVATOR.aetherPerTurn,
      maxHitPoints: BUILT_IN_CULTIVATOR.maxHitPoints,
      name: "Lin Wei",
      portraitUrl: "realm-1.webp",
      title: "Keeper of Ash",
    });
    expect(definition.realmPortraitUrls).toHaveLength(4);
    expect(definition.sprite?.animations.idle?.stripUrl).toBe("idle.png");
  });

  test("leaves art empty until it is painted", () => {
    const definition = cultivatorDefinition(record());
    expect(definition.portraitUrl).toBeUndefined();
    expect(definition.realmPortraitUrls).toBeUndefined();
    expect(definition.sprite).toBeUndefined();
  });
});

describe("withCultivator", () => {
  test("puts the identity on the tower and keeps the tower's kit", () => {
    const content = withCultivator(
      BUILT_IN_TOWER,
      cultivatorDefinition(record({ portrait: PORTRAITS })),
    );
    expect(content.cultivator.name).toBe("Lin Wei");
    expect(content.cultivator.starterDeck).toBe(
      BUILT_IN_TOWER.cultivator.starterDeck,
    );
    expect(content.coreborn).toBe(BUILT_IN_TOWER.coreborn);
  });
});

describe("art status", () => {
  test("describes what has been painted", () => {
    expect(cultivatorArtLine(record())).toBe("Not yet painted");
    expect(cultivatorArtLine(record({ portrait: PORTRAITS }))).toBe(
      "Portrait only",
    );
    expect(
      cultivatorArtLine(record({ sprite: { error: "x", status: "failed" } })),
    ).toBe("Painting failed");
  });

  test("notices a part being painted", () => {
    const painting = record({ sprite: { status: "painting" } });
    expect(isCultivatorPainting(painting)).toBe(true);
    expect(cultivatorArtLine(painting)).toBe("Being painted…");
    expect(isCultivatorPainting(record())).toBe(false);
  });
});
