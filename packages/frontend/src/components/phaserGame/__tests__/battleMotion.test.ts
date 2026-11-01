import { describe, expect, test } from "bun:test";
import {
  HEAVY_HIT_DAMAGE,
  isHeavyImpact,
  paced,
  roomTitleCard,
  stepSounds,
} from "../battleMotion";

const room = {
  floor: 3,
  floorCount: 7,
  isBoss: false,
  title: "Moss Hall",
};

describe("paced", () => {
  test("scales durations by the battle speed", () => {
    expect(paced(720, 1)).toBe(720);
    expect(paced(720, 0.5)).toBe(360);
    expect(paced(100, 1.35)).toBe(135);
  });

  test("treats a missing or broken pace as normal speed", () => {
    expect(paced(400, 0)).toBe(400);
    expect(paced(400, -2)).toBe(400);
    expect(paced(400, Number.NaN)).toBe(400);
  });
});

describe("isHeavyImpact", () => {
  test("big hits and deaths are heavy; small hits are not", () => {
    const hit = (dealt: number) => ({
      blocked: 0,
      dealt,
      kind: "damage" as const,
      sourceId: "a",
      targetId: "b",
    });
    expect(isHeavyImpact(hit(HEAVY_HIT_DAMAGE))).toBe(true);
    expect(isHeavyImpact(hit(HEAVY_HIT_DAMAGE - 1))).toBe(false);
    expect(isHeavyImpact({ cardsRemoved: 0, kind: "death", unitId: "b" })).toBe(
      true,
    );
  });
});

describe("stepSounds", () => {
  test("plays each effect once per step, in order", () => {
    expect(
      stepSounds([
        { cardId: "c", kind: "card-played", ownerId: "o" },
        { amount: 4, kind: "block", targetId: "a" },
        { amount: 4, kind: "block", targetId: "b" },
      ]),
    ).toEqual(["card", "block"]);
  });

  test("a fully blocked hit sounds like block", () => {
    expect(
      stepSounds([
        { blocked: 6, dealt: 0, kind: "damage", sourceId: "e", targetId: "a" },
      ]),
    ).toEqual(["block"]);
  });

  test("a heavy hit replaces ordinary hits in the same step", () => {
    expect(
      stepSounds([
        { blocked: 0, dealt: 3, kind: "damage", sourceId: "e", targetId: "a" },
        { cardsRemoved: 2, kind: "death", unitId: "a" },
      ]),
    ).toEqual(["heavy-hit"]);
  });

  test("only later turns chime; the opening card handles turn 1", () => {
    expect(stepSounds([{ kind: "turn-start", turn: 1 }])).toEqual([]);
    expect(stepSounds([{ kind: "turn-start", turn: 2 }])).toEqual(["turn"]);
  });
});

describe("roomTitleCard", () => {
  test("names the floor for ordinary rooms", () => {
    expect(roomTitleCard(room)).toEqual({
      eyebrow: "Floor 3 of 7",
      title: "Moss Hall",
    });
  });

  test("announces the Tower Heart at the summit", () => {
    expect(roomTitleCard({ ...room, isBoss: true })).toEqual({
      eyebrow: "The summit",
      subtitle: "The Tower Heart awakens",
      title: "Moss Hall",
    });
  });
});
