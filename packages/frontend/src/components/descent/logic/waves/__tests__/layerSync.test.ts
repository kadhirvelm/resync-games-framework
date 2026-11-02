import { describe, expect, test } from "bun:test";
import calamityData from "../../../data/calamities.json";
import treasureData from "../../../data/treasures.json";
import { BOSS_DEFINITIONS, getBossDefinition } from "../catalog";
import { secondsToWaveTicks } from "../constants";
import { boot, kill, stepTo, waveAt } from "./support";

describe("boss rewards", () => {
  test("drop the generic boss core and real treasure ids", () => {
    const treasureIds = new Set(treasureData.map((treasure) => treasure.id));
    for (const boss of BOSS_DEFINITIONS) {
      expect(boss.bossCoreId).toBe(calamityData.bossCoreItemId);
      expect(boss.bossCoreId).toBe("boss_core");
      for (const treasureId of boss.treasureChoice) {
        expect(treasureIds.has(treasureId)).toBe(true);
      }
    }
    expect(getBossDefinition("cinderjaw").treasureChoice).toEqual([
      "cinder_banner",
      "wardstone",
    ]);
  });
});

describe("director sim clock", () => {
  test("descends on a monotonic clock the layers runtime can trust", () => {
    const { director, runtime } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_boss"));
    const cinderjaw = director.getUnits().find((unit) => unit.role === "boss");
    if (!cinderjaw) throw new Error("Cinderjaw did not spawn");
    kill(director, cinderjaw.id);
    expect(director.requestDescend()).toEqual({ ok: true });
    expect(runtime.serialize().layerStartedAtSimSeconds).toBe(
      waveAt("ashen_boss"),
    );
    expect(director.tick).toBe(0);

    stepTo(director, waveAt("bone_boss"));
    const descendedAt = waveAt("ashen_boss") + waveAt("bone_boss");
    expect(director.totalTicks).toBe(secondsToWaveTicks(descendedAt));
    const orrec = director.getUnits().find((unit) => unit.role === "boss");
    if (!orrec) throw new Error("Orrec did not spawn");
    kill(director, orrec.id);
    expect(director.requestDescend()).toEqual({ ok: true });
    expect(runtime.getActiveLayer().id).toBe("frozen_pit");
    expect(runtime.serialize().layerStartedAtSimSeconds).toBe(descendedAt);
  });
});

describe("the Warden's cold rule", () => {
  test("slows the Hold through the encounter, never the horde", () => {
    const { director } = boot("throne_of_hell", false);
    stepTo(director, waveAt("throne_boss"));
    const before = new Map(
      director.getUnits().map((unit) => [unit.id, unit.speed]),
    );
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("The Warden did not spawn");
    const windup = secondsToWaveTicks(
      getBossDefinition("warden_of_layers").windupSeconds,
    );
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.25 + 1);
    director.step(windup * 3);

    expect(director.getEncounter().rotatedRule).toBe("cold");
    expect(director.getEncounter().moveSpeedMultiplier).toBe(0.8);
    for (const unit of director.getUnits()) {
      expect(unit.speed).toBeCloseTo(before.get(unit.id) ?? Number.NaN);
    }
  });
});
