import { describe, expect, test } from "bun:test";
import { BOSS_DEFINITIONS } from "../catalog";
import { boot, stepTo, waveAt } from "./support";

describe("wave schedule", () => {
  test("lists the five bosses and keeps siege off the early layers", () => {
    expect(BOSS_DEFINITIONS.map((boss) => boss.name)).toEqual([
      "Cinderjaw",
      "Marshal Orrec Vane",
      "Queen Isolde",
      "Maw-of-Tides",
      "The Warden of Layers",
    ]);

    const ashen = boot("ashen_gate", false);
    stepTo(ashen.director, waveAt("ashen_swarm"));
    expect(
      ashen.director
        .getUnits()
        .every((unit) => unit.preferredTarget === "unit"),
    ).toBe(true);

    const pit = boot("frozen_pit", false);
    stepTo(pit.director, 180);
    const swarm = pit.director
      .getUnits()
      .filter((unit) => unit.waveId === "pit_swarm");
    const siege = swarm.filter((unit) => unit.preferredTarget === "wall");
    expect(siege.length).toBe(Math.ceil(swarm.length * 0.25));
    expect(siege.every((unit) => unit.classId === "breaker")).toBe(true);
  });

  test("caps wave power at 60% over the layer base", () => {
    const poor = boot("ashen_gate", false);
    const rich = boot("ashen_gate", false);
    rich.director.setCollectedEssence(10_000);
    stepTo(poor.director, 90);
    stepTo(rich.director, 90);
    const poorHp = poor.director.getUnits()[0]?.maxHitPoints ?? 0;
    const richHp = rich.director.getUnits()[0]?.maxHitPoints ?? 0;
    expect(richHp / poorHp).toBeCloseTo(1.6);
  });
});
