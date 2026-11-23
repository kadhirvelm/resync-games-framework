import { describe, expect, test } from "bun:test";
import { buildMenuKeyAction, buildMenuKeyFor } from "../buildMenuHotkeys";

/**
 * @param key - Pressed key
 * @param extra - Modifier overrides
 * @returns A key input with no modifiers
 */
function press(
  key: string,
  extra: Partial<{ repeat: boolean; ctrlKey: boolean }> = {},
) {
  return {
    altKey: false,
    ctrlKey: extra.ctrlKey ?? false,
    key,
    metaKey: false,
    repeat: extra.repeat ?? false,
  };
}

describe("build menu hotkeys", () => {
  test("labels categories and buildings by command-grid position", () => {
    expect(
      [0, 1, 2, 3].map((index) => buildMenuKeyFor("categories", index)),
    ).toEqual(["Q", "W", "E", "R"]);
    expect(
      [0, 1, 2, 3, 4, 5].map((index) => buildMenuKeyFor("buildings", index)),
    ).toEqual(["Q", "W", "E", "R", "T", "A"]);
    expect(buildMenuKeyFor("categories", 4)).toBeUndefined();
  });

  test("picks by position, either case", () => {
    expect(buildMenuKeyAction(press("r"), "categories", 4)).toEqual({
      index: 3,
      type: "choose",
    });
    expect(buildMenuKeyAction(press("E"), "buildings", 6)).toEqual({
      index: 2,
      type: "choose",
    });
  });

  test("eats grid keys with no button so the camera does not move", () => {
    expect(buildMenuKeyAction(press("d"), "buildings", 2)).toEqual({
      type: "swallow",
    });
    expect(buildMenuKeyAction(press("t"), "categories", 4)).toEqual({
      type: "swallow",
    });
    expect(
      buildMenuKeyAction(press("q", { repeat: true }), "buildings", 4),
    ).toEqual({ type: "swallow" });
  });

  test("Backspace goes back; Esc, B, arrows, and modified keys pass through", () => {
    expect(buildMenuKeyAction(press("Backspace"), "buildings", 2)).toEqual({
      type: "back",
    });
    expect(buildMenuKeyAction(press("Escape"), "buildings", 2)).toBeNull();
    expect(buildMenuKeyAction(press("b"), "categories", 4)).toBeNull();
    expect(buildMenuKeyAction(press("b"), "buildings", 14)).toBeNull();
    expect(buildMenuKeyAction(press("ArrowUp"), "categories", 4)).toBeNull();
    expect(
      buildMenuKeyAction(press("q", { ctrlKey: true }), "categories", 4),
    ).toBeNull();
  });
});
