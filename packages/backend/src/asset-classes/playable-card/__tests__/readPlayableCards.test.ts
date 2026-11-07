import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { readPlayableCard, readPlayableCards } from "../readPlayableCards";

describe("readPlayableCards", () => {
  test("returns newest complete cards and skips invalid directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "playable-cards-"));

    try {
      await writeCard(root, "older-card", "2026-01-01T00:00:00.000Z", true);
      await writeCard(root, "newer-card", "2026-06-01T00:00:00.000Z", true);
      await writeCard(root, "broken-card", "2026-07-01T00:00:00.000Z", false);
      await mkdir(join(root, "notes-only"));

      const cards = await readPlayableCards(
        root,
        "https://backend.test/static/playable-cards",
      );

      expect(cards.map((card) => card.cardId)).toEqual([
        "newer-card",
        "older-card",
      ]);
      expect(cards[0]?.imageUrl).toBe(
        "https://backend.test/static/playable-cards/newer-card/card.webp",
      );
      expect(cards[0]?.loreSources[0]?.title).toBe("Lore");
      expect(
        await readPlayableCard(
          root,
          "broken-card",
          "https://backend.test/static/playable-cards",
        ),
      ).toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

/**
 * @param root - Temp static root
 * @param cardId - Folder name
 * @param createdAt - Manifest timestamp
 * @param includeImage - Whether to write the WebP illustration
 */
async function writeCard(
  root: string,
  cardId: string,
  createdAt: string,
  includeImage: boolean,
) {
  const directory = join(root, cardId);
  await mkdir(directory);
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify({
      aetherCost: 1,
      cardId,
      createdAt,
      description: "A floor 4 bond.",
      effects: [
        { amount: 6, kind: "attack", text: "Deal 6 damage to one enemy." },
      ],
      imageFileName: "card.webp",
      kind: "attack",
      loreSources: [
        {
          documentId: "lore-document",
          excerpt: "Tamsin Korr bonded a Coreborn on floor 4.",
          title: "Lore",
          url: "https://app.productnow.ai/lore",
        },
      ],
      name: "Floor 4 Bond",
      prompt: "a bond card",
    }),
  );
  if (!includeImage) {
    return;
  }
  await sharp({
    create: {
      background: { alpha: 1, b: 20, g: 40, r: 10 },
      channels: 4,
      height: 32,
      width: 24,
    },
  })
    .webp()
    .toFile(join(directory, "card.webp"));
}
