import { describe, expect, test } from "bun:test";
import { hotkeyFromInput } from "../hotkeys";
import {
  canUseFullscreen,
  type FullscreenDocument,
  toggleFullscreen,
} from "../useFullscreen";

/**
 * A page whose fullscreen calls are recorded.
 * @param enabled - Whether the browser allows fullscreen
 * @returns The fake document and its call log
 */
function fakePage(enabled = true) {
  const calls: string[] = [];
  const doc: FullscreenDocument = {
    documentElement: {
      requestFullscreen: async () => {
        calls.push("enter");
        doc.fullscreenElement = doc.documentElement;
      },
    },
    exitFullscreen: async () => {
      calls.push("exit");
      doc.fullscreenElement = null;
    },
    fullscreenElement: null,
    fullscreenEnabled: enabled,
  };
  const keyboard = {
    lock: async (keys?: readonly string[]) => {
      calls.push(`lock:${keys?.join(",")}`);
    },
    unlock: () => calls.push("unlock"),
  };
  return { calls, doc, keyboard };
}

describe("fullscreen", () => {
  test("enters fullscreen and keeps Escape and Digit1-9 for the game", async () => {
    const { calls, doc, keyboard } = fakePage();
    await toggleFullscreen(doc, keyboard);
    expect(calls).toEqual([
      "enter",
      "lock:Escape,Digit1,Digit2,Digit3,Digit4,Digit5,Digit6,Digit7,Digit8,Digit9",
    ]);
    expect(doc.fullscreenElement).not.toBeNull();
  });

  test("falls back to locking Escape alone when locking Digit keys is rejected", async () => {
    const { calls, doc, keyboard } = fakePage();
    let attempts = 0;
    keyboard.lock = async (keys?: readonly string[]) => {
      attempts += 1;
      calls.push(`lock:${keys?.join(",")}`);
      if (attempts === 1) throw new Error("Digit keys unsupported");
    };
    await toggleFullscreen(doc, keyboard);
    expect(calls).toEqual([
      "enter",
      "lock:Escape,Digit1,Digit2,Digit3,Digit4,Digit5,Digit6,Digit7,Digit8,Digit9",
      "lock:Escape",
    ]);
    expect(doc.fullscreenElement).not.toBeNull();
  });

  test("a second toggle releases Escape and leaves fullscreen", async () => {
    const { calls, doc, keyboard } = fakePage();
    await toggleFullscreen(doc, keyboard);
    await toggleFullscreen(doc, keyboard);
    expect(calls.slice(2)).toEqual(["unlock", "exit"]);
    expect(doc.fullscreenElement).toBeNull();
  });

  test("does nothing where the browser forbids fullscreen", async () => {
    const { calls, doc, keyboard } = fakePage(false);
    expect(canUseFullscreen(doc)).toBe(false);
    await toggleFullscreen(doc, keyboard);
    expect(calls).toEqual([]);
  });

  test("a refused request leaves the page windowed without throwing", async () => {
    const { doc } = fakePage();
    doc.documentElement.requestFullscreen = async () => {
      throw new Error("not allowed");
    };
    await toggleFullscreen(doc, undefined);
    expect(doc.fullscreenElement).toBeNull();
  });

  test("F toggles fullscreen", () => {
    const key = {
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      repeat: false,
    };
    expect(hotkeyFromInput({ ...key, key: "f" })).toEqual({
      type: "fullscreen",
    });
    expect(hotkeyFromInput({ ...key, key: "F" })).toEqual({
      type: "fullscreen",
    });
    expect(hotkeyFromInput({ ...key, ctrlKey: true, key: "f" })).toBeNull();
  });
});
