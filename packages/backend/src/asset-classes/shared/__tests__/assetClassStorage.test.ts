import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  buildPublicAssetUrlPath,
  getPublicAssetsRootPath,
} from "src/library/publicAssetsRoot";
import { createAssetClassStorage } from "../assetClassStorage";

describe("createAssetClassStorage", () => {
  const storage = createAssetClassStorage("card-characters");

  test("places files in the class folder under the public root", () => {
    expect(storage.rootPath()).toBe(
      join(getPublicAssetsRootPath(), "card-characters"),
    );
    expect(storage.filePath("set-1", "level-1.webp")).toBe(
      join(
        getPublicAssetsRootPath(),
        "card-characters",
        "set-1",
        "level-1.webp",
      ),
    );
  });

  test("builds public paths and absolute URLs", () => {
    expect(storage.publicPath("set-1", "level-1.webp")).toBe(
      "/static/card-characters/set-1/level-1.webp",
    );
    expect(
      storage.publicUrl("https://backend.test/", "set 1", "level-1.webp"),
    ).toBe("https://backend.test/static/card-characters/set%201/level-1.webp");
  });
});

describe("getPublicAssetsRootPath", () => {
  test("uses src/public outside production", () => {
    expect(getPublicAssetsRootPath().endsWith(join("src", "public"))).toBe(
      true,
    );
  });

  test("uses the shared volume override for distributed workers", () => {
    const original = process.env.PUBLIC_ASSETS_ROOT;
    process.env.PUBLIC_ASSETS_ROOT = "/tmp/towers-shared-assets";
    try {
      expect(getPublicAssetsRootPath()).toBe("/tmp/towers-shared-assets");
    } finally {
      if (original === undefined) delete process.env.PUBLIC_ASSETS_ROOT;
      else process.env.PUBLIC_ASSETS_ROOT = original;
    }
  });
});

describe("buildPublicAssetUrlPath", () => {
  test("splits nested segments and drops empty ones", () => {
    expect(buildPublicAssetUrlPath("card-characters", "set/a b.png", "")).toBe(
      "/static/card-characters/set/a%20b.png",
    );
  });
});
