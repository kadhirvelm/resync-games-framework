import { describe, expect, test } from "bun:test";
import { getUnitDefinition } from "../../combat/unitCatalog";
import { LayerRuntime } from "../../layers/layerRuntime";
import { getBossDefinition, getSchedule, getWave } from "../catalog";
import { createWaveState, readOmen, resolveWaveTick } from "../clock";
import {
  HELL_PRESSURE_PER_MINUTE,
  KILL_ESSENCE,
  SUMMONER_FODDER_CAP,
  SUMMONER_INTERVAL_TICKS,
  secondsToWaveTicks,
} from "../constants";
import { WaveDirector } from "../director";
import {
  hordeStatScale,
  pressureStatMultiplier,
  roleKillEssence,
} from "../modifiers";
import { hordeBarkKey, slotPosition } from "../spawn";
import type { WaveUnit } from "../types";
import { bodiesIn, boot, kill, stepTo, waveAt } from "./support";

/**
 * Asserts every body sits inside `[1, width - 2] x [1, height - 2]`.
 * @param units - Bodies to check
 * @param width - Map width
 * @param height - Map height
 */
function expectInside(
  units: readonly WaveUnit[],
  width: number,
  height: number,
): void {
  for (const unit of units) {
    expect(unit.x).toBeGreaterThanOrEqual(1);
    expect(unit.x).toBeLessThanOrEqual(width - 2);
    expect(unit.y).toBeGreaterThanOrEqual(1);
    expect(unit.y).toBeLessThanOrEqual(height - 2);
  }
}

describe("spawn slots", () => {
  test("fill a centred block west from the east edge", () => {
    const bounds = { height: 40, width: 64 };
    expect(slotPosition(0, bounds)).toEqual({ x: 61, y: 20 });
    expect(slotPosition(7, bounds)).toEqual({ x: 40, y: 20 });
    expect(slotPosition(8, bounds)).toEqual({ x: 61, y: 23 });
    expect(slotPosition(16, bounds)).toEqual({ x: 61, y: 17 });
    expect(slotPosition(9, { height: 4, width: 4 })).toEqual({ x: 1, y: 2 });
  });

  test("keep fodder and vent imps inside a small map", () => {
    const runtime = new LayerRuntime({ startLayerId: "ashen_gate" });
    const director = new WaveDirector({
      gate: runtime,
      map: { height: 8, width: 10 },
    });
    director.startLayer("ashen_gate");
    stepTo(director, waveAt("ashen_elite_summoner"));
    director.step(SUMMONER_INTERVAL_TICKS);
    const fodder = director.getUnits().filter((unit) => unit.role === "fodder");
    expect(fodder.length).toBeGreaterThan(0);
    expectInside(director.getUnits(), 10, 8);

    stepTo(director, waveAt("ashen_boss"));
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("Cinderjaw did not spawn");
    director.damageUnit(boss.id, boss.hitPoints - boss.maxHitPoints * 0.5 + 1);
    director.step(
      secondsToWaveTicks(getBossDefinition("cinderjaw").windupSeconds),
    );
    const imps = director.getUnits().filter((unit) => unit.role === "vent_imp");
    expect(imps).toHaveLength(4);
    expectInside(director.getUnits(), 10, 8);
  });
});

describe("overdue waves", () => {
  test("a wave whose mark has passed still spawns", () => {
    const state = createWaveState("ashen_gate", 0);
    state.completedTick = secondsToWaveTicks(100);
    resolveWaveTick(state);
    expect(state.spawnedWaveIds).toEqual(["ashen_scout"]);
    expect(state.units).toHaveLength(2);

    state.completedTick += 1;
    resolveWaveTick(state);
    expect(state.units).toHaveLength(2);
  });

  test("an overdue wave does not hide the next omen", () => {
    const state = createWaveState("ashen_gate", 0);
    state.omenTower = true;
    state.completedTick = secondsToWaveTicks(waveAt("ashen_swarm") - 30);
    expect(readOmen(state)).toMatchObject({
      composition: { raider: bodiesIn("ashen_swarm") },
      etaSeconds: 30,
    });
  });
});

