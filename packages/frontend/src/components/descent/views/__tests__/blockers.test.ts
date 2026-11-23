import { describe, expect, test } from "bun:test";
import {
  POPULATION_BLOCKER,
  RESOURCE_BLOCKER,
} from "../../logic/slice/sliceTraining";
import {
  blockedToast,
  blockersFromLines,
  costShortfallBlockers,
  pricedActionBlockers,
  requirementFix,
} from "../blockers";
import { buildCardButtons } from "../card";
import { costLineFrom } from "../costLine";
import { createAshenGatePreview } from "../preview";
import { buildShellModel } from "../shellModel";

describe("requirementFix", () => {
  test("gives a concrete next step for every breakthrough gate", () => {
    expect(requirementFix("Battle merit 20/100")).toContain("earn Merit");
    expect(requirementFix("Combat proof 1/3")).toContain("killing blows");
    expect(requirementFix("Essence 10/50")).toContain("Meditate");
    expect(
      requirementFix("Tier materials are missing from stockpile."),
    ).toContain("gather");
    expect(requirementFix("Cultivation Hall requires Stronghold.")).toBe(
      "Select the Camp and upgrade the Hold to Stronghold.",
    );
    expect(requirementFix("Build a Cultivation Hall.")).toContain(
      "Cultivation Hall",
    );
    expect(requirementFix("Breakthrough Pill is required.")).toContain(
      "Alchemy Furnace",
    );
    expect(requirementFix("Spare population 2 is required.")).toContain(
      "Housing",
    );
    expect(requirementFix("Layer rank cap is Sworn.")).toContain("Descend");
    expect(
      requirementFix("School choice is required before advancing."),
    ).toContain("Ember, Rime, or Blood");
    expect(requirementFix("Breakthrough injury is active.")).toContain("heal");
  });

  test("explains training blockers", () => {
    expect(requirementFix("Needs Outpost to train this unit.")).toContain(
      "Outpost",
    );
    expect(requirementFix("Soldiers train at a Barracks.")).toContain(
      "Barracks",
    );
    expect(requirementFix("Training queue is full.")).toContain("cancel");
  });

  test("returns undefined for a reason it does not know", () => {
    expect(requirementFix("Something unexpected")).toBeUndefined();
    expect(blockersFromLines(["Something unexpected"])).toEqual([
      { problem: "Something unexpected" },
    ]);
  });
});

describe("cost blockers", () => {
  const cost = costLineFrom({ food: 30, wood: 20 }, { pop: 2 });

  test("names each short amount and where to gather it", () => {
    const items = costShortfallBlockers(cost, {
      popFree: 1,
      resources: { food: 12, wood: 50 },
    });
    expect(items).toEqual([
      {
        fix: "Villagers: Right-click a grove. Root Cellar trickles more.",
        problem: "Need 18 more Food",
      },
      {
        fix: "Build Housing to raise the population cap.",
        problem: "Need 2 free population (have 1)",
      },
    ]);
  });

  test("turns a generic cost reason into exact shortfalls", () => {
    const stock = { popFree: 5, resources: { food: 0, wood: 50 } };
    for (const reason of [RESOURCE_BLOCKER, "Not enough resources"]) {
      expect(pricedActionBlockers(reason, cost, stock)[0]?.problem).toBe(
        "Need 30 more Food",
      );
    }
    expect(
      pricedActionBlockers(POPULATION_BLOCKER, cost, {
        popFree: 0,
        resources: { food: 99, wood: 99 },
      })[0]?.problem,
    ).toContain("free population");
  });

  test("keeps a non-cost reason with its fix", () => {
    expect(
      pricedActionBlockers("Still under construction.", cost, {
        popFree: 5,
        resources: {},
      }),
    ).toEqual([
      {
        fix: "Wait for it to finish building.",
        problem: "Still under construction.",
      },
    ]);
  });
});

describe("blockedToast", () => {
  test("states the first problem, how many more, and its fix", () => {
    expect(
      blockedToast("Breakthrough", [
        { fix: "Fight.", problem: "Battle merit 0/100" },
        { problem: "Essence 0/50" },
      ]),
    ).toBe("Can't Breakthrough: Battle merit 0/100 (+1 more) → Fight.");
    expect(blockedToast("Descend", [])).toBe("Can't Descend right now.");
  });
});

describe("command card blockers", () => {
  test("blocks an incomplete breakthrough and lists every missing gate", () => {
    const model = buildShellModel(createAshenGatePreview());
    const buttons = buildCardButtons(model, {
      buildingId: null,
      unitIds: ["merit-1"],
    });
    const breakthrough = buttons.find((button) => button.id === "breakthrough");
    expect(breakthrough?.disabled).toBe(true);
    expect(breakthrough?.blockers?.length).toBeGreaterThan(0);
    for (const item of breakthrough?.blockers ?? []) {
      expect(item.problem.length).toBeGreaterThan(0);
    }
  });

  test("every disabled button explains itself", () => {
    const model = buildShellModel(createAshenGatePreview());
    const selections = [
      { buildingId: null, unitIds: [] },
      { buildingId: "barracks-1", unitIds: [] },
      { buildingId: null, unitIds: ["merit-1"] },
      { buildingId: null, unitIds: ["adept-1"] },
    ];
    for (const selection of selections) {
      for (const button of buildCardButtons(model, selection)) {
        if (button.disabled !== true) continue;
        expect(button.blockers?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
