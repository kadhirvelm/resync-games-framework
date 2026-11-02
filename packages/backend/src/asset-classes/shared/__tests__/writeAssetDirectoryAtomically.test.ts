import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeAssetDirectoryAtomically } from "../writeAssetDirectoryAtomically";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { force: true, recursive: true });
  root = "";
});

describe("writeAssetDirectoryAtomically", () => {
  test("does not expose an incomplete asset when writing fails", async () => {
    root = await mkdtemp(join(tmpdir(), "atomic-asset-"));
    const destination = join(root, "generation-id");

    await expect(
      writeAssetDirectoryAtomically(destination, async (pending) => {
        await writeFile(join(pending, "image.webp"), "partial");
        throw new Error("manifest failed");
      }),
    ).rejects.toThrow("manifest failed");

    expect(await readdir(root)).toEqual([]);
  });

  test("keeps the first complete publication when a retry races", async () => {
    root = await mkdtemp(join(tmpdir(), "atomic-asset-"));
    const destination = join(root, "generation-id");
    await writeAssetDirectoryAtomically(destination, (pending) =>
      writeFile(join(pending, "manifest.json"), "first"),
    );
    await writeAssetDirectoryAtomically(destination, (pending) =>
      writeFile(join(pending, "manifest.json"), "retry"),
    );

    expect(await readFile(join(destination, "manifest.json"), "utf8")).toBe(
      "first",
    );
    expect(await readdir(root)).toEqual(["generation-id"]);
  });
});
