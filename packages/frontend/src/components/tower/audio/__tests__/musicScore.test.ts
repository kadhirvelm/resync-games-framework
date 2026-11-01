import { describe, expect, test } from "bun:test";
import {
  MELODY_LADDER,
  MOOD_SCORES,
  musicMoodFor,
  musicTrackUrl,
  nextMelodyStep,
  tonesForBeat,
} from "../musicScore";

describe("musicMoodFor", () => {
  test("menus, camp, battle, summit, and defeat each get their own mood", () => {
    expect(musicMoodFor({ inClimb: false, isBossRoom: false })).toBe("menu");
    expect(
      musicMoodFor({ inClimb: true, isBossRoom: false, phase: "camp" }),
    ).toBe("camp");
    expect(
      musicMoodFor({ inClimb: true, isBossRoom: false, phase: "battle" }),
    ).toBe("battle");
    expect(
      musicMoodFor({ inClimb: true, isBossRoom: true, phase: "battle" }),
    ).toBe("boss");
    expect(
      musicMoodFor({ inClimb: true, isBossRoom: false, phase: "defeat" }),
    ).toBe("silent");
  });
});

describe("musicTrackUrl", () => {
  test("uses a generated bed in a climb and keeps the menu synthesized", () => {
    const music = { battle: "https://cdn.test/battle.mp3" };
    expect(musicTrackUrl("battle", music)).toBe("https://cdn.test/battle.mp3");
    expect(musicTrackUrl("camp", music)).toBeUndefined();
    expect(musicTrackUrl("menu", music)).toBeUndefined();
    expect(musicTrackUrl("battle", undefined)).toBeUndefined();
  });
});

describe("nextMelodyStep", () => {
  test("stays on the ladder at both ends", () => {
    for (const roll of [0, 0.2, 0.5, 0.99]) {
      const low = nextMelodyStep(0, roll);
      const high = nextMelodyStep(MELODY_LADDER.length - 1, roll);
      expect(low).toBeGreaterThanOrEqual(0);
      expect(high).toBeLessThan(MELODY_LADDER.length);
    }
  });

  test("moves by at most two rungs", () => {
    expect(Math.abs(nextMelodyStep(5, 0.4) - 5)).toBeLessThanOrEqual(2);
  });
});

describe("tonesForBeat", () => {
  test("the first beat of a bar lays a pad chord", () => {
    const tones = tonesForBeat("menu", 0, 4, 0.99);
    expect(tones.filter((tone) => tone.attack !== undefined)).toHaveLength(4);
  });

  test("battle thumps on its pulse and menus never do", () => {
    const thump = (mood: "battle" | "menu", beat: number) =>
      tonesForBeat(mood, beat, 4, 0.99).some((tone) => tone.glideTo === 42);
    expect(thump("battle", MOOD_SCORES.battle.thumpEvery)).toBe(true);
    expect(thump("menu", 4)).toBe(false);
  });

  test("the melody plays only when the roll lands under its chance", () => {
    const melody = (roll: number) =>
      tonesForBeat("camp", 3, 4, roll).some(
        (tone) => tone.frequency === MELODY_LADDER[4],
      );
    expect(melody(0)).toBe(true);
    expect(melody(0.99)).toBe(false);
  });
});
