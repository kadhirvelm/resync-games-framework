import { describe, expect, test } from "bun:test";
import { buildCardButtons } from "../card";
import {
  describeSelection,
  inspectRing,
  inspectTargetAt,
  isInspected,
  pruneInspectTarget,
} from "../inspect";
import { createAshenGatePreview } from "../preview";
import { EMPTY_SELECTION } from "../selection";
import { buildShellModel } from "../shellModel";

const model = buildShellModel(createAshenGatePreview());
const features = {
  nodes: [
    {
      gatherers: 2,
      id: "wood-1",
      label: "Wood 400",
      remaining: 400,
      resource: "wood" as const,
      x: 10,
      y: 10,
    },
  ],
  veins: [{ id: "vein-1", radius: 0.5, x: 30, y: 30 }],
  vents: [{ id: "vent-1", label: "Ember vent", radius: 2, x: 50, y: 50 }],
};

describe("inspectTargetAt", () => {
  test("picks a node, then a vein, then a vent, else nothing", () => {
    expect(inspectTargetAt(features, { x: 10.5, y: 10 })).toEqual({
      id: "wood-1",
      kind: "node",
    });
    expect(inspectTargetAt(features, { x: 30.4, y: 30 })).toEqual({
      id: "vein-1",
      kind: "vein",
    });
    expect(inspectTargetAt(features, { x: 51, y: 51 })).toEqual({
      id: "vent-1",
      kind: "vent",
    });
    expect(inspectTargetAt(features, { x: 80, y: 80 })).toBeNull();
  });
});

describe("pruneInspectTarget and inspectRing", () => {
  test("drops a node that ran dry and rings the ones still there", () => {
    const target = { id: "wood-1", kind: "node" as const };
    expect(pruneInspectTarget(features, target)).toBe(target);
    expect(pruneInspectTarget({ ...features, nodes: [] }, target)).toBeNull();
    expect(inspectRing(features, target)).toEqual({
      radius: 1.6,
      x: 10,
      y: 10,
    });
    expect(
      inspectRing(features, { kind: "stockpile", resource: "wood" }),
    ).toBeNull();
    expect(isInspected(target, "node", "wood-1")).toBe(true);
    expect(isInspected(target, "vent", "wood-1")).toBe(false);
  });
});

describe("describeSelection", () => {
  test("explains an empty selection", () => {
    const card = describeSelection(model, EMPTY_SELECTION, null);
    expect(card.kind).toBe("empty");
    expect(card.tips.length).toBeGreaterThan(0);
  });

  test("describes a resource node with its yield and how to gather it", () => {
    const card = describeSelection(
      { ...model, nodes: features.nodes },
      EMPTY_SELECTION,
      { id: "wood-1", kind: "node" },
    );
    expect(card.title).toBe("Dead Timber");
    expect(card.subtitle).toContain("Wood");
    expect(card.facts).toContainEqual({ label: "Remaining", value: "400" });
    expect(card.facts).toContainEqual({ label: "Gatherers", value: "2" });
    expect(card.tips.join(" ")).toContain("right-click it to gather");
  });

  test("falls back to the unit selection when the inspected node is gone", () => {
    const card = describeSelection(
      model,
      { buildingId: null, unitIds: ["villager-1"] },
      { id: "missing", kind: "node" },
    );
    expect(card.kind).toBe("unit");
  });

  test("describes a villager's job and load", () => {
    const card = describeSelection(
      model,
      { buildingId: null, unitIds: ["villager-1"] },
      null,
    );
    expect(card.title).toBe("Ash Cutter");
    expect(card.subtitle).toBe("Your unit · Worker");
    expect(card.health).toEqual({ max: 40, value: 40 });
    expect(card.facts.find((fact) => fact.label === "Carrying")?.value).toBe(
      "10 Wood",
    );
  });

  test("marks enemies and says how to fight them", () => {
    const card = describeSelection(
      model,
      { buildingId: null, unitIds: ["imp-1"] },
      null,
    );
    expect(card.tone).toBe("horde");
    expect(card.subtitle).toContain("Enemy");
    expect(card.tips[0]).toContain("attack");
  });

  test("summarizes a mixed selection as a group", () => {
    const card = describeSelection(
      model,
      { buildingId: null, unitIds: ["villager-1", "warden-1"] },
      null,
    );
    expect(card.kind).toBe("group");
    expect(card.title).toBe("2 units");
  });

  test("describes a building by its job and actions", () => {
    const card = describeSelection(
      model,
      { buildingId: "barracks-1", unitIds: [] },
      null,
    );
    expect(card.kind).toBe("building");
    expect(card.title).toBe("Barracks");
    expect(card.summary.length).toBeGreaterThan(0);
    expect(card.tips.join(" ")).toContain("train");
  });

  test("describes Spirit Veins and vents", () => {
    expect(
      describeSelection(model, EMPTY_SELECTION, { id: "vein-1", kind: "vein" })
        .title,
    ).toBe("Spirit Vein");
    const vent = describeSelection(
      { ...model, vents: features.vents },
      EMPTY_SELECTION,
      { id: "vent-1", kind: "vent" },
    );
    expect(vent.tone).toBe("hazard");
    expect(vent.title).toBe("Ember vent");
  });
});

describe("node actions", () => {
  test("offer to send idle villagers to an inspected node", () => {
    const buttons = buildCardButtons(model, EMPTY_SELECTION, {
      id: "food-1",
      kind: "node",
    });
    expect(buttons.map((button) => button.intent.type)).toEqual([
      "gather_idle",
      "gather_idle",
    ]);
  });
});
