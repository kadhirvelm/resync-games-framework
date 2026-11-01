"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playSound } from "./audio/sound";

/** Where the full-screen fade is in its cycle. */
export type CurtainState = "open" | "closing" | "opening";

/** Milliseconds for the curtain to close, and again to open. */
const CURTAIN_MS = 420;

/** Shorter fade when the player prefers reduced motion. */
const REDUCED_CURTAIN_MS = 120;

/**
 * A paper-coloured curtain for scene changes: it spreads over the screen
 * like ink on paper with a soft whoosh, the change happens behind it, and
 * it lifts away. Calls made while it is already moving are ignored, which
 * also guards against double clicks.
 * @param reducedMotion - Use a short fade
 * @returns The curtain state, its duration, and `cover` to run a change behind it
 */
export function useCurtain(reducedMotion: boolean): {
  cover: (change: () => void) => void;
  durationMs: number;
  state: CurtainState;
} {
  const [state, setState] = useState<CurtainState>("open");
  const timers = useRef<number[]>([]);
  const durationMs = reducedMotion ? REDUCED_CURTAIN_MS : CURTAIN_MS;

  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  const cover = useCallback(
    (change: () => void) => {
      if (state !== "open") {
        return;
      }
      playSound("whoosh");
      setState("closing");
      timers.current.push(
        window.setTimeout(() => {
          change();
          setState("opening");
          timers.current.push(
            window.setTimeout(() => setState("open"), durationMs),
          );
        }, durationMs),
      );
    },
    [durationMs, state],
  );

  return { cover, durationMs, state };
}
