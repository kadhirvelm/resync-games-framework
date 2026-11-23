import { describe, expect, test } from "bun:test";
import { type HotkeyInput, hotkeyFromInput } from "../hotkeys";

/** Unmodified, non-repeating key fields used by number-row tests. */
const KEY: Omit<HotkeyInput, "key"> = {
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
};

describe("control group hotkeys", () => {
  test("maps Ctrl+1 through Ctrl+9 to save their respective slots", () => {
    for (let slot = 1; slot <= 9; slot += 1) {
      expect(
        hotkeyFromInput({
          ...KEY,
          code: `Digit${slot}`,
          ctrlKey: true,
          key: String(slot),
        }),
      ).toEqual({ mode: "save", slot, type: "controlGroup" });
    }
  });

  test("maps bare numbers to recall and Shift+numbers to add", () => {
    expect(hotkeyFromInput({ ...KEY, key: "4" })).toEqual({
      mode: "recall",
      slot: 4,
      type: "controlGroup",
    });
    expect(hotkeyFromInput({ ...KEY, key: "1", shiftKey: true })).toEqual({
      mode: "add",
      slot: 1,
      type: "controlGroup",
    });
  });

  test("uses Digit codes when Shift turns number keys into punctuation", () => {
    expect(
      hotkeyFromInput({
        ...KEY,
        code: "Digit1",
        key: "!",
        shiftKey: true,
      }),
    ).toEqual({ mode: "add", slot: 1, type: "controlGroup" });
    expect(hotkeyFromInput({ ...KEY, key: "!", shiftKey: true })).toBeNull();
  });

  test("maps Alt+1 through Alt+9 as a browser-safe save alternative", () => {
    for (let slot = 1; slot <= 9; slot += 1) {
      expect(
        hotkeyFromInput({
          ...KEY,
          altKey: true,
          code: `Digit${slot}`,
          key: String(slot),
        }),
      ).toEqual({ mode: "save", slot, type: "controlGroup" });
    }
  });

  test("ignores repeats and conflicting system modifiers", () => {
    expect(hotkeyFromInput({ ...KEY, key: "1", repeat: true })).toBeNull();
    expect(
      hotkeyFromInput({
        ...KEY,
        ctrlKey: true,
        key: "1",
        shiftKey: true,
      }),
    ).toBeNull();
    expect(
      hotkeyFromInput({
        ...KEY,
        altKey: true,
        key: "1",
        shiftKey: true,
      }),
    ).toBeNull();
    expect(
      hotkeyFromInput({
        ...KEY,
        altKey: true,
        ctrlKey: true,
        key: "1",
      }),
    ).toBeNull();
    expect(hotkeyFromInput({ ...KEY, key: "1", metaKey: true })).toBeNull();
  });

  test("maps X to attack_move and Z to stop", () => {
    expect(hotkeyFromInput({ ...KEY, key: "x" })).toEqual({
      type: "attack_move",
    });
    expect(hotkeyFromInput({ ...KEY, key: "X" })).toEqual({
      type: "attack_move",
    });
    expect(hotkeyFromInput({ ...KEY, key: "z" })).toEqual({ type: "stop" });
    expect(hotkeyFromInput({ ...KEY, key: "Z" })).toEqual({ type: "stop" });
    expect(hotkeyFromInput({ ...KEY, key: "x", repeat: true })).toBeNull();
    expect(hotkeyFromInput({ ...KEY, key: "z", repeat: true })).toBeNull();
  });

  test("leaves existing camera and build-menu key mappings unchanged", () => {
    expect(hotkeyFromInput({ ...KEY, key: "w" })).toEqual({
      type: "camera",
      x: 0,
      y: -72,
    });
    expect(hotkeyFromInput({ ...KEY, key: "s" })).toEqual({
      type: "camera",
      x: 0,
      y: 72,
    });
    expect(hotkeyFromInput({ ...KEY, key: "b" })).toEqual({ type: "build" });
    expect(hotkeyFromInput({ ...KEY, ctrlKey: true, key: "w" })).toBeNull();
  });
});
