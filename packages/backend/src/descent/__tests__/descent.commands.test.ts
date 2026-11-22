import { describe, expect, test } from "bun:test";
import { isDescentWireCommand } from "../descent.commands";

describe("Descent wire commands", () => {
  test("accepts shift-queued building placement", () => {
    expect(
      isDescentWireCommand({
        builderIds: ["villager-1", "villager-2"],
        buildingType: "wall",
        queue: true,
        type: "place_building",
        x: 12,
        y: 8,
      }),
    ).toBe(true);
  });

  test("rejects a non-boolean placement queue flag", () => {
    expect(
      isDescentWireCommand({
        buildingType: "barracks",
        queue: "true",
        type: "place_building",
        x: 12,
        y: 8,
      }),
    ).toBe(false);
  });
});
