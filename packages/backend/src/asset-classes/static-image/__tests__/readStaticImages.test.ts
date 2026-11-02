import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { readStaticImage, readStaticImages } from "../readStaticImages";
import {
  STATIC_IMAGE_FILE_NAME,
  STATIC_IMAGE_MANIFEST_FILE_NAME,
} from "../staticImageSpec";
import { STATIC_IMAGE_STORAGE } from "../staticImageStorage";

const ASSET_ID = "static-image-reader-test";

describe("readStaticImages", () => {
  afterEach(async () => {
    await rm(STATIC_IMAGE_STORAGE.filePath(ASSET_ID), {
      force: true,
      recursive: true,
    });
  });

  test("reads a complete asset with its public image URL", async () => {
    await writeFixture();
    const asset = await readStaticImage(
      STATIC_IMAGE_STORAGE.rootPath(),
      ASSET_ID,
      "https://backend.test/static/static-images",
    );

    expect(asset?.title).toBe("Golden Wheat");
    expect(asset?.imageUrl).toBe(
      `https://backend.test/static/static-images/${ASSET_ID}/image.webp`,
    );
  });

  test("skips an asset whose image is missing", async () => {
    await writeFixture();
    await rm(STATIC_IMAGE_STORAGE.filePath(ASSET_ID, STATIC_IMAGE_FILE_NAME));

    const assets = await readStaticImages(
      STATIC_IMAGE_STORAGE.rootPath(),
      "https://backend.test/static/static-images",
    );
    expect(assets.some((asset) => asset.id === ASSET_ID)).toBe(false);
  });
});

/** Writes one complete static-image fixture. */
async function writeFixture(): Promise<void> {
  const directory = STATIC_IMAGE_STORAGE.filePath(ASSET_ID);
  await mkdir(directory, { recursive: true });
  await writeFile(
    STATIC_IMAGE_STORAGE.filePath(ASSET_ID, STATIC_IMAGE_MANIFEST_FILE_NAME),
    JSON.stringify({
      aspectRatio: "1:1",
      createdAt: "2026-01-01T00:00:00.000Z",
      description: "A tied golden wheat sheaf on transparent alpha.",
      id: ASSET_ID,
      imageSize: "1K",
      prompt: "a golden wheat resource icon",
      title: "Golden Wheat",
    }),
  );
  await writeFile(
    STATIC_IMAGE_STORAGE.filePath(ASSET_ID, STATIC_IMAGE_FILE_NAME),
    "webp",
  );
}
