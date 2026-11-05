import { describe, expect, test } from "bun:test";
import type { ResourceId } from "../../logic/types";
import { buildCardButtons } from "../card";
import { buildConfirm } from "../confirm";
import { createAshenGatePreview } from "../preview";
import { buildShellModel, type ShellModel } from "../shellModel";

/**
 * @returns A presentation model with a completed market and all sale rates
 */
function marketModel(): ShellModel {
  const base = buildShellModel(createAshenGatePreview());
  const template = base.buildings[0];
  if (template === undefined) throw new Error("Preview has no buildings");
  return {
    ...base,
    buildings: [
      ...base.buildings,
      {
        ...template,
        buildingType: "hell_market",
        constructing: false,
        id: "market-test",
        name: "Hell Market",
        trainingQueue: [],
      },
    ],
    marketRates: (["food", "water", "wood"] as const).map((sell) => ({
      buy: "coin" as const,
      label: `Sell 1 ${sell} for Coin.`,
      sell,
    })),
  };
}

describe("Hell Market controls", () => {
  test("shows a separate sale action for each renewable resource", () => {
    const model = marketModel();
    const buttons = buildCardButtons(model, {
      buildingId: "market-test",
      unitIds: [],
    });
    expect(buttons.map((button) => button.id)).toEqual([
      "market-food",
      "market-water",
      "market-wood",
    ]);
  });

  test("commits the selected resource instead of always selling the first", () => {
    const model = marketModel();
    for (const sell of [
      "food",
      "water",
      "wood",
    ] as const satisfies readonly ResourceId[]) {
      expect(buildConfirm(model, { sell, type: "market" }, 7).command).toEqual({
        amount: 7,
        buy: "coin",
        sell,
        type: "market_trade",
      });
    }
  });
});
