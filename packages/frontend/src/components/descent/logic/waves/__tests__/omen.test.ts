import { describe, expect, test } from "bun:test";
import { OMEN_LEAD_SECONDS, secondsToWaveTicks } from "../constants";
import { bodiesIn, boot, stepTo, waveAt } from "./support";

describe("Omen timing", () => {
  test("shows the next wave's class mix 60 sim-seconds ahead", () => {
    expect(OMEN_LEAD_SECONDS).toBe(60);
    const { director } = boot("ashen_gate");
    const openTick = secondsToWaveTicks(30);

    director.step(openTick - 1);
    expect(director.getOmen()).toBeNull();

    director.step(1);
    expect(director.getOmen()).toEqual({
      bossId: null,
      composition: { raider: 2 },
      elite: null,
      etaSeconds: 60,
    });

    stepTo(director, 90);
    expect(director.getOmen()).toBeNull();

    stepTo(director, waveAt("ashen_swarm") - 60);
    expect(director.getOmen()).toEqual({
      bossId: null,
      composition: { raider: bodiesIn("ashen_swarm") },
      elite: null,
      etaSeconds: 60,
    });

    stepTo(director, waveAt("ashen_elite_summoner") - 60);
    expect(director.getOmen()).toEqual({
      bossId: null,
      composition: { raider: bodiesIn("ashen_elite_summoner") + 1 },
      elite: { affix: "summoner", classId: "raider" },
      etaSeconds: 60,
    });
    expect(
      director.getEvents().flatMap((event) => {
        if (event.type !== "horn" || event.cue !== "omen") return [];
        return [event.waveId];
      }),
    ).toEqual(["ashen_scout", "ashen_swarm", "ashen_elite_summoner"]);
  });

  test("stays dark without an Omen Tower", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, 30);
    expect(director.getOmen()).toBeNull();
    expect(
      director
        .getEvents()
        .some((event) => event.type === "horn" && event.cue === "omen"),
    ).toBe(false);
  });

  test("horns when the tower is finished inside the window", () => {
    const { director } = boot("ashen_gate", false);
    stepTo(director, 30);
    director.setOmenTowerPresent(true);
    expect(director.getOmen()).toEqual({
      bossId: null,
      composition: { raider: 2 },
      elite: null,
      etaSeconds: 60,
    });
    expect(director.getEvents()).toContainEqual({
      cue: "omen",
      type: "horn",
      waveId: "ashen_scout",
    });
  });
});
