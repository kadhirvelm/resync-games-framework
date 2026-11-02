import { describe, expect, test } from "bun:test";
import { ASSET_CLASSES } from "../assetClassRegistry";
import { THREE_D_ASSET_CLASSES } from "../threeDAssetClasses";

describe("3D asset workshop tabs", () => {
  test("registers worlds and each model kind as separate tabs", () => {
    expect(THREE_D_ASSET_CLASSES.map((assetClass) => assetClass.id)).toEqual([
      "three-d-worlds",
      "three-d-characters",
      "three-d-props",
      "three-d-environments",
    ]);
    expect(
      ASSET_CLASSES.filter((assetClass) => assetClass.medium === "3d").map(
        (assetClass) => assetClass.tabLabel,
      ),
    ).toEqual(["Worlds", "Characters", "Props", "Environments"]);
  });

  test("keeps every 3D tab inside one readable sidebar category", () => {
    expect(
      new Set(THREE_D_ASSET_CLASSES.map((assetClass) => assetClass.category)),
    ).toEqual(new Set(["Models"]));
  });
});
