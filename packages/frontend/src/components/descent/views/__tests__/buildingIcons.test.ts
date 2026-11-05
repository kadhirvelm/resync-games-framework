import { describe, expect, test } from "bun:test";
import { listBuildingDefs } from "../../logic/economy/tables";
import { buildingIconSrc } from "../buildingIcons";

describe("buildingIconSrc", () => {
  test("gives every economy building a painted icon", () => {
    for (const building of listBuildingDefs()) {
      expect(buildingIconSrc(building.id)).not.toBeNull();
    }
  });

  test("covers later-layer structures that can still be selected", () => {
    expect(buildingIconSrc("hearth_ward")).toBe(
      "/descent/building-icons/hearth_ward.png",
    );
    expect(buildingIconSrc("bone_reclaimer")).toBe(
      "/descent/building-icons/bone_reclaimer.png",
    );
  });

  test("leaves an unknown type without an icon", () => {
    expect(buildingIconSrc("not_a_building")).toBeNull();
  });
});
