"use client";

import { useCallback, useEffect, useState } from "react";

/** The Keyboard Lock API, where the browser offers it. */
interface KeyboardLock {
  lock?: (keys?: readonly string[]) => Promise<void>;
  unlock?: () => void;
}

/** What the game needs from the page to go fullscreen. */
export interface FullscreenDocument {
  documentElement: { requestFullscreen?: () => Promise<void> };
  exitFullscreen?: () => Promise<void>;
  fullscreenElement: unknown;
  fullscreenEnabled?: boolean;
}

/**
 * @param doc - Page document
 * @returns Whether this browser lets the page go fullscreen
 */
export function canUseFullscreen(doc: FullscreenDocument): boolean {
  return (
    doc.fullscreenEnabled === true &&
    typeof doc.documentElement.requestFullscreen === "function"
  );
}

/** Keys requested under Keyboard Lock in fullscreen (Escape and control groups). */
export const FULLSCREEN_LOCK_KEYS = [
  "Escape",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
] as const;

/**
 * Locks Escape and number-row keys when supported, falling back to Escape only.
 * @param keyboard - The browser's keyboard lock, if any
 */
async function lockFullscreenKeys(
  keyboard: KeyboardLock | undefined,
): Promise<void> {
  if (typeof keyboard?.lock !== "function") return;
  try {
    await keyboard.lock(FULLSCREEN_LOCK_KEYS);
  } catch {
    await keyboard.lock(["Escape"]);
  }
}

/**
 * Enters or leaves fullscreen. Entering also asks to keep Escape and
 * Digit1-Digit9 for the game, so Esc closes menus and Ctrl+1-9 saves control
 * groups instead of switching browser tabs; where granted, holding Esc still
 * leaves fullscreen.
 * @param doc - Page document
 * @param keyboard - The browser's keyboard lock, if any
 * @returns Resolves once the browser has answered; a refusal is not an error
 */
export async function toggleFullscreen(
  doc: FullscreenDocument,
  keyboard: KeyboardLock | undefined,
): Promise<void> {
  try {
    if (doc.fullscreenElement) {
      keyboard?.unlock?.();
      await doc.exitFullscreen?.();
      return;
    }
    if (!canUseFullscreen(doc)) return;
    await doc.documentElement.requestFullscreen?.();
    await lockFullscreenKeys(keyboard);
  } catch {
    // The browser refused (no user gesture, or a policy); stay windowed.
  }
}

/**
 * @returns The browser's keyboard lock, where it exists
 */
function browserKeyboard(): KeyboardLock | undefined {
  return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

/**
 * Tracks and toggles page fullscreen for an immersive game view. It leaves
 * fullscreen when the game unmounts, so returning to the library is windowed.
 * @returns Whether fullscreen is on, whether it is available, and a toggle
 */
export function useFullscreen(): {
  available: boolean;
  fullscreen: boolean;
  toggle: () => void;
} {
  const [fullscreen, setFullscreen] = useState(false);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    setAvailable(canUseFullscreen(document));
    /** Mirrors the browser's state, including Esc and F11 exits. */
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (!document.fullscreenElement) return;
      browserKeyboard()?.unlock?.();
      void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  const toggle = useCallback(() => {
    void toggleFullscreen(document, browserKeyboard());
  }, []);

  return { available, fullscreen, toggle };
}
