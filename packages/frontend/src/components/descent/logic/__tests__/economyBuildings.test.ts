import { describe, expect, test } from "bun:test";
import type { DescentPresentation } from "../../views/presentation";
import { createAshenGateSim } from "../ashenGateSlice";
import type { HoldTier } from "../economy/model";

/** Reads the Ashen Gate UI bag published by the slice at a given Hold tier. */
function presentationAtTier(tier?: HoldTier): DescentPresentation {
  const sim = createAshenGateSim({ seed: 17 });
  if (tier !== undefined) {
    const save = JSON.parse(sim.serialize()) as {
      state?: { meta?: { economy?: { tier?: HoldTier } } };
    };
    if (save.state?.meta?.economy !== undefined) {
      save.state.meta.economy.tier = tier;
    }
    sim.load(JSON.stringify(save));
    sim.step(1);
  }
  return sim.snapshot().meta.ui as DescentPresentation;
}

describe("Ashen Gate renewable economy buildings", () => {
  test("unlocks economy buildings gradually across Hold tiers", () => {
    const campIds = presentationAtTier("Camp").buildOptions?.map(
      (option) => option.buildingType,
    );
    expect(campIds).toContain("well");
    expect(campIds).not.toContain("farm");
    expect(campIds).not.toContain("hell_market");
    expect(campIds).not.toContain("spirit_herb_garden");

    const outpostIds = presentationAtTier("Outpost").buildOptions?.map(
      (option) => option.buildingType,
    );
    expect(outpostIds).toContain("farm");
    expect(outpostIds).not.toContain("hell_market");

    const strongholdIds = presentationAtTier("Stronghold").buildOptions?.map(
      (option) => option.buildingType,
    );
    expect(strongholdIds).toContain("hell_market");
    expect(strongholdIds).not.toContain("spirit_herb_garden");

    const citadelIds = presentationAtTier("Citadel").buildOptions?.map(
      (option) => option.buildingType,
    );
    expect(citadelIds).toContain("spirit_herb_garden");
  });

  test("the market offers Food, Water, and Wood sales for Coin", () => {
    const rates = presentationAtTier().marketRates ?? [];
    expect(rates.map((rate) => [rate.sell, rate.buy])).toEqual([
      ["food", "coin"],
      ["water", "coin"],
      ["wood", "coin"],
    ]);
  });
});
