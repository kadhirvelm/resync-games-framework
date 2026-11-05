import { describe, expect, test } from "bun:test";
import {
  activeVentVolumes,
  LAYER_TERRAIN_META_KEY,
  setLayerTerrain,
  worldVentVolumes,
} from "../hazards";
import { LayerRuntime } from "../layerRuntime";
import { LAYER_TABLE } from "../layerTable";
import type { LayerBuilding, LayerId, LayerUnit } from "../layerTypes";

const { answers, hazards } = LAYER_TABLE;

/**
 * Builds a runtime on a given layer with no ports.
 * @param layerId - Layer to start on.
 * @returns A fresh runtime.
 */
function runtimeOn(layerId: LayerId): LayerRuntime {
  return new LayerRuntime({ startLayerId: layerId });
}

/**
 * Builds a finished building.
 * @param buildingType - Building id.
 * @param x - Tile x.
 * @param y - Tile y.
 * @param upgrades - Applied upgrade ids.
 * @returns The building.
 */
function built(
  buildingType: string,
  x: number,
  y: number,
  upgrades: string[] = [],
): LayerBuilding {
  return { buildingType, constructed: true, upgrades, x, y };
}

describe("Ashen Gate ember vents", () => {
  const runtime = runtimeOn("ashen_gate");
  const vent = LAYER_TABLE.layers[0]?.ventVolumes[0];
  if (vent === undefined) {
    throw new Error("Ashen Gate needs a vent volume");
  }
  const onVent: LayerUnit = { id: "u1", x: vent.x, y: vent.y };
  const offVent: LayerUnit = { id: "u2", x: vent.x + 20, y: vent.y + 20 };
  const burn =
    hazards.ember_vents.kind === "ember_vents" ? hazards.ember_vents : null;

  test("standing on a vent burns with no unit ability", () => {
    const burns = runtime.collectVentBurns([], [onVent, offVent], 0.5);
    expect(burns).toEqual([
      { damage: (burn?.burnPerSecond ?? 0) * 0.5, unitId: "u1" },
    ]);
  });

  test("a finished fire-ward wall mitigates vent burn", () => {
    const wall = built(answers.fireWardWall.buildingType, vent.x + 1, vent.y);
    const effect = runtime.environmentAt([wall], onVent);
    const expected =
      (burn?.burnPerSecond ?? 0) * (1 - (burn?.fireWardMitigation ?? 0));
    expect(effect.burnPerSecond).toBeCloseTo(expected);
    expect(effect.burnPerSecond).toBeLessThan(burn?.burnPerSecond ?? 0);
  });

  test("a wall still under construction does not ward", () => {
    const wall: LayerBuilding = {
      ...built(answers.fireWardWall.buildingType, vent.x, vent.y),
      constructed: false,
    };
    expect(runtime.environmentAt([wall], onVent).burnPerSecond).toBe(
      burn?.burnPerSecond ?? -1,
    );
  });

  test("vents do not burn on a layer without them", () => {
    const bone = runtimeOn("bone_wastes");
    expect(bone.collectVentBurns([], [onVent], 1)).toEqual([]);
  });
});

describe("Bone Wastes fog", () => {
  const runtime = runtimeOn("bone_wastes");
  const unit = { x: 50, y: 50 };

  test("vision halves outside tower range", () => {
    expect(runtime.environmentAt([], unit).visionMultiplier).toBe(0.5);
  });

  test("inside Ward Tower range restores normal vision", () => {
    const tower = built(answers.wardTower.buildingType, 52, 50);
    expect(runtime.environmentAt([tower], unit).visionMultiplier).toBe(1);
  });

  test("the Omen range upgrade extends fog clearing", () => {
    const distance =
      (answers.omenTower.radius + answers.omenTower.upgradedRadius) / 2;
    const base = built(
      answers.omenTower.buildingType,
      unit.x + distance,
      unit.y,
    );
    const upgraded = built(
      answers.omenTower.buildingType,
      unit.x + distance,
      unit.y,
      [answers.omenTower.rangeUpgrade],
    );
    expect(runtime.environmentAt([base], unit).visionMultiplier).toBe(0.5);
    expect(runtime.environmentAt([upgraded], unit).visionMultiplier).toBe(1);
  });

  test("Ashen Gate has no fog", () => {
    expect(
      runtimeOn("ashen_gate").environmentAt([], unit).visionMultiplier,
    ).toBe(1);
  });
});

describe("Frozen Pit cold", () => {
  const runtime = runtimeOn("frozen_pit");
  const unit = { x: 10, y: 10 };

  test("gather and move slow outside Hearth Ward", () => {
    const effect = runtime.environmentAt([], unit);
    expect(effect.gatherMultiplier).toBe(0.8);
    expect(effect.moveMultiplier).toBe(0.8);
  });

  test("inside Hearth Ward coverage restores gather and move", () => {
    const ward = built(answers.hearthWard.buildingType, 12, 12);
    const effect = runtime.environmentAt([ward], unit);
    expect(effect.gatherMultiplier).toBe(1);
    expect(effect.moveMultiplier).toBe(1);
  });
});

describe("Blood Sea lifedrain", () => {
  const runtime = runtimeOn("blood_sea");

  test("healing is halved for non-Blood recipients", () => {
    expect(
      runtime.environmentAt([], { school: "rime", x: 0, y: 0 })
        .healingMultiplier,
    ).toBe(0.5);
    expect(
      runtime.environmentAt([], { school: null, x: 0, y: 0 }).healingMultiplier,
    ).toBe(0.5);
  });

  test("Blood school ignores the heal penalty", () => {
    expect(
      runtime.environmentAt([], { school: "blood", x: 0, y: 0 })
        .healingMultiplier,
    ).toBe(1);
  });

  test("kills restore essence at the layer's grade", () => {
    const base =
      hazards.lifedrain.kind === "lifedrain"
        ? hazards.lifedrain.essencePerKill
        : 0;
    expect(runtime.essenceForKill()).toBe(base * 8);
    expect(runtimeOn("frozen_pit").essenceForKill()).toBe(0);
  });
});

describe("generated vent terrain", () => {
  const generated = [{ radius: 2, x: 40, y: 30 }];

  test("a world with generated vents burns those, not the table's", () => {
    const world = { layerId: "ashen_gate", meta: {} };
    setLayerTerrain(world, { layerId: "ashen_gate", ventVolumes: generated });
    expect(worldVentVolumes(world)).toEqual(generated);
  });

  test("a world without generated terrain falls back to the layer table", () => {
    const world = { layerId: "ashen_gate", meta: {} };
    expect(worldVentVolumes(world)).toEqual(activeVentVolumes("ashen_gate"));
    expect(worldVentVolumes(world).length).toBeGreaterThan(0);
  });

  test("terrain from another layer or a layer without vents never burns", () => {
    const world = { layerId: "bone_wastes", meta: {} };
    setLayerTerrain(world, { layerId: "ashen_gate", ventVolumes: generated });
    expect(worldVentVolumes(world)).toEqual([]);
    world.layerId = "ashen_gate";
    expect(worldVentVolumes(world)).toEqual(generated);
  });

  test("malformed saved terrain is ignored", () => {
    const world = {
      layerId: "ashen_gate",
      meta: {
        [LAYER_TERRAIN_META_KEY]: {
          layerId: "ashen_gate",
          ventVolumes: [{ radius: "big", x: 1, y: 1 }],
        },
      },
    };
    expect(worldVentVolumes(world)).toEqual(activeVentVolumes("ashen_gate"));
  });
});
