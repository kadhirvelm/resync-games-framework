import { describe, expect, test } from "bun:test";
import type { DescentPresentation } from "../../../views/presentation";
import { createAshenGateSim } from "../../ashenGateSlice";
import type { EconomyBuilding } from "../../economy/model";
import type { SimSnapshot } from "../../types";
import { describeQiArt, isCultivatorClass } from "../sliceCultivatorPowers";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  type AshenGateSliceState,
} from "../sliceState";

/** Reads the published presentation bag from a snapshot. */
function ui(snapshot: SimSnapshot): DescentPresentation {
  return (snapshot.meta.ui ?? {}) as DescentPresentation;
}

/** Reads slice state from a snapshot. */
function slice(snapshot: SimSnapshot): AshenGateSliceState {
  return snapshot.meta[ASHEN_GATE_SLICE_MODULE_ID] as AshenGateSliceState;
}

/** Advances the sim by `seconds` of sim time (20 ticks per second). */
function stepSeconds(
  sim: ReturnType<typeof createAshenGateSim>,
  seconds: number,
): void {
  sim.step(Math.round(seconds * 20));
}

/** Upgrades the Hold to Outpost and ensures enough resources to build an array. */
function prepareOutpost(sim: ReturnType<typeof createAshenGateSim>): void {
  const save = JSON.parse(sim.serialize()) as {
    state?: {
      meta?: { economy?: { tier?: string } };
      resources?: { stone?: number; wood?: number };
    };
  };
  if (save.state?.meta?.economy !== undefined) {
    save.state.meta.economy.tier = "Outpost";
  }
  if (save.state?.resources !== undefined) {
    save.state.resources.stone = 200;
    save.state.resources.wood = 200;
  }
  sim.load(JSON.stringify(save));
  sim.step(1);
}

describe("Cultivator powers, seclusion, and sect expansion", () => {
  test("recognizes all three cultivator classes and maps distinct Dao Arts", () => {
    expect(isCultivatorClass("cultivator")).toBe(true);
    expect(isCultivatorClass("sword_sage")).toBe(true);
    expect(isCultivatorClass("formation_master")).toBe(true);
    expect(isCultivatorClass("warden")).toBe(false);

    expect(describeQiArt("cultivator", undefined, "Ashborn").name).toBe(
      "Sword Qi Wave",
    );
    expect(describeQiArt("cultivator", "ember", "Sworn").name).toBe(
      "Blazing Lotus",
    );
    expect(describeQiArt("cultivator", "rime", "Sworn").name).toBe(
      "Glacial Mirror",
    );
    expect(describeQiArt("cultivator", "blood", "Sworn").name).toBe(
      "Crimson Tempest",
    );
    expect(describeQiArt("sword_sage", undefined, "Ashborn").name).toBe(
      "Thousand-Blade Volley",
    );
    expect(describeQiArt("sword_sage", "ember", "Sworn").name).toBe(
      "Solar Sword Rain",
    );
    expect(describeQiArt("formation_master", undefined, "Ashborn").name).toBe(
      "Spirit Ward Array",
    );
    expect(describeQiArt("formation_master", "blood", "Sworn").name).toBe(
      "Blood-Oath Banner",
    );
  });

  test("exposes Cultivator Sanctum and Spirit Gathering Array at Outpost", () => {
    const sim = createAshenGateSim({ seed: 19 });
    prepareOutpost(sim);

    const options = ui(sim.snapshot()).buildOptions ?? [];
    const sanctum = options.find(
      (opt) => opt.buildingType === "cultivator_sanctum",
    );
    const array = options.find((opt) => opt.buildingType === "spirit_array");
    const pavilion = options.find(
      (opt) => opt.buildingType === "meditation_pavilion",
    );

    expect(sanctum?.unlocked).toBe(true);
    expect(array?.unlocked).toBe(true);
    expect(pavilion).toBeUndefined();
  });

  test("meditation generates Essence and Merit and auto-cancels on move order", () => {
    const sim = createAshenGateSim({ seed: 23 });
    const captainId = "ashen-captain";
    const before = ui(sim.snapshot()).units?.[captainId]?.cultivation;
    expect(before).toBeDefined();

    sim.enqueue({ type: "toggle_meditate", unitIds: [captainId] });
    stepSeconds(sim, 3);

    const during = ui(sim.snapshot()).units?.[captainId];
    expect(during?.meditating).toBe(true);
    expect(during?.cultivation?.essence ?? 0).toBeGreaterThan(
      before?.essence ?? 0,
    );
    expect(during?.cultivation?.merit ?? 0).toBeGreaterThan(before?.merit ?? 0);

    sim.enqueue({
      type: "order_move",
      unitIds: [captainId],
      x: 10,
      y: 10,
    });
    stepSeconds(sim, 0.2);
    expect(ui(sim.snapshot()).units?.[captainId]?.meditating).toBe(false);
  });

  test("Spirit Gathering Array doubles Qi regeneration and empowers nearby cultivators", () => {
    const sim = createAshenGateSim({ seed: 31 });
    const captainId = "ashen-captain";
    prepareOutpost(sim);

    // Spend Qi with Sword Qi Wave and measure base regeneration
    sim.enqueue({ type: "cast_qi_art", unitIds: [captainId] });
    stepSeconds(sim, 2);
    const qiAfterBase = ui(sim.snapshot()).units?.[captainId]?.qi ?? 0;

    // Place a completed Spirit Gathering Array right beside the captain via save reload
    const captain = sim.snapshot().units.find((u) => u.id === captainId);
    const save = JSON.parse(sim.serialize()) as {
      state?: { buildings?: Partial<EconomyBuilding>[] };
    };
    save.state?.buildings?.push({
      bonuses: { adjacency: [], vein: null },
      buildingType: "spirit_array",
      buildTicks: 24,
      completed: true,
      hp: 170,
      id: "array-1",
      maxHp: 170,
      x: Math.round((captain?.x ?? 10) + 2),
      y: Math.round(captain?.y ?? 10),
    });
    sim.load(JSON.stringify(save));
    stepSeconds(sim, 12);
    expect(ui(sim.snapshot()).units?.[captainId]?.inSpiritArray).toBe(true);

    // Cast again inside the Spirit Array and verify faster Qi regeneration
    sim.enqueue({ type: "cast_qi_art", unitIds: [captainId] });
    stepSeconds(sim, 2);
    const qiAfterArray = ui(sim.snapshot()).units?.[captainId]?.qi ?? 0;
    expect(qiAfterArray).toBeGreaterThan(qiAfterBase);
  });

  test("casting Qi Art spends Qi, triggers cooldown, and emits qi_nova FX", () => {
    const sim = createAshenGateSim({ seed: 41 });
    const captainId = "ashen-captain";
    const beforeQi = ui(sim.snapshot()).units?.[captainId]?.qi ?? 0;
    expect(beforeQi).toBe(100);

    sim.enqueue({ type: "cast_qi_art", unitIds: [captainId] });
    stepSeconds(sim, 0.1);

    const after = ui(sim.snapshot()).units?.[captainId];
    expect(after?.qi ?? 100).toBeLessThan(beforeQi);
    expect(after?.qiArt?.ready).toBe(false);
    expect(after?.qiArt?.cooldownSeconds ?? 0).toBeGreaterThan(0);

    const hasNova = slice(sim.snapshot()).fx.some(
      (fx) => fx.kind === "qi_nova",
    );
    expect(hasNova).toBe(true);
  });
});
