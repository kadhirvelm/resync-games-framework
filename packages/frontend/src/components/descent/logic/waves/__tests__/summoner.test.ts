import { describe, expect, test } from "bun:test";
import { SUMMONER_FODDER_COUNT, SUMMONER_INTERVAL_TICKS } from "../constants";
import { boot, kill, stepTo, waveAt } from "./support";

describe("Summoner", () => {
  test("spawns raider fodder during the fight and stops when it dies", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, waveAt("ashen_elite_summoner"));
    const summoner = director
      .getUnits()
      .find((unit) => unit.affix === "summoner");
    expect(summoner?.classId).toBe("raider");
    expect(
      director.getUnits().filter((unit) => unit.role === "fodder"),
    ).toHaveLength(0);
    if (!summoner) throw new Error("Summoner did not spawn");

    director.step(SUMMONER_INTERVAL_TICKS);
    const fodder = director.getUnits().filter((unit) => unit.role === "fodder");
    expect(fodder).toHaveLength(SUMMONER_FODDER_COUNT);
    expect(fodder.every((unit) => unit.classId === "raider")).toBe(true);
    const fodderIds = new Set(fodder.map((unit) => unit.id));
    expect(
      director
        .getCombatUnits()
        .filter((unit) => fodderIds.has(unit.id))
        .every((unit) => unit.isWaveUnit && unit.classId === "raider"),
    ).toBe(true);

    kill(director, summoner.id);
    director.step(SUMMONER_INTERVAL_TICKS);
    expect(
      director.getUnits().filter((unit) => unit.role === "fodder"),
    ).toHaveLength(SUMMONER_FODDER_COUNT);
  });
});
