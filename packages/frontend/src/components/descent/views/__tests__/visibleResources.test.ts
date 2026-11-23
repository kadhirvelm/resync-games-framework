import { describe, expect, test } from "bun:test";
import type { ResourceId, ResourceStockpile } from "../../logic/types";
import { visibleResourceIds } from "../visibleResources";

/**
 * Creates a zeroed resource stockpile with optional overrides.
 * @param overrides - Non-zero resource amounts
 * @returns Full resource stockpile
 */
function stockpile(
  overrides: Partial<ResourceStockpile> = {},
): ResourceStockpile {
  return {
    coin: 0,
    essence: 0,
    food: 0,
    iron: 0,
    spirit_herbs: 0,
    stone: 0,
    water: 0,
    wood: 0,
    ...overrides,
  };
}

describe("visibleResourceIds", () => {
  test("shows only the 4 starting resources at Camp with empty frontier stockpiles", () => {
    expect(
      visibleResourceIds({
        holdTier: "Camp",
        resources: stockpile({ food: 60, stone: 40, water: 50, wood: 70 }),
      }),
    ).toEqual(["food", "water", "wood", "stone"]);
  });

  test("always shows the 4 starting resources even when their stockpiles are 0", () => {
    expect(
      visibleResourceIds({
        holdTier: "Camp",
        resources: stockpile(),
      }),
    ).toEqual(["food", "water", "wood", "stone"]);
  });

  test("reveals a frontier resource when its stockpile is greater than 0", () => {
    expect(
      visibleResourceIds({
        holdTier: "Camp",
        resources: stockpile({ essence: 5, spirit_herbs: 1 }),
      }),
    ).toEqual(["food", "water", "wood", "stone", "spirit_herbs", "essence"]);
  });

  test("reveals a frontier resource when an explored deposit is discovered", () => {
    const discovered = new Set<ResourceId>(["iron", "coin"]);
    expect(
      visibleResourceIds({
        discoveredResourceIds: discovered,
        holdTier: "Camp",
        resources: stockpile(),
      }),
    ).toEqual(["food", "water", "wood", "stone", "iron", "coin"]);
  });

  test("Outpost reveals iron and essence in canonical order", () => {
    expect(
      visibleResourceIds({
        holdTier: "Outpost",
        resources: stockpile(),
      }),
    ).toEqual(["food", "water", "wood", "stone", "iron", "essence"]);
  });

  test("Stronghold reveals coin in addition to Outpost resources", () => {
    expect(
      visibleResourceIds({
        holdTier: "Stronghold",
        resources: stockpile(),
      }),
    ).toEqual(["food", "water", "wood", "stone", "iron", "coin", "essence"]);
  });

  test("Citadel reveals all 8 resources including spirit_herbs", () => {
    expect(
      visibleResourceIds({
        holdTier: "Citadel",
        resources: stockpile(),
      }),
    ).toEqual([
      "food",
      "water",
      "wood",
      "stone",
      "iron",
      "coin",
      "spirit_herbs",
      "essence",
    ]);
  });
});
