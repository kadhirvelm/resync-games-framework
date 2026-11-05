import { describe, expect, test } from "bun:test";
import {
  createFogOfWar,
  fogMatchesBounds,
  fogVisibilityAt,
  isFogExplored,
  isFogOfWarState,
  isFogVisible,
  revealFogOfWar,
} from "../fogOfWar";

describe("fog of war", () => {
  test("a new map starts entirely unseen", () => {
    const fog = createFogOfWar({ height: 10, width: 20 });
    expect(fog.cells).toHaveLength(200);
    expect(fogVisibilityAt(fog, 0, 0)).toBe("unseen");
    expect(fogVisibilityAt(fog, 19, 9)).toBe("unseen");
    expect(isFogOfWarState(fog)).toBe(true);
  });

  test("a sight source reveals a disk around itself", () => {
    const fog = revealFogOfWar(createFogOfWar({ height: 30, width: 30 }), [
      { radius: 5, x: 15, y: 15 },
    ]);
    expect(fogVisibilityAt(fog, 15, 15)).toBe("visible");
    expect(fogVisibilityAt(fog, 20, 15)).toBe("visible");
    expect(fogVisibilityAt(fog, 19, 19)).toBe("unseen");
    expect(fogVisibilityAt(fog, 21, 15)).toBe("unseen");
  });

  test("tiles a source leaves stay explored but are no longer live", () => {
    const start = createFogOfWar({ height: 30, width: 30 });
    const seen = revealFogOfWar(start, [{ radius: 4, x: 5, y: 5 }]);
    const moved = revealFogOfWar(seen, [{ radius: 4, x: 25, y: 25 }]);
    expect(fogVisibilityAt(moved, 5, 5)).toBe("explored");
    expect(isFogExplored(moved, { x: 5, y: 5 })).toBe(true);
    expect(isFogVisible(moved, { x: 5, y: 5 })).toBe(false);
    expect(fogVisibilityAt(moved, 25, 25)).toBe("visible");
    const empty = revealFogOfWar(moved, []);
    expect(fogVisibilityAt(empty, 25, 25)).toBe("explored");
    expect(fogVisibilityAt(empty, 15, 15)).toBe("unseen");
  });

  test("sight is clipped to the map and off-map points read the edge", () => {
    const fog = revealFogOfWar(createFogOfWar({ height: 8, width: 8 }), [
      { radius: 3, x: 0, y: 0 },
    ]);
    expect(fog.cells).toHaveLength(64);
    expect(fogVisibilityAt(fog, -5, -5)).toBe("visible");
    expect(fogVisibilityAt(fog, 40, 40)).toBe("unseen");
  });

  test("updates never change the previous grid", () => {
    const start = createFogOfWar({ height: 5, width: 5 });
    const before = start.cells;
    revealFogOfWar(start, [{ radius: 2, x: 2, y: 2 }]);
    expect(start.cells).toBe(before);
  });

  test("without fog everything is visible", () => {
    expect(fogVisibilityAt(null, 3, 3)).toBe("visible");
    expect(isFogVisible(null, { x: 99, y: 99 })).toBe(true);
  });

  test("rejects malformed grids and matches bounds exactly", () => {
    const fog = createFogOfWar({ height: 4, width: 6 });
    expect(fogMatchesBounds(fog, { height: 4, width: 6 })).toBe(true);
    expect(fogMatchesBounds(fog, { height: 6, width: 6 })).toBe(false);
    expect(isFogOfWarState({ ...fog, cells: "0" })).toBe(false);
    expect(isFogOfWarState(null)).toBe(false);
    expect(isFogOfWarState({ cells: "", height: 0, width: 0 })).toBe(false);
  });
});
