import { describe, expect, test } from "bun:test";
import {
  FORMATION_SPACING,
  type FormationMember,
  formationRankWidth,
  MAX_RANK_WIDTH,
  planFormation,
} from "../formation";

/**
 * @param id - Unit id
 * @param classId - Unit class
 * @param x - Start x
 * @param y - Start y
 * @returns A formation member
 */
function member(
  id: string,
  classId: FormationMember["classId"],
  x = 0,
  y = 0,
): FormationMember {
  return { classId, id, x, y };
}

describe("planFormation", () => {
  test("sends a lone unit to the clicked point", () => {
    expect(planFormation([member("a", "warden")], { x: 5, y: 6 })).toEqual({
      a: { x: 5, y: 6 },
    });
  });

  test("gives every unit its own slot around the destination", () => {
    const members = Array.from({ length: 9 }, (_, index) =>
      member(`u${index}`, "warden", index * 0.1, 0),
    );
    const slots = planFormation(members, { x: 20, y: 0 });
    const points = Object.values(slots);
    expect(points).toHaveLength(9);
    const keys = new Set(
      points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`),
    );
    expect(keys.size).toBe(9);
    const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
    expect(centerX).toBeGreaterThan(19);
    expect(centerX).toBeLessThan(21);
    for (const [left, right] of points.flatMap((a, i) =>
      points.slice(i + 1).map((b) => [a, b] as const),
    )) {
      expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(
        FORMATION_SPACING - 1e-6,
      );
    }
  });

  test("puts frontline in front, ranged behind, villagers last", () => {
    for (const formation of ["column", "line", "ranks", "wedge"] as const) {
      const slots = planFormation(
        [
          member("villager", "villager"),
          member("hunter", "hunter"),
          member("warden", "warden"),
          member("adept", "adept"),
        ],
        { x: 10, y: 0 },
        formation,
      );
      // Travelling toward +x, so a larger x is further forward.
      expect(slots.warden?.x).toBeGreaterThan(slots.hunter?.x ?? 0);
      expect(slots.hunter?.x).toBeGreaterThan(slots.adept?.x ?? 0);
      expect(slots.adept?.x).toBeGreaterThan(slots.villager?.x ?? 0);
    }
  });

  test("makes the center of a wedge lead its flanks", () => {
    const slots = planFormation(
      [
        member("top", "warden", 0, -2),
        member("center", "warden", 0, 0),
        member("bottom", "warden", 0, 2),
      ],
      { x: 10, y: 0 },
      "wedge",
    );
    expect(slots.center?.x).toBeGreaterThan(slots.top?.x ?? 0);
    expect(slots.center?.x).toBeGreaterThan(slots.bottom?.x ?? 0);
  });

  test("keeps units in their left-to-right order so paths do not cross", () => {
    const slots = planFormation(
      [
        member("top", "warden", 0, -3),
        member("middle", "warden", 0, 0),
        member("bottom", "warden", 0, 3),
      ],
      { x: 10, y: 0 },
    );
    expect(slots.top?.y).toBeLessThan(slots.middle?.y ?? 0);
    expect(slots.middle?.y).toBeLessThan(slots.bottom?.y ?? 0);
  });

  test("is deterministic", () => {
    const members = [
      member("b", "raider", 1, 1),
      member("a", "warden", 2, 0),
      member("c", "hunter", 0, 2),
    ];
    expect(planFormation(members, { x: 8, y: 8 })).toEqual(
      planFormation([...members].reverse(), { x: 8, y: 8 }),
    );
  });
});

describe("formationRankWidth", () => {
  test("grows wider than deep and caps", () => {
    expect(formationRankWidth(1)).toBe(1);
    expect(formationRankWidth(4)).toBe(3);
    expect(formationRankWidth(200)).toBe(MAX_RANK_WIDTH);
  });

  test("makes lines broad and columns two units wide", () => {
    expect(formationRankWidth(6, "line")).toBe(6);
    expect(formationRankWidth(20, "line")).toBe(MAX_RANK_WIDTH);
    expect(formationRankWidth(20, "column")).toBe(2);
  });
});
