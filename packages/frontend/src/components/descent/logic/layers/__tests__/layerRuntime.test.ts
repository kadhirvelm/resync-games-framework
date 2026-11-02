import { describe, expect, test } from "bun:test";
import { ASHEN_GATE_MAP } from "../../../data/layers/ashen_gate/map";
import rawLayerTable from "../../../data/layers.json";
import { LayerRuntime } from "../layerRuntime";
import { LAYER_TABLE, parseLayerTable } from "../layerTable";
import type { LayerEvent } from "../layerTypes";

/**
 * Builds a runtime that records every port call in order.
 * @returns The runtime and its call log.
 */
function recordingRuntime(): {
  runtime: LayerRuntime;
  calls: string[];
  events: LayerEvent[];
} {
  const calls: string[] = [];
  const events: LayerEvent[] = [];
  const runtime = new LayerRuntime({
    ports: {
      autosave: (layer) => calls.push(`autosave:${layer.id}`),
      emit: (event) => {
        events.push(event);
        calls.push(`emit:${event.type}`);
      },
      resetDeepWorks: (layer) => calls.push(`reset:${layer.id}`),
    },
  });
  return { calls, events, runtime };
}

describe("layer table", () => {
  test("ships five layers in descent order with canon grades and caps", () => {
    expect(LAYER_TABLE.layers.map((layer) => layer.name)).toEqual([
      "Ashen Gate",
      "Bone Wastes",
      "Frozen Pit",
      "Blood Sea",
      "Throne of Hell",
    ]);
    expect(LAYER_TABLE.layers.map((layer) => layer.essenceGrade)).toEqual([
      1, 2, 4, 8, 16,
    ]);
    expect(LAYER_TABLE.layers.map((layer) => layer.realmCap)).toEqual([
      "Sworn",
      "Veteran",
      "Veteran",
      "Champion",
      "Ascended",
    ]);
  });

  test("rejects malformed data", () => {
    const broken = structuredClone(rawLayerTable) as {
      layers: { realmCap: string }[];
    };
    const first = broken.layers[0];
    if (first === undefined) {
      throw new Error("fixture needs a layer");
    }
    first.realmCap = "Demigod";
    expect(() => parseLayerTable(broken)).toThrow();
    const message = (() => {
      try {
        parseLayerTable(broken);
        return "";
      } catch (error) {
        return String(error);
      }
    })();
    expect(message).toContain("layers.0.realmCap");
  });
});

describe("school modifiers", () => {
  test("each layer favors one school and hinders another", () => {
    const runtime = new LayerRuntime();
    expect(runtime.getSchoolModifier("ember")).toBe(1.25);
    expect(runtime.getSchoolModifier("rime")).toBe(0.85);
    expect(runtime.getSchoolModifier("blood")).toBe(1);
    const throne = new LayerRuntime({ startLayerId: "throne_of_hell" });
    expect(throne.getSchoolModifier("ember")).toBe(1);
    expect(throne.getSchoolModifier("rime")).toBe(1);
    expect(throne.getSchoolModifier("blood")).toBe(1);
  });
});

describe("realm cap", () => {
  test("Ashen Gate rejects a Champion breakthrough", () => {
    const runtime = new LayerRuntime();
    expect(runtime.maxRankForLayer()).toBe("Sworn");
    expect(runtime.canReachRank("Sworn")).toBe(true);
    expect(runtime.canReachRank("Veteran")).toBe(false);
    expect(runtime.canReachRank("Champion")).toBe(false);
  });

  test("Throne of Hell unlocks Ascended", () => {
    const runtime = new LayerRuntime({ startLayerId: "throne_of_hell" });
    expect(runtime.canReachRank("Ascended")).toBe(true);
    expect(runtime.isUnlocked("ascension")).toBe(true);
  });
});

describe("descend gate", () => {
  test("descend without a boss clear is rejected and changes nothing", () => {
    const { calls, runtime } = recordingRuntime();
    expect(runtime.canDescend()).toBe(false);
    expect(runtime.descend(10)).toEqual({
      ok: false,
      reason: "boss_gate_closed",
    });
    expect(runtime.getActiveLayer().id).toBe("ashen_gate");
    expect(runtime.getEssenceGrade()).toBe(1);
    expect(calls).toEqual([]);
  });

  test("after setBossGateCleared(true), descend raises the grade, resets Deep Works, then autosaves", () => {
    const { calls, events, runtime } = recordingRuntime();
    runtime.setBossGateCleared(true);
    runtime.setBossGateCleared(true);
    expect(events).toEqual([{ layerId: "ashen_gate", type: "layer_cleared" }]);
    calls.length = 0;

    const result = runtime.descend(600);
    expect(result.ok).toBe(true);
    expect(runtime.getActiveLayer().id).toBe("bone_wastes");
    expect(runtime.getEssenceGrade()).toBe(2);
    expect(runtime.maxRankForLayer()).toBe("Veteran");
    expect(runtime.isBossGateCleared()).toBe(false);
    expect(calls).toEqual([
      "reset:bone_wastes",
      "emit:layer_started",
      "autosave:bone_wastes",
    ]);
    expect(runtime.descend(601)).toEqual({
      ok: false,
      reason: "boss_gate_closed",
    });
  });

  test("unlocks accumulate as the Hold descends", () => {
    const runtime = new LayerRuntime();
    expect(runtime.isUnlocked("hearth_ward")).toBe(false);
    runtime.setBossGateCleared(true);
    runtime.descend(1);
    runtime.setBossGateCleared(true);
    runtime.descend(2);
    expect(runtime.isUnlocked("fire_ward_wall")).toBe(true);
    expect(runtime.isUnlocked("omen_range")).toBe(true);
    expect(runtime.isUnlocked("hearth_ward")).toBe(true);
  });

  test("the final layer cannot descend", () => {
    const runtime = new LayerRuntime({ startLayerId: "throne_of_hell" });
    runtime.setBossGateCleared(true);
    expect(runtime.descend(1)).toEqual({ ok: false, reason: "final_layer" });
  });

  test("start autosaves the opening layer", () => {
    const { calls, runtime } = recordingRuntime();
    runtime.start(0);
    expect(calls).toEqual([
      "reset:ashen_gate",
      "emit:layer_started",
      "autosave:ashen_gate",
    ]);
  });
});

