import { describe, expect, test } from "bun:test";
import {
  ASHEN_GATE_3D_ASSETS,
  assetRoleForBuilding,
  resolveAshenGateAssets,
} from "../../data/layers/ashen_gate/threeDAssets";
import { buildingIconSrc } from "../buildingIcons";

describe("Stone Quarry presentation", () => {
  test("routes the building to its canonical generated prop", () => {
    expect(assetRoleForBuilding("stone_quarry")).toBe("stoneQuarry");
    expect(ASHEN_GATE_3D_ASSETS).toContainEqual({
      kind: "prop",
      name: "Descent Stone Quarry",
      role: "stoneQuarry",
    });
    expect(resolveAshenGateAssets([]).stoneQuarry).toBeUndefined();
  });

  test("uses the existing mine icon as a fallback", () => {
    expect(buildingIconSrc("stone_quarry")).toBe(buildingIconSrc("deep_mine"));
  });
});