describe("Summoner fodder", () => {
  test("caps live fodder at six per Summoner", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_elite_summoner"));
    director.step(SUMMONER_INTERVAL_TICKS * 5);
    const fodder = director.getUnits().filter((unit) => unit.role === "fodder");
    expect(fodder).toHaveLength(SUMMONER_FODDER_CAP);

    const first = fodder[0];
    if (!first) throw new Error("No fodder spawned");
    kill(director, first.id);
    director.step(SUMMONER_INTERVAL_TICKS);
    expect(
      director.getUnits().filter((unit) => unit.role === "fodder"),
    ).toHaveLength(SUMMONER_FODDER_CAP);
  });

  test("fodder pays a quarter of a normal kill, at least 1", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_elite_summoner"));
    director.step(SUMMONER_INTERVAL_TICKS);
    const fodder = director.getUnits().find((unit) => unit.role === "fodder");
    if (!fodder) throw new Error("No fodder spawned");
    kill(director, fodder.id);
    expect(director.getKillEssence()).toBe(1);

    expect(roleKillEssence(KILL_ESSENCE * 8, "fodder")).toBe(8);
    expect(roleKillEssence(KILL_ESSENCE * 8, "vent_imp")).toBe(8);
    expect(roleKillEssence(1, "vent_imp")).toBe(1);
    expect(roleKillEssence(KILL_ESSENCE, "swarm")).toBe(KILL_ESSENCE);
  });
});

describe("Omen reveal", () => {
  test("names the boss and the elite of the upcoming wave", () => {
    const { director } = boot("ashen_gate");
    stepTo(director, waveAt("ashen_elite_armored") - 30);
    expect(director.getOmen()).toMatchObject({
      bossId: null,
      elite: getWave("ashen_elite_armored").elite,
    });
    stepTo(director, waveAt("ashen_boss") - 60);
    expect(director.getOmen()).toMatchObject({
      bossId: "cinderjaw",
      elite: null,
      etaSeconds: 60,
    });
  });
});

describe("horde depth", () => {
  test("scales hit points and damage by the square root of the grade", () => {
    expect([1, 2, 4, 8, 16].map(hordeStatScale)).toEqual([
      1,
      Math.SQRT2,
      2,
      2 * Math.SQRT2,
      4,
    ]);
    const { director } = boot("bone_wastes", false);
    stepTo(director, 90);
    const warden = director
      .getUnits()
      .find((unit) => unit.classId === "warden");
    const definition = getUnitDefinition("warden");
    const pressure = pressureStatMultiplier(HELL_PRESSURE_PER_MINUTE);
    expect(warden?.maxHitPoints).toBeCloseTo(
      definition.maxHitPoints * Math.SQRT2 * pressure,
    );
    expect(warden?.damage).toBeCloseTo(
      definition.damage * Math.SQRT2 * pressure,
    );
  });

  test("leaves Ashen Gate unscaled", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, 90);
    const raider = getUnitDefinition("raider");
    const scoutScale =
      getSchedule("ashen_gate").waves[0]?.composition[0]?.statScale ?? 1;
    expect(director.getUnits()[0]?.maxHitPoints).toBeCloseTo(
      raider.maxHitPoints *
        scoutScale *
        pressureStatMultiplier(HELL_PRESSURE_PER_MINUTE),
    );
  });

  test("scales a composition group's hit points and damage by its statScale", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, 90);
    const group = getSchedule("ashen_gate").waves[0]?.composition[0];
    expect(group?.statScale).toBeLessThan(1);
    const raider = getUnitDefinition("raider");
    const pressure = pressureStatMultiplier(HELL_PRESSURE_PER_MINUTE);
    const scout = director.getUnits()[0];
    expect(scout?.damage).toBeCloseTo(
      raider.damage * (group?.statScale ?? 1) * pressure,
    );
  });
});

describe("horde bark keys", () => {
  test("come from the layer faction, not the Hold unit", () => {
    const ashen = boot("ashen_gate", false);
    stepTo(ashen.director, 90);
    expect(ashen.director.getUnits()[0]?.barkKey).toBe("imp_swarm.raider");

    const bone = boot("bone_wastes", false);
    stepTo(bone.director, 90);
    const warden = bone.director
      .getUnits()
      .find((unit) => unit.classId === "warden");
    expect(warden?.barkKey).toBe("bone_legion.warden");
    expect(hordeBarkKey("Combined hordes", "adept")).toBe(
      "combined_hordes.adept",
    );
  });
});
