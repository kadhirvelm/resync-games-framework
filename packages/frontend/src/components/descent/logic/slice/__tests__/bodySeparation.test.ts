import { describe, expect, test } from "bun:test";
import { BOSS_SIZE_SCALE } from "../../waves/constants";
import {
  BODY_RADIUS,
  BOSS_BODY_RADIUS,
  resolveOverlaps,
  type SeparationBody,
} from "../sliceCombat";

const map = { height: 100, width: 100 };

/**
 * @param x - Start x
 * @param radius - Collision radius
 * @param fixed - Whether the body never moves
 * @returns A separation body on the y = 50 line
 */
function body(x: number, radius = BODY_RADIUS, fixed = false): SeparationBody {
  return { body: { x, y: 50 }, fixed, radius };
}

describe("resolveOverlaps", () => {
  test("keeps two ordinary bodies 0.7 cells apart, splitting the push", () => {
    const left = body(50);
    const right = body(50.3);
    resolveOverlaps([left, right], map);
    expect(right.body.x - left.body.x).toBeCloseTo(0.7, 2);
    expect(50 - left.body.x).toBeCloseTo(right.body.x - 50.3, 2);
  });

  test("gives the boss a body three times as wide", () => {
    expect(BOSS_BODY_RADIUS).toBeCloseTo(BODY_RADIUS * BOSS_SIZE_SCALE, 6);
    const boss = body(50, BOSS_BODY_RADIUS);
    const raider = body(50.5);
    resolveOverlaps([boss, raider], map);
    expect(raider.body.x - boss.body.x).toBeCloseTo(
      BOSS_BODY_RADIUS + BODY_RADIUS,
      2,
    );
  });

  test("lets the boss shoulder smaller bodies aside", () => {
    const boss = body(50, BOSS_BODY_RADIUS);
    const warden = body(50.5);
    resolveOverlaps([boss, warden], map);
    const bossMoved = 50 - boss.body.x;
    const wardenMoved = warden.body.x - 50.5;
    expect(bossMoved).toBeLessThan(wardenMoved / 5);
  });

  test("still never moves a fixed villager", () => {
    const villager = body(50, BODY_RADIUS, true);
    const boss = body(50.5, BOSS_BODY_RADIUS);
    resolveOverlaps([villager, boss], map);
    expect(villager.body.x).toBe(50);
  });
});