describe("Throne of Hell rotation", () => {
  test("rotates through hazards 1–4 every 3 sim-minutes from layer start", () => {
    const events: LayerEvent[] = [];
    const runtime = new LayerRuntime({
      ports: { emit: (event) => events.push(event) },
      startLayerId: "blood_sea",
    });
    runtime.setBossGateCleared(true);
    runtime.descend(1000);
    events.length = 0;

    const seen = [0, 179, 180, 360, 540, 720].map((offset) => {
      runtime.advanceTo(1000 + offset);
      return runtime.getActiveHazards();
    });
    expect(seen).toEqual([
      ["ember_vents"],
      ["ember_vents"],
      ["fog"],
      ["cold"],
      ["lifedrain"],
      ["ember_vents"],
    ]);
    expect(
      events.map((event) => event.type === "hazard_rotated" && event.hazardId),
    ).toEqual(["fog", "cold", "lifedrain", "ember_vents"]);
  });

  test("the rotated hazard applies its rule", () => {
    const runtime = new LayerRuntime({ startLayerId: "throne_of_hell" });
    runtime.start(0);
    expect(runtime.environmentAt([], { x: 90, y: 90 }).visionMultiplier).toBe(
      1,
    );
    runtime.advanceTo(200);
    expect(runtime.environmentAt([], { x: 90, y: 90 }).visionMultiplier).toBe(
      0.5,
    );
  });

  test("serialize and restore keep the hazard clock without side effects", () => {
    const runtime = new LayerRuntime({ startLayerId: "throne_of_hell" });
    runtime.start(0);
    runtime.advanceTo(400);
    const { calls, runtime: loaded } = recordingRuntime();
    loaded.restore(structuredClone(runtime.serialize()));
    expect(loaded.getActiveLayer().id).toBe("throne_of_hell");
    expect(loaded.getActiveHazards()).toEqual(["cold"]);
    expect(calls).toEqual([]);
  });
});

describe("boss-phase hazard override", () => {
  test("the Warden's phase rule replaces the timed rotation until released", () => {
    const { events, runtime } = recordingRuntime();
    runtime.restore({
      bossGateCleared: false,
      layerId: "throne_of_hell",
      layerStartedAtSimSeconds: 0,
      nowSimSeconds: 0,
    });
    expect(runtime.getActiveHazards()).toEqual(["ember_vents"]);

    runtime.overrideHazard("cold");
    expect(runtime.getHazardOverride()).toBe("cold");
    expect(runtime.getActiveHazards()).toEqual(["cold"]);
    expect(events).toEqual([
      { hazardId: "cold", layerId: "throne_of_hell", type: "hazard_rotated" },
    ]);

    runtime.advanceTo(200);
    expect(runtime.getActiveHazards()).toEqual(["cold"]);
    expect(events).toHaveLength(1);

    const saved = structuredClone(runtime.serialize());
    const { runtime: loaded } = recordingRuntime();
    loaded.restore(saved);
    expect(loaded.getActiveHazards()).toEqual(["cold"]);

    runtime.overrideHazard(null);
    expect(runtime.getActiveHazards()).toEqual(["fog"]);
    expect(events.at(-1)).toEqual({
      hazardId: "fog",
      layerId: "throne_of_hell",
      type: "hazard_rotated",
    });
  });

  test("old saves without an override load with the rotation in charge", () => {
    const { runtime } = recordingRuntime();
    runtime.restore({
      bossGateCleared: false,
      layerId: "throne_of_hell",
      layerStartedAtSimSeconds: 0,
      nowSimSeconds: 400,
    });
    expect(runtime.getHazardOverride()).toBeNull();
    expect(runtime.getActiveHazards()).toEqual(["cold"]);
  });
});

describe("Ashen Gate vents", () => {
  test("layers.json matches the live map exactly", () => {
    const ashen = LAYER_TABLE.layers.find((layer) => layer.id === "ashen_gate");
    expect(ashen?.ventVolumes).toEqual(ASHEN_GATE_MAP.vents);
  });
});
