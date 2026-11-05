import { describe, expect, test } from "bun:test";
import type { SimSnapshot } from "../../logic/types";
import { activeCoach } from "../coach";
import { GLOSSARY, REQUIRED_GLOSSARY_TERMS } from "../glossary";
import { hotkeyFromInput } from "../hotkeys";
import { readPresentation } from "../presentation";
import { createAshenGatePreview } from "../preview";
import {
  clientToWorld,
  ordersForRightClick,
  unitsInBox,
  veinUnderCursor,
} from "../selection";
import {
  BOSS_DISPLAY_SCALE,
  buildShellModel,
  mapDisplayScale,
  unitDisplayScale,
} from "../shellModel";
import { breakthroughToast, feedBlockMessage, layerBannerFor } from "../text";

describe("descent shell read model", () => {
  test("reads stockpile, pause, and the Ashen Gate banner from a sim snapshot", () => {
    const snapshot: SimSnapshot = {
      buildings: [],
      layerId: "ashen-gate",
      map: { height: 10, width: 128 },
      meta: {
        economy: { popCap: 40, popUsed: 4 },
        layers: { bossGateCleared: true },
      },
      paused: true,
      resources: {
        coin: 1,
        essence: 2,
        food: 3,
        iron: 4,
        spirit_herbs: 5,
        stone: 6,
        water: 7,
        wood: 8,
      },
      speed: 2,
      tick: 4,
      units: [{ classId: "warden", id: "u", x: 1, y: 2 }],
    };
    const model = buildShellModel(snapshot);

    expect(model.resources.essence).toBe(2);
    expect(model.paused).toBe(true);
    expect(model.speed).toBe(2);
    expect(model.banner.name).toBe("Ashen Gate");
    expect(model.banner.boost).toBe("Ember +25%");
    expect(model.banner.hinder).toBe("Rime −15%");
    expect(model.units[0]?.name).toBe("Warden");
    expect(model.units[0]?.factionId).toBe("hold");
    expect(model.omen).toBeNull();
    expect(model.pop).toEqual({ cap: 40, used: 4 });
    expect(model.bossGateCleared).toBe(true);
    expect(model.vents.length).toBeGreaterThan(0);
    expect(model.vents[0]?.label).toBe("Ember vent");
    expect(mapDisplayScale(128)).toBe(8);
  });

  test("reads a villager's load and treats an empty load as empty-handed", () => {
    const snapshot: SimSnapshot = {
      buildings: [],
      layerId: "ashen_gate",
      map: { height: 10, width: 10 },
      meta: {
        ui: {
          units: {
            empty: { carrying: "food", carryingAmount: 0 },
            loaded: { carrying: "stone", carryingAmount: 8 },
          },
        },
      },
      paused: false,
      resources: {
        coin: 0,
        essence: 0,
        food: 0,
        iron: 0,
        spirit_herbs: 0,
        stone: 0,
        water: 0,
        wood: 0,
      },
      speed: 1,
      tick: 0,
      units: [
        { classId: "villager", id: "loaded", x: 1, y: 1 },
        { classId: "villager", id: "empty", x: 2, y: 2 },
        { classId: "villager", id: "plain", x: 3, y: 3 },
      ],
    };
    const units = buildShellModel(snapshot).units;
    expect(units.find((unit) => unit.id === "loaded")?.carrying).toEqual({
      amount: 8,
      resource: "stone",
    });
    expect(units.find((unit) => unit.id === "empty")?.carrying).toBeNull();
    expect(units.find((unit) => unit.id === "plain")?.carrying).toBeNull();
  });

  test("prefers meta.ui over module bags", () => {
    const presentation = readPresentation({
      layers: { bossGateCleared: true },
      ui: {
        bossGateCleared: false,
        hellPressure: 0.5,
        omen: { composition: { raider: 3 }, etaSeconds: 60 },
      },
    });

    expect(presentation.bossGateCleared).toBe(false);
    expect(presentation.hellPressure).toBe(0.5);
    expect(presentation.omen?.composition.raider).toBe(3);
  });

  test("defines the required glossary terms", () => {
    for (const term of REQUIRED_GLOSSARY_TERMS) {
      const entry = GLOSSARY.find((item) => item.term === term);
      expect(entry?.meaning.length).toBeGreaterThan(0);
    }
  });

  test("keeps the Ashen Gate hazard line from narrative", () => {
    const banner = layerBannerFor("ashen_gate");
    expect(banner.hazard).toContain("Ember vents");
    expect(banner.rankCap).toBe("Rank cap Sworn");
  });

  test("turns published cultivation failures into the shell toasts", () => {
    expect(breakthroughToast(["Battle merit 0/100"])).toContain(
      "Merit incomplete",
    );
    expect(breakthroughToast(["Spare population 1 is required."])).toContain(
      "Need spare population",
    );
    expect(
      feedBlockMessage(
        {
          canFeed: false,
          effectivenessMultiplier: 0.5,
          pillId: "ember_dao_pill",
          projectedAmount: 0.1,
          reason: "Toxicity cap reached for Sworn.",
          schoolMatch: false,
          toxicity: 3,
          toxicityAfter: 3,
          toxicityCap: 3,
        },
        "School mismatch: Ember on Rime.",
      ),
    ).toContain("School mismatch");
  });

  test("maps right-click, drag select, veins, and hotkeys without touching rules", () => {
    const units = [
      {
        classId: "warden",
        factionId: "hold" as const,
        id: "hold",
        x: 2,
        y: 2,
      },
      {
        classId: "raider",
        factionId: "horde" as const,
        id: "horde",
        x: 8,
        y: 8,
      },
    ];
    expect(
      ordersForRightClick({
        buildings: [],
        ground: { x: 8, y: 8 },
        nodes: [],
        selectedIds: ["hold"],
        targetBuildingId: null,
        targetUnitId: "horde",
        units,
      }),
    ).toEqual([{ targetId: "horde", type: "order_attack", unitIds: ["hold"] }]);
    expect(
      ordersForRightClick({
        buildings: [],
        ground: { x: 4, y: 5 },
        nodes: [],
        selectedIds: ["hold"],
        targetBuildingId: null,
        targetUnitId: null,
        units,
      }),
    ).toEqual([{ type: "order_move", unitIds: ["hold"], x: 4, y: 5 }]);
    expect(unitsInBox(units, { x0: 0, x1: 3, y0: 0, y1: 3 })).toEqual(["hold"]);
    expect(veinUnderCursor([{ radius: 2, x: 0, y: 0 }], { x: 1, y: 1 })).toBe(
      true,
    );
    expect(
      clientToWorld(80, 40, { left: 0, top: 0 }, { x: 0, y: 0 }, 8),
    ).toEqual({ x: 10, y: 5 });
    expect(
      hotkeyFromInput({
        altKey: false,
        ctrlKey: false,
        key: "b",
        metaKey: false,
        repeat: false,
      }),
    ).toEqual({ type: "build" });
    expect(
      activeCoach({
        dismissed: [],
        feedOpen: true,
        flags: { pill: true, realmGate: true, school: true },
        furnaceSelected: false,
        holdUnitPresent: true,
        layerName: "Ashen Gate",
        schoolChoiceVisible: true,
      }),
    ).toBe("realm");
    expect(
      activeCoach({
        dismissed: ["realm"],
        feedOpen: true,
        flags: { pill: true, realmGate: true, school: true },
        furnaceSelected: false,
        holdUnitPresent: true,
        layerName: "Ashen Gate",
        schoolChoiceVisible: true,
      }),
    ).toBe("pill");
  });

  test("preview snapshot publishes the panels the shell reads", () => {
    const model = buildShellModel(createAshenGatePreview());
    expect(model.resources.essence).toBe(40);
    expect(model.omen?.etaSeconds).toBe(47);
    expect(model.hellPressure).toBe(0.35);
    expect(
      model.units.find((unit) => unit.id === "warden-1")?.cultivation
        ?.successChance,
    ).toBe(0.62);
  });
});

describe("boss display scale", () => {
  test("draws a published boss three times larger than other units", () => {
    const snapshot = createAshenGatePreview();
    const ui = snapshot.meta.ui as {
      units: Record<string, Record<string, unknown>>;
    };
    ui.units["imp-1"] = { ...ui.units["imp-1"], role: "boss" };
    const model = buildShellModel(snapshot);
    const boss = model.units.find((unit) => unit.id === "imp-1");
    const warden = model.units.find((unit) => unit.id === "warden-1");
    expect(boss?.boss).toBe(true);
    expect(warden?.boss).toBe(false);
    expect(BOSS_DISPLAY_SCALE).toBe(3);
    expect(unitDisplayScale({ boss: true })).toBe(3);
    expect(unitDisplayScale({ boss: false })).toBe(1);
  });
});
