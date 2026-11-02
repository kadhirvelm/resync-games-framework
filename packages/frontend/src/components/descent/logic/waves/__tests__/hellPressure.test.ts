import { describe, expect, test } from "bun:test";
import { getUnitDefinition } from "../../combat/unitCatalog";
import { createDescentSim } from "../../sim/descentSim";
import { getSchedule } from "../catalog";
import { HELL_PRESSURE_PER_MINUTE, TICKS_PER_MINUTE } from "../constants";
import { pressureStatMultiplier, wavePowerMultiplier } from "../modifiers";
import { getHellPressureFromMeta, wavesModule } from "../module";
import { boot, kill, stepTo, waveAt } from "./support";

describe("Hell Pressure", () => {
  test("rises each minute an uncleared layer stays open, then stops", () => {
    const { director, runtime } = boot("ashen_gate", false);
    expect(director.getHellPressure()).toBe(0);
    director.step(TICKS_PER_MINUTE - 1);
    expect(director.getHellPressure()).toBe(0);
    director.step(1);
    expect(director.getHellPressure()).toBeCloseTo(HELL_PRESSURE_PER_MINUTE);
    director.step(TICKS_PER_MINUTE);
    expect(director.getHellPressure()).toBeCloseTo(
      HELL_PRESSURE_PER_MINUTE * 2,
    );

    stepTo(director, waveAt("ashen_boss"));
    const locked = director.getHellPressure();
    expect(locked).toBeCloseTo(
      HELL_PRESSURE_PER_MINUTE * Math.floor(waveAt("ashen_boss") / 60),
    );
    const boss = director.getUnits().find((unit) => unit.role === "boss");
    if (!boss) throw new Error("Cinderjaw did not spawn");
    kill(director, boss.id);
    expect(runtime.isBossGateCleared()).toBe(true);
    director.step(TICKS_PER_MINUTE);
    expect(director.getHellPressure()).toBeCloseTo(locked);
  });

  test("does not rise while the clock is paused", () => {
    const { director } = boot("ashen_gate", false);
    director.step(TICKS_PER_MINUTE - 1);
    director.setPaused(true);
    director.step(TICKS_PER_MINUTE);
    expect(director.getHellPressure()).toBe(0);
    director.setPaused(false);
    director.step(1);
    expect(director.getHellPressure()).toBeCloseTo(HELL_PRESSURE_PER_MINUTE);
  });

  test("caps at 1 and buffs horde hit points", () => {
    const { director } = boot("ashen_gate", false);
    const minutesToFill = Math.ceil(1 / HELL_PRESSURE_PER_MINUTE);
    director.step(TICKS_PER_MINUTE * (minutesToFill - 1));
    expect(director.getHellPressure()).toBeCloseTo(
      HELL_PRESSURE_PER_MINUTE * (minutesToFill - 1),
    );
    director.step(TICKS_PER_MINUTE);
    expect(director.getHellPressure()).toBeCloseTo(1);
    director.step(TICKS_PER_MINUTE);
    expect(director.getHellPressure()).toBeCloseTo(1);

    const pressured = boot("ashen_gate", false);
    stepTo(pressured.director, 90);
    const raider = getUnitDefinition("raider");
    const spawned = pressured.director.getUnits()[0];
    const scoutScale =
      getSchedule("ashen_gate").waves[0]?.composition[0]?.statScale ?? 1;
    expect(spawned?.maxHitPoints).toBeCloseTo(
      raider.maxHitPoints *
        scoutScale *
        wavePowerMultiplier(0, 1) *
        pressureStatMultiplier(HELL_PRESSURE_PER_MINUTE),
    );
  });

  test("follows the sim clock on an uncleared layer", () => {
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule],
      seed: 4,
    });
    sim.step(TICKS_PER_MINUTE);
    expect(getHellPressureFromMeta(sim.snapshot().meta)).toBeCloseTo(
      HELL_PRESSURE_PER_MINUTE,
    );
    sim.setPaused(true);
    sim.step(TICKS_PER_MINUTE);
    expect(getHellPressureFromMeta(sim.snapshot().meta)).toBeCloseTo(
      HELL_PRESSURE_PER_MINUTE,
    );
  });
});
