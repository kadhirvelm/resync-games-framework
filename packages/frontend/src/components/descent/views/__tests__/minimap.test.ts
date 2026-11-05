import { describe, expect, test } from "bun:test";
import { minimapPointerToMap, minimapPressAction } from "../DescentMinimap";

describe("minimapPointerToMap", () => {
  test("maps the overview center into the battlefield center", () => {
    expect(
      minimapPointerToMap(
        110,
        70,
        { height: 100, left: 10, top: 20, width: 200 },
        { height: 80, width: 128 },
      ),
    ).toEqual({ x: 64, y: 40 });
  });

  test("clamps pointers outside the overview to playable bounds", () => {
    const rect = { height: 100, left: 10, top: 20, width: 200 };
    const map = { height: 80, width: 128 };
    expect(minimapPointerToMap(-50, -20, rect, map)).toEqual({ x: 0, y: 0 });
    expect(minimapPointerToMap(300, 200, rect, map)).toEqual({
      x: 128,
      y: 80,
    });
  });
});

describe("minimapPressAction", () => {
  test("left-click moves the camera; right-click sends the selection", () => {
    expect(minimapPressAction(0, false, true)).toBe("navigate");
    expect(minimapPressAction(2, false, true)).toBe("move");
  });

  test("Shift-click with either button queues a waypoint", () => {
    expect(minimapPressAction(0, true, true)).toBe("queue");
    expect(minimapPressAction(2, true, true)).toBe("queue");
  });

  test("without an order handler only the camera moves", () => {
    expect(minimapPressAction(0, true, false)).toBe("navigate");
    expect(minimapPressAction(2, false, false)).toBeNull();
    expect(minimapPressAction(1, false, true)).toBeNull();
  });
});
