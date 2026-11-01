import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyDungeonSlotUpdate,
  DEFAULT_ENEMY_SPRITE_PROMPT,
  DEFAULT_SPRITE_PROMPT,
  defaultSpriteSlotId,
  readStoredDungeonBlueprint,
  readStoredDungeonBlueprints,
  type StoredDungeonBlueprint,
  withUnitSprites,
  writeStoredDungeonBlueprint,
} from "../dungeonBlueprint";
import { DUNGEON_FILE_NAME } from "../dungeonStorage";

const DUNGEON_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SLOT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { force: true, recursive: true });
    root = undefined;
  }
});

describe("dungeon package files", () => {
  test("writes a package that can be read back", async () => {
    root = await mkdtemp(join(tmpdir(), "dungeon-package-"));
    await writeStoredDungeonBlueprint(root, samplePackage());

    const text = await readFile(
      join(root, DUNGEON_ID, DUNGEON_FILE_NAME),
      "utf8",
    );
    const read = await readStoredDungeonBlueprint(root, DUNGEON_ID);
    const listed = await readStoredDungeonBlueprints(root);

    expect(JSON.parse(text).slots[0].prompt).toBe("A flooded bell chamber");
    expect(read?.summary).toBe("A drowned belfry.");
    expect(listed.map((blueprint) => blueprint.id)).toEqual([DUNGEON_ID]);
  });

  test("records an attached asset on the slot", async () => {
    root = await mkdtemp(join(tmpdir(), "dungeon-package-"));
    const stored = samplePackage();
    const [slot] = stored.slots;
    if (slot === undefined) {
      throw new Error("Sample package has no slot.");
    }
    stored.slots = [
      applyDungeonSlotUpdate(slot, {
        assetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        clearError: true,
        status: "ready",
      }),
    ];
    await writeStoredDungeonBlueprint(root, stored);

    const read = await readStoredDungeonBlueprint(root, DUNGEON_ID);

    expect(read?.slots[0]).toEqual({
      assetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      id: SLOT_ID,
      kind: "enemy",
      prompt: "A flooded bell chamber",
      status: "ready",
      title: "Bell beast",
    });
  });

  test("adds a sprite slot after each character's cards and each enemy", async () => {
    root = await mkdtemp(join(tmpdir(), "dungeon-package-"));
    const characterId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const stored = samplePackage();
    stored.slots = [
      {
        id: characterId,
        kind: "card-character",
        prompt: "A drowned bell keeper",
        status: "planned",
        title: "Bell keeper",
      },
      {
        characterSlotId: characterId,
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        kind: "playable-card",
        level: 1,
        prompt: "Ring the bell",
        status: "planned",
        title: "Bell ring",
      },
      ...stored.slots,
    ];
    await writeStoredDungeonBlueprint(root, stored);

    const read = await readStoredDungeonBlueprint(root, DUNGEON_ID);
    const readAgain = await readStoredDungeonBlueprint(root, DUNGEON_ID);

    expect(read?.slots.map((slot) => slot.kind)).toEqual([
      "card-character",
      "playable-card",
      "sprite-sheet",
      "enemy",
      "sprite-sheet",
    ]);
    expect(read?.slots[2]).toEqual({
      id: defaultSpriteSlotId(characterId),
      kind: "sprite-sheet",
      ownerSlotId: characterId,
      prompt: DEFAULT_SPRITE_PROMPT,
      status: "planned",
      title: "Bell keeper sprite",
    });
    expect(read?.slots[4]).toEqual({
      id: defaultSpriteSlotId(SLOT_ID),
      kind: "sprite-sheet",
      ownerSlotId: SLOT_ID,
      prompt: DEFAULT_ENEMY_SPRITE_PROMPT,
      status: "planned",
      title: "Bell beast sprite",
    });
    expect(readAgain).toEqual(read);
  });

  test("places an added enemy sprite right after its enemy", () => {
    const stored = samplePackage();
    stored.slots = [
      ...stored.slots,
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "battle-background",
        prompt: "A flooded bell chamber",
        status: "planned",
        title: "Bell chamber",
      },
    ];

    const filled = withUnitSprites(stored);

    expect(filled.slots.map((slot) => slot.kind)).toEqual([
      "enemy",
      "sprite-sheet",
      "battle-background",
    ]);
    expect(filled.slots[1]?.prompt).toContain("facing left");
  });

  test("leaves a package whose characters and enemies already have sprites unchanged", () => {
    const stored = samplePackage();
    stored.slots = [
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        kind: "card-character",
        prompt: "A drowned bell keeper",
        status: "planned",
        title: "Bell keeper",
      },
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        kind: "sprite-sheet",
        ownerSlotId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        prompt: "Swings a bell hammer",
        status: "planned",
        title: "Bell keeper sprite",
      },
      {
        id: SLOT_ID,
        kind: "enemy",
        prompt: "A moss-covered bell beast",
        status: "planned",
        title: "Bell beast",
      },
      {
        id: "99999999-9999-4999-8999-999999999999",
        kind: "sprite-sheet",
        ownerSlotId: SLOT_ID,
        prompt: "Rears up and slams its shell",
        status: "planned",
        title: "Bell beast sprite",
      },
    ];

    expect(withUnitSprites(stored)).toBe(stored);
  });
});

/**
 * @returns A one-slot package
 */
function samplePackage(): StoredDungeonBlueprint {
  return {
    createdAt: "2026-10-18T00:00:00.000Z",
    id: DUNGEON_ID,
    prompt: "A drowned bell tower",
    slots: [
      {
        id: SLOT_ID,
        kind: "enemy" as const,
        prompt: "A flooded bell chamber",
        status: "planned" as const,
        title: "Bell beast",
      },
    ],
    summary: "A drowned belfry.",
  };
}
