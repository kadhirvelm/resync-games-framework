"use client";

import { useEffect } from "react";
import { playSound, type SoundName } from "../audio/sound";
import { staggerSchedule } from "./particles";

/**
 * Plays a run of sounds in time with a staggered animation, such as a chime
 * for each card dealt. Replays whenever `trigger` changes.
 * @param name - Effect to play on each beat
 * @param count - Number of beats
 * @param timing.startMs - Delay before the first beat
 * @param timing.stepMs - Gap between beats
 * @param timing.pitchStep - Pitch added per beat, so the run rises
 * @param trigger - Any value that should restart the run
 */
export function useStaggeredSounds(
  name: SoundName,
  count: number,
  timing: { pitchStep?: number; startMs: number; stepMs: number },
  trigger: unknown,
): void {
  const { pitchStep, startMs, stepMs } = timing;
  // biome-ignore lint/correctness/useExhaustiveDependencies: `trigger` restarts the run on purpose
  useEffect(() => {
    const timers = staggerSchedule(count, startMs, stepMs, pitchStep).map(
      (beat) =>
        window.setTimeout(
          () => playSound(name, { pitch: beat.pitch }),
          beat.atMs,
        ),
    );
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [count, name, pitchStep, startMs, stepMs, trigger]);
}
