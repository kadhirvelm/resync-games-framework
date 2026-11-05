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

/**
 * Enters or leaves fullscreen. Entering also asks to keep Escape for the
 * game, so Esc closes menus instead of dropping out of fullscreen; where the
 * browser grants that, holding Esc still leaves fullscreen.
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
    await keyboard?.lock?.(["Escape"]);
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
