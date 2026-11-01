import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readSpriteSheet, readSpriteSheets } from "../readSpriteSheets";
import {
  SPRITE_SHEET_ANCHOR_FILE_NAME,
  SPRITE_SHEET_ANIMATIONS,
  SPRITE_SHEET_MANIFEST_FILE_NAME,
  SPRITE_SHEET_SOURCE_FILE_NAME,
  spriteAnimationFileName,
} from "../spriteSheetSpec";
import { SPRITE_SHEET_STORAGE } from "../spriteSheetStorage";

const ASSET_ID = "sprite-sheet-reader-test";
const BASE_URL = "https://backend.test/static/sprite-sheets";

describe("readSpriteSheets", () => {
  afterEach(async () => {
    await rm(SPRITE_SHEET_STORAGE.filePath(ASSET_ID), {
      force: true,
      recursive: true,
    });
  });

  test("reads a complete sheet with one strip URL per animation", async () => {
    await writeFixture();

    const asset = await readSpriteSheet(
      SPRITE_SHEET_STORAGE.rootPath(),
      ASSET_ID,
      BASE_URL,
    );

    expect(asset?.title).toBe("Ember Smith");
    expect(asset?.facing).toBe("right");
    expect(asset?.frameWidth).toBe(120);
    expect(asset?.animations.map((animation) => animation.kind)).toEqual([
      "idle",
      "attack",
      "defend",
      "hurt",
    ]);
    expect(asset?.animations[1]?.stripUrl).toBe(
      `${BASE_URL}/${ASSET_ID}/attack.png`,
    );
    expect(asset?.anchorUrl).toBe(`${BASE_URL}/${ASSET_ID}/anchor.png`);
    expect(asset?.sheetUrl).toBe(`${BASE_URL}/${ASSET_ID}/sheet.webp`);
  });

  test("skips a sheet whose animation strip is missing", async () => {
    await writeFixture();
    await rm(SPRITE_SHEET_STORAGE.filePath(ASSET_ID, "hurt.png"));

    const sheets = await readSpriteSheets(
      SPRITE_SHEET_STORAGE.rootPath(),
      BASE_URL,
    );

    expect(sheets.some((sheet) => sheet.id === ASSET_ID)).toBe(false);
  });

  test("skips a sheet with an unreadable manifest", async () => {
    await writeFixture();
    await writeFile(
      SPRITE_SHEET_STORAGE.filePath(ASSET_ID, SPRITE_SHEET_MANIFEST_FILE_NAME),
      "{",
    );

    expect(
      await readSpriteSheet(
        SPRITE_SHEET_STORAGE.rootPath(),
        ASSET_ID,
        BASE_URL,
      ),
    ).toBeUndefined();
  });
});

/** Writes one complete sprite-sheet fixture. */
async function writeFixture(): Promise<void> {
  await mkdir(SPRITE_SHEET_STORAGE.filePath(ASSET_ID), { recursive: true });
  await writeFile(
    SPRITE_SHEET_STORAGE.filePath(ASSET_ID, SPRITE_SHEET_MANIFEST_FILE_NAME),
    JSON.stringify({
      animations: SPRITE_SHEET_ANIMATIONS.map((animation) => ({
        description: animation.description,
        fps: animation.fps,
        frameCount: 6,
        kind: animation.kind,
        label: animation.label,
        loop: animation.loop,
      })),
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "A forge-keeper of the Spire.",
      facing: "right",
      frameHeight: 160,
      frameWidth: 120,
      id: ASSET_ID,
      prompt: "a forge-keeper",
      title: "Ember Smith",
    }),
  );
  const files = [
    SPRITE_SHEET_ANCHOR_FILE_NAME,
    SPRITE_SHEET_SOURCE_FILE_NAME,
    ...SPRITE_SHEET_ANIMATIONS.map((animation) =>
      spriteAnimationFileName(animation.kind),
    ),
  ];
  await Promise.all(
    files.map((fileName) =>
      writeFile(SPRITE_SHEET_STORAGE.filePath(ASSET_ID, fileName), "png"),
    ),
  );
}
