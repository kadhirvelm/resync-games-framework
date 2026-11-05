import { describe, expect, test } from "bun:test";
import type { DescentPresentation } from "../../views/presentation";
import { createAshenGateSim } from "../ashenGateSlice";

/** Reads the Ashen Gate UI bag published by the slice. */
function presentation(): DescentPresentation {
  const snapshot = createAshenGateSim({ seed: 17 }).snapshot();
  return snapshot.meta.ui as DescentPresentation;
}

describe("Ashen Gate renewable economy buildings", () => {
  test("publishes every new building in the live build menu", () => {
    const ids = presentation().buildOptions?.map(
      (option) => option.buildingType,
    );
    expect(ids).toContain("well");
    expect(ids).toContain("farm");
    expect(ids).toContain("forest");
    expect(ids).toContain("spirit_herb_garden");
    expect(ids).toContain("hell_market");
  });

  test("the market offers Food, Water, and Wood sales for Coin", () => {
    const rates = presentation().marketRates ?? [];
    expect(rates.map((rate) => [rate.sell, rate.buy])).toEqual([
      ["food", "coin"],
      ["water", "coin"],
      ["wood", "coin"],
    ]);
  });
});
