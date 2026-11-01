import { describe, expect, test } from "bun:test";
import type { UnitSprite } from "../../tower/logic/towerTypes";
import {
  listBattleSpriteRequests,
  spriteAnimationKey,
  spriteCuesForEvent,
  spriteDisplayScale,
  spriteTextureKey,
  spriteTimeScale,
} from "../battleSprites";

/**
 * @param id - Sprite-sheet id
 * @param moves - Moves the figure has strips for
 * @returns A battle figure with one six-frame strip per move
 */
function figure(
  id: string,
  moves: ("idle" | "attack" | "defend" | "hurt")[],
): UnitSprite {
  return {
    animations: Object.fromEntries(
      moves.map((move) => [
        move,
        {
          fps: move === "attack" ? 12 : 8,
          frameCount: 6,
          loop: move === "idle",
          stripUrl: `/static/sprite-sheets/${id}/${move}.png`,
        },
      ]),
    ),
    facing: "right",
    frameHeight: 180,
    frameWidth: 140,
    id,
  };
}

describe("listBattleSpriteRequests", () => {
  test("loads each figure's strips once, idle first", () => {
    const fox = figure("fox", ["attack", "idle", "hurt"]);
    const requests = listBattleSpriteRequests(
      [{ sprite: fox }, { sprite: fox }, { sprite: undefined }],
      "https://api.test",
    );

    expect(requests.map((request) => request.textureKey)).toEqual([
      spriteTextureKey("fox", "idle"),
      spriteTextureKey("fox", "attack"),
      spriteTextureKey("fox", "hurt"),
    ]);
    expect(requests[0]).toEqual({
      animationKey: spriteAnimationKey("fox", "idle"),
      fps: 8,
      frameCount: 6,
      frameHeight: 180,
      frameWidth: 140,
      loop: true,
      textureKey: spriteTextureKey("fox", "idle"),
      url: "https://api.test/static/sprite-sheets/fox/idle.png",
    });
  });

  test("skips a figure that cannot idle", () => {
    expect(
      listBattleSpriteRequests([{ sprite: figure("crane", ["attack"]) }]),
    ).toEqual([]);
  });
});

describe("spriteCuesForEvent", () => {
  test("an attacker swings and a wounded target flinches", () => {
    expect(
      spriteCuesForEvent({
        blocked: 2,
        dealt: 5,
        kind: "damage",
        sourceId: "fox",
        targetId: "boar",
      }),
    ).toEqual([
      { move: "attack", unitId: "fox" },
      { move: "hurt", unitId: "boar" },
    ]);
  });

  test("a hit fully soaked by block is guarded", () => {
    expect(
      spriteCuesForEvent({
        blocked: 6,
        dealt: 0,
        kind: "damage",
        sourceId: "boar",
        targetId: "fox",
      }),
    ).toEqual([
      { move: "attack", unitId: "boar" },
      { move: "defend", unitId: "fox" },
    ]);
  });

  test("self-inflicted damage only flinches", () => {
    expect(
      spriteCuesForEvent({
        blocked: 0,
        dealt: 3,
        kind: "damage",
        sourceId: "fox",
        targetId: "fox",
      }),
    ).toEqual([{ move: "hurt", unitId: "fox" }]);
  });

  test("gaining block raises a guard", () => {
    expect(
      spriteCuesForEvent({ amount: 4, kind: "block", targetId: "crane" }),
    ).toEqual([{ move: "defend", unitId: "crane" }]);
  });

  test("other events move no one", () => {
    expect(spriteCuesForEvent({ kind: "turn-start", turn: 2 })).toEqual([]);
    expect(
      spriteCuesForEvent({
        cardId: "palm",
        kind: "card-played",
        ownerId: "fox",
      }),
    ).toEqual([]);
  });
});

describe("spriteDisplayScale", () => {
  test("fills the slot's height", () => {
    expect(
      spriteDisplayScale(
        { frameHeight: 200, frameWidth: 100 },
        { height: 150, width: 120 },
      ),
    ).toBe(0.75);
  });

  test("shrinks a wide frame so it does not spill far past the slot", () => {
    expect(
      spriteDisplayScale(
        { frameHeight: 100, frameWidth: 400 },
        { height: 150, width: 120 },
      ),
    ).toBe(0.45);
  });
});

describe("spriteTimeScale", () => {
  test("plays faster when the battle speed shortens durations", () => {
    expect(spriteTimeScale(1)).toBe(1);
    expect(spriteTimeScale(0.5)).toBe(2);
    expect(spriteTimeScale(Number.NaN)).toBe(1);
  });
});
