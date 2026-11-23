import { describe, expect, test } from "bun:test";
import type { DescentPresentation } from "../../views/presentation";
import { createAshenGateSim } from "../ashenGateSlice";
import { buildingDef } from "../economy";
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
  test("keeps every building visible and unlocks it across Hold tiers", () => {
    const camp = presentationAtTier("Camp").buildOptions ?? [];
    expect(
      camp.find((option) => option.buildingType === "well")?.unlocked,
    ).toBe(true);
    expect(
      camp.find((option) => option.buildingType === "farm")?.unlocked,
    ).toBe(false);
    expect(
      camp.find((option) => option.buildingType === "forest"),
    ).toMatchObject({
      affordable: true,
      unlocked: true,
    });
    expect(
      camp.find((option) => option.buildingType === "hell_market")?.unlocked,
    ).toBe(false);
    expect(
      camp.find((option) => option.buildingType === "spirit_herb_garden")
        ?.unlocked,
    ).toBe(false);

    expect(
      camp.find((option) => option.buildingType === "stone_quarry")?.unlocked,
    ).toBe(true);

    const outpost = presentationAtTier("Outpost").buildOptions ?? [];
    expect(
      outpost.find((option) => option.buildingType === "stone_quarry")
        ?.unlocked,
    ).toBe(true);
    expect(
      outpost.find((option) => option.buildingType === "farm")?.unlocked,
    ).toBe(true);
    expect(
      outpost.find((option) => option.buildingType === "hell_market")?.unlocked,
    ).toBe(false);

    const stronghold = presentationAtTier("Stronghold").buildOptions ?? [];
    expect(
      stronghold.find((option) => option.buildingType === "hell_market")
        ?.unlocked,
    ).toBe(true);
    expect(
      stronghold.find((option) => option.buildingType === "spirit_herb_garden")
        ?.unlocked,
    ).toBe(false);

    const citadel = presentationAtTier("Citadel").buildOptions ?? [];
    expect(
      citadel.find((option) => option.buildingType === "spirit_herb_garden")
        ?.unlocked,
    ).toBe(true);
  });

  test("Managed Forest costs 10 stone and 30 wood at Camp", () => {
    expect(buildingDef("forest")).toMatchObject({
      cost: { stone: 10, wood: 30 },
      tier: "Camp",
    });
  });

  test("does not confuse an unaffordable building with a tier lock", () => {
    const sim = createAshenGateSim({ seed: 23 });
    const save = JSON.parse(sim.serialize()) as {
      state?: { resources?: { stone?: number; wood?: number } };
    };
    if (save.state?.resources === undefined) {
      throw new Error("Missing saved stockpile");
    }
    save.state.resources.wood = 0;
    save.state.resources.stone = 0;
    sim.load(JSON.stringify(save));
    sim.step(1);

    const options = (sim.snapshot().meta.ui as DescentPresentation)
      .buildOptions;
    const barracks = options?.find(
      (option) => option.buildingType === "barracks",
    );
    expect(barracks).toMatchObject({
      affordable: false,
      lockedReason: "Not enough resources",
      unlocked: true,
    });
    expect(
      options?.find((option) => option.buildingType === "forest"),
    ).toMatchObject({
      affordable: false,
      lockedReason: "Not enough resources",
      unlocked: true,
    });
    const farm = options?.find((option) => option.buildingType === "farm");
    expect(farm).toMatchObject({
      affordable: false,
      lockedReason: "Requires Outpost",
      unlocked: false,
    });
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
