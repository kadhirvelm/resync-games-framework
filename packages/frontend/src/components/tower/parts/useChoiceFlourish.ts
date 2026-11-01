"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playSound, type SoundName } from "../audio/sound";

/** Milliseconds a chosen option celebrates before the choice is applied. */
export const FLOURISH_MS = 620;

/**
 * Lets a pick land with a moment of ceremony: the chosen option is marked at
 * once (so it can burst and the others can fall away), a sound plays, and
 * the real action runs a beat later. Further picks are ignored meanwhile.
 * @param reducedMotion - Apply picks at once, without the pause
 * @param options.sound - Effect played on the pick. Defaults to sparkle
 * @param options.hold - Keep the pick marked after the action runs, for a
 * screen that is about to be covered and replaced
 * @returns The key being celebrated, if any, and `choose` to start one
 */
export function useChoiceFlourish(
  reducedMotion: boolean,
  options: { hold?: boolean; sound?: SoundName } = {},
): {
  choose: (key: string, action: () => void) => void;
  chosen: string | undefined;
} {
  const { hold = false, sound = "sparkle" } = options;
  const [chosen, setChosen] = useState<string>();
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const choose = useCallback(
    (key: string, action: () => void) => {
      if (chosen !== undefined) {
        return;
      }
      playSound(sound);
      if (reducedMotion) {
        action();
        return;
      }
      setChosen(key);
      timer.current = window.setTimeout(() => {
        if (!hold) {
          setChosen(undefined);
        }
        action();
      }, FLOURISH_MS);
    },
    [chosen, hold, reducedMotion, sound],
  );

  return { choose, chosen };
}
