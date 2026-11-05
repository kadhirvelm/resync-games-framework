import { describe, expect, test } from "bun:test";
import { buildCardButtons, costStock } from "../card";
import { isCostItemShort } from "../costLine";
import { createAshenGatePreview } from "../preview";
import { buildShellModel } from "../shellModel";

/**
 * A preview model with a finished Camp selected and a Stronghold upgrade.
 * @param upgrade - Readout overrides
 * @returns Model and selection for the Camp
 */
function campWithUpgrade(upgrade: {
  allowed: boolean;
  inProgress?: { progress: number; secondsLeft: number } | null;
  reason?: string;
  shortfall?: boolean;
}) {
  const base = buildShellModel(createAshenGatePreview());
  const template = base.buildings[0];
  if (template === undefined) throw new Error("Preview has no buildings");
  const camp = {
    ...template,
    buildingType: "camp",
    constructing: false,
    id: "camp-test",
    trainingQueue: [],
  };
  const model = {
    ...base,
    buildings: [...base.buildings, camp],
    holdUpgrade: {
      cost: { stone: 40, wood: 40 },
      costLabel: "Wood 40 · Stone 40",
      currentTier: "Camp",
      targetTier: "Stronghold",
      ...upgrade,
    },
    resources: { ...base.resources, stone: 10, wood: 70 },
  };
  return { model, selection: { buildingId: camp.id, unitIds: [] } };
}

describe("command card costs", () => {
  test("an unaffordable upgrade shows its price, red where short, and no Need text", () => {
    const { model, selection } = campWithUpgrade({
      allowed: false,
      reason: "Not enough resources",
      shortfall: true,
    });
    const upgrade = buildCardButtons(model, selection).find(
      (button) => button.id === "upgrade-hold",
    );
    expect(upgrade?.detail).toBeUndefined();
    const items = upgrade?.cost?.items ?? [];
    expect(items.map((item) => item.resource)).toEqual(["wood", "stone"]);
    const stock = costStock(model);
    expect(items.map((item) => isCostItemShort(item, stock))).toEqual([
      false,
      true,
    ]);
  });

  test("a blocker the price cannot explain is still spelled out", () => {
    const { model, selection } = campWithUpgrade({
      allowed: false,
      reason: "Stronghold is already rising",
      shortfall: false,
    });
    const upgrade = buildCardButtons(model, selection).find(
      (button) => button.id === "upgrade-hold",
    );
    expect(upgrade?.detail).toBe("Stronghold is already rising");
  });

  test("a running upgrade leaves the card", () => {
    const { model, selection } = campWithUpgrade({
      allowed: false,
      inProgress: { progress: 0.4, secondsLeft: 6 },
      reason: "Stronghold is already rising",
      shortfall: false,
    });
    expect(
      buildCardButtons(model, selection).some(
        (button) => button.id === "upgrade-hold",
      ),
    ).toBe(false);
  });
});
