import { describe, expect, test } from "bun:test";
import { createDescentSim } from "../../sim/descentSim";
import { getWave } from "../catalog";
import { secondsToWaveTicks } from "../constants";
import { wavesModule } from "../module";
import { boot, stepTo } from "./support";

describe("paused wave clock", () => {
  test("does not spawn or move the omen while paused", () => {
    const { director } = boot("ashen_gate");
    const spawnTick = secondsToWaveTicks(getWave("ashen_scout").spawnAtSeconds);

    stepTo(director, 30);
    const eta = director.getOmen()?.etaSeconds;
    const tick = director.tick;
    director.setPaused(true);
    director.step(spawnTick);
    expect(director.tick).toBe(tick);
    expect(director.getOmen()?.etaSeconds).toBe(eta);
    expect(director.getUnits()).toHaveLength(0);

    director.setPaused(false);
    director.step(spawnTick - tick);
    expect(director.getUnits()).toHaveLength(2);
    expect(director.getUnits().every((unit) => unit.classId === "raider")).toBe(
      true,
    );
    expect(director.getUnits()[0]?.factionId).toBe("Imp Swarm");
    expect(
      director
        .getCombatUnits()
        .every((unit) => unit.isWaveUnit && unit.classId === "raider"),
    ).toBe(true);
  });

  test("the sim clock does not advance a wave while paused", () => {
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule],
      seed: 8,
    });
    const spawnTick = secondsToWaveTicks(getWave("ashen_scout").spawnAtSeconds);
    expect(sim.step(spawnTick - 1)).toBe(spawnTick - 1);
    expect(sim.snapshot().units).toHaveLength(0);

    sim.setPaused(true);
    expect(sim.step(40)).toBe(0);
    expect(sim.tick).toBe(spawnTick - 1);
    expect(sim.snapshot().units).toHaveLength(0);

    sim.setPaused(false);
    expect(sim.step(1)).toBe(1);
    expect(sim.snapshot().units).toHaveLength(2);
    expect(
      sim.snapshot().units.every((unit) => unit.classId === "raider"),
    ).toBe(true);
  });
});
