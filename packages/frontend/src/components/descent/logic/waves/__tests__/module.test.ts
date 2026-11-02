import { describe, expect, test } from "bun:test";
import { LayerRuntime } from "../../layers/layerRuntime";
import { createDescentSim } from "../../sim/descentSim";
import { getWave } from "../catalog";
import { damageWaveUnit } from "../clock";
import { secondsToWaveTicks } from "../constants";
import { createWavesModule, getOmenFromMeta, wavesModule } from "../module";
import { bodiesIn, clockOf, probeModule, waveAt } from "./support";

const BOSS_TICK = secondsToWaveTicks(getWave("ashen_boss").spawnAtSeconds);
const SCOUT_TICK = secondsToWaveTicks(getWave("ashen_scout").spawnAtSeconds);

describe("waves module", () => {
  test("opens the gate after a direct damageWaveUnit boss kill", () => {
    const runtime = new LayerRuntime({ startLayerId: "ashen_gate" });
    const killer = probeModule((world) => {
      const clock = clockOf(world);
      const boss = clock.units.find((unit) => unit.role === "boss");
      if (boss) damageWaveUnit(clock, boss.id, 1_000_000);
    });
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [createWavesModule(runtime), killer],
      seed: 3,
    });

    sim.step(BOSS_TICK);
    expect(runtime.isBossGateCleared()).toBe(false);
    sim.step(1);
    expect(runtime.isBossGateCleared()).toBe(true);
  });

  test("lays spawns inside the world's map, near the east edge", () => {
    const sim = createDescentSim({
      layerId: "ashen_gate",
      map: { height: 40, width: 64 },
      modules: [wavesModule],
      seed: 5,
    });
    sim.step(secondsToWaveTicks(waveAt("ashen_swarm")));
    const units = sim.snapshot().units;
    expect(units.length).toBe(
      bodiesIn("ashen_scout") + bodiesIn("ashen_swarm"),
    );
    expect(units[0]).toMatchObject({ x: 61, y: 20 });
    for (const unit of units) {
      expect(unit.x).toBeGreaterThanOrEqual(40);
      expect(unit.x).toBeLessThanOrEqual(62);
      expect(unit.y).toBeGreaterThanOrEqual(1);
      expect(unit.y).toBeLessThanOrEqual(38);
    }

    const narrow = createDescentSim({
      layerId: "ashen_gate",
      map: { height: 12, width: 16 },
      modules: [wavesModule],
      seed: 5,
    });
    narrow.step(secondsToWaveTicks(waveAt("ashen_swarm")));
    for (const unit of narrow.snapshot().units) {
      expect(unit.x).toBeGreaterThanOrEqual(1);
      expect(unit.x).toBeLessThanOrEqual(14);
      expect(unit.y).toBeGreaterThanOrEqual(1);
      expect(unit.y).toBeLessThanOrEqual(10);
    }
  });

  test("an Omen Tower must be completed before it can see", () => {
    const tower = { buildingType: "omen_tower", completed: false, id: "omen" };
    const builder = probeModule(
      () => {},
      (world) => world.buildings.push({ ...tower, x: 10, y: 20 }),
    );
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule, builder],
      seed: 6,
    });
    sim.step(secondsToWaveTicks(40));
    expect(getOmenFromMeta(sim.snapshot().meta)).toBeNull();

    const unmarked = probeModule(
      () => {},
      (world) =>
        world.buildings.push({
          buildingType: "omen_tower",
          id: "o",
          x: 1,
          y: 1,
        }),
    );
    const legacy = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule, unmarked],
      seed: 6,
    });
    legacy.step(secondsToWaveTicks(40));
    expect(getOmenFromMeta(legacy.snapshot().meta)).toBeNull();

    const finisher = probeModule((world) => {
      for (const building of world.buildings) {
        Object.assign(building, { completed: true });
      }
    });
    const finished = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule, builder, { ...finisher, id: "finisher" }],
      seed: 6,
    });
    finished.step(secondsToWaveTicks(40));
    expect(getOmenFromMeta(finished.snapshot().meta)?.etaSeconds).toBe(50);
  });

  test("spending essence never lowers wave power", () => {
    let spent = false;
    const spender = probeModule(
      (world) => {
        if (spent || world.tick < 20) return;
        world.resources.essence = 0;
        spent = true;
      },
      (world) => {
        world.resources.essence = 500;
      },
    );
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule, spender],
      seed: 7,
    });
    sim.step(40);
    const meta = sim.snapshot().meta;
    expect(spent).toBe(true);
    expect((meta.waves as { collectedEssence: number }).collectedEssence).toBe(
      500,
    );
  });

  test("trackedUnitIds only lists living bodies", () => {
    let killed = false;
    const killer = probeModule((world) => {
      const clock = clockOf(world);
      if (killed || clock.units.length === 0) return;
      for (const unit of [...clock.units]) {
        damageWaveUnit(clock, unit.id, 1_000_000);
      }
      killed = true;
    });
    const sim = createDescentSim({
      layerId: "ashen_gate",
      modules: [wavesModule, killer],
      seed: 9,
    });
    sim.step(SCOUT_TICK);
    const before = sim.snapshot().meta.waves as { trackedUnitIds: string[] };
    expect(before.trackedUnitIds).toHaveLength(2);
    sim.step(1);
    const after = sim.snapshot().meta.waves as { trackedUnitIds: string[] };
    expect(after.trackedUnitIds).toEqual([]);
    expect(sim.snapshot().units).toHaveLength(0);
  });
});
