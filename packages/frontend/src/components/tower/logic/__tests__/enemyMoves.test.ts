import { describe, expect, test } from "bun:test";
import {
  ALL_TARGET_DAMAGE_SHARE,
  inferTargetPattern,
  scaleEnemy,
  toEnemyMoves,
} from "../enemyMoves";
import type { EnemyTargetPattern } from "../towerTypes";

const TARGET_CASES: [string, EnemyTargetPattern][] = [
  ["Quick bite: Deal 6 damage.", "front"],
  ["Low lunging strike: Deal 9 damage.", "back"],
  ["Resonance Slam: Deal 16 damage.", "all"],
  ["Thorn rain: Deal 10 damage.", "all"],
  ["Snipes the stragglers.", "back"],
];

describe("inferTargetPattern", () => {
  test.each(TARGET_CASES)("%s → %s", (text, expected) => {
    expect(inferTargetPattern(text)).toBe(expected);
  });
});

describe("toEnemyMoves", () => {
  test("softens party-wide attacks and rewrites their number", () => {
    const [move] = toEnemyMoves(
      [{ amount: 10, kind: "attack", text: "Shockwave: Deal 10 damage." }],
      40,
    );
    expect(move).toEqual({
      amount: Math.round(10 * ALL_TARGET_DAMAGE_SHARE),
      kind: "attack",
      target: "all",
      text: "Shockwave: Deal 6 damage.",
    });
  });

  test("gives an enemy with no cycle a strike, guard, heavy strike loop", () => {
    const moves = toEnemyMoves([], 36);
    expect(moves.map((move) => move.kind)).toEqual([
      "attack",
      "defend",
      "attack",
    ]);
    expect((moves[2]?.amount ?? 0) > (moves[0]?.amount ?? 0)).toBe(true);
  });
});

describe("scaleEnemy", () => {
  test("hits the floor's health and average attack while keeping the cycle's shape", () => {
    const template = {
      description: "",
      id: "warden",
      maxHitPoints: 90,
      moves: toEnemyMoves(
        [
          { amount: 12, kind: "defend", text: "Brace: Gain 12 block." },
          { amount: 10, kind: "attack", text: "Strike: Deal 10 damage." },
          { amount: 20, kind: "attack", text: "Crush: Deal 20 damage." },
        ],
        90,
      ),
      name: "Warden",
    };
    const scaled = scaleEnemy(template, { attack: 6, hitPoints: 30 });
    expect(scaled.maxHitPoints).toBe(30);
    expect(scaled.moves.map((move) => move.amount)).toEqual([5, 4, 8]);
    expect(scaled.moves[2]?.text).toBe("Crush: Deal 8 damage.");
  });
});
