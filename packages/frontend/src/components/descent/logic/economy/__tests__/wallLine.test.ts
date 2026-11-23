import { describe, expect, test } from "bun:test";
import { isWallType, MAX_WALL_LINE_CELLS, wallLineCells } from "../wallLine";

describe("wallLineCells", () => {
  test("returns one cell when start equals end", () => {
    expect(wallLineCells({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([
      { x: 3, y: 3 },
    ]);
  });

  test("lays a straight run", () => {
    expect(wallLineCells({ x: 0, y: 0 }, { x: 3, y: 0 })).toHaveLength(4);
    expect(wallLineCells({ x: 0, y: 2 }, { x: 0, y: -1 })).toEqual([
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 0, y: -1 },
    ]);
  });

  test("diagonals stay 4-connected and end on target", () => {
    const cells = wallLineCells({ x: 0, y: 0 }, { x: 4, y: 3 });
    expect(cells[cells.length - 1]).toEqual({ x: 4, y: 3 });
    for (let i = 1; i < cells.length; i += 1) {
      const a = cells[i - 1]!;
      const b = cells[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });

  test("caps very long drags", () => {
    expect(wallLineCells({ x: 0, y: 0 }, { x: 500, y: 0 })).toHaveLength(
      MAX_WALL_LINE_CELLS,
    );
  });
});

describe("isWallType", () => {
  test("matches wall variants only", () => {
    expect(isWallType("wall")).toBe(true);
    expect(isWallType("fire_ward_wall")).toBe(true);
    expect(isWallType("camp")).toBe(false);
    expect(isWallType(null)).toBe(false);
  });
});
