import { describe, expect, test } from "bun:test";
import { BUILT_IN_TOWER } from "../builtInContent";
import {
  ascensionScale,
  FLOOR_PLANS,
  generateTower,
  planRewards,
  TOWER_FLOOR_COUNT,
} from "../generateTower";
import { SeededRandom } from "../random";

describe("generateTower", () => {
  test("builds a linear climb ending in a single boss", () => {
    const rooms = generateTower(BUILT_IN_TOWER, new SeededRandom(3));
    expect(rooms.map((room) => room.floor)).toEqual(
      Array.from({ length: TOWER_FLOOR_COUNT }, (_, index) => index + 1),
    );
    expect(rooms.filter((room) => room.isBoss)).toHaveLength(1);
    expect(rooms.at(-1)?.enemies).toHaveLength(1);
    expect(rooms.at(-1)?.reward).toBeUndefined();
  });

  test("each floor gets the enemy count its plan asks for, scaled to its budget", () => {
    const rooms = generateTower(BUILT_IN_TOWER, new SeededRandom(5));
    FLOOR_PLANS.forEach((plan, index) => {
      const room = rooms[index];
      expect(room?.enemies).toHaveLength(plan.enemyCount);
      for (const enemy of room?.enemies ?? []) {
        expect(enemy.maxHitPoints).toBeGreaterThanOrEqual(
          Math.round(plan.hitPoints * 0.8),
        );
        expect(enemy.maxHitPoints).toBeLessThanOrEqual(
          Math.round(plan.hitPoints * 1.2),
        );
      }
    });
  });

  test("the boss is the toughest enemy in the tower", () => {
    const boss = generateTower(BUILT_IN_TOWER, new SeededRandom(8)).at(-1)
      ?.enemies[0];
    expect(boss?.templateId).toBe("builtin-stone-lion");
    expect(boss?.isBoss).toBe(true);
  });

  test("spawn ids are unique across the tower", () => {
    const ids = generateTower(BUILT_IN_TOWER, new SeededRandom(2)).flatMap(
      (room) => room.enemies.map((enemy) => enemy.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("planRewards", () => {
  test("opens with a Coreborn and never repeats a reward on neighbouring floors", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const rewards = planRewards(new SeededRandom(seed));
      expect(rewards).toHaveLength(FLOOR_PLANS.length);
      expect(rewards[0]).toBe("coreborn");
      rewards.slice(1).forEach((reward, index) => {
        expect(reward).not.toBe(rewards[index]);
      });
    }
  });
});

describe("ascension", () => {
  test("higher ascensions scale every enemy up from the same seed", () => {
    const plain = generateTower(BUILT_IN_TOWER, new SeededRandom(8));
    const ascended = generateTower(BUILT_IN_TOWER, new SeededRandom(8), 3);
    plain.forEach((room, roomIndex) => {
      room.enemies.forEach((enemy, enemyIndex) => {
        const harder = ascended[roomIndex]?.enemies[enemyIndex];
        expect(harder?.templateId).toBe(enemy.templateId);
        expect(harder?.maxHitPoints ?? 0).toBeGreaterThan(enemy.maxHitPoints);
      });
    });
  });

  test("the scale is clamped to the supported levels", () => {
    expect(ascensionScale(0)).toEqual({ attack: 1, hitPoints: 1 });
    expect(ascensionScale(-2)).toEqual({ attack: 1, hitPoints: 1 });
    expect(ascensionScale(99)).toEqual(ascensionScale(5));
  });
});
