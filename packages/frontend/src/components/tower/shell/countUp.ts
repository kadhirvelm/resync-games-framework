"use client";

import { useEffect, useRef, useState } from "react";
import { playSound, type SoundName } from "../audio/sound";

/**
 * Eased value for a number counting up from zero.
 * @param target - Final value
 * @param elapsed - Milliseconds since counting started
 * @param duration - Milliseconds to reach the target
 * @returns A whole number between 0 and the target, easing out near the end
 */
export function countUpValue(
  target: number,
  elapsed: number,
  duration: number,
): number {
  if (duration <= 0 || elapsed >= duration) {
    return target;
  }
  if (elapsed <= 0) {
    return 0;
  }
  const progress = elapsed / duration;
  const eased = 1 - (1 - progress) ** 3;
  return Math.round(target * eased);
}

/**
 * Counts a number up from zero after a delay, for score tallies.
 * @param target - Final value
 * @param options - Delay and duration in milliseconds; `instant` skips the count
 * @returns The value to show this frame
 */
export function useCountUp(
  target: number,
  options: { delay: number; duration: number; instant: boolean },
): number {
  const { delay, duration, instant } = options;
  const [value, setValue] = useState(instant ? target : 0);

  useEffect(() => {
    if (instant) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now() + delay;
    /**
     * @param now - Frame timestamp
     */
    const tick = (now: number) => {
      const next = countUpValue(target, now - start, duration);
      setValue(next);
      if (next !== target) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [delay, duration, instant, target]);

  return value;
}

/**
 * Eased value for a number moving from one value to another.
 * @param from - Value at the start
 * @param to - Value at the end
 * @param elapsed - Milliseconds since the move started
 * @param duration - Milliseconds the move takes
 * @returns A whole number between `from` and `to`, easing out near the end
 */
export function tweenValue(
  from: number,
  to: number,
  elapsed: number,
  duration: number,
): number {
  if (duration <= 0 || elapsed >= duration) {
    return to;
  }
  if (elapsed <= 0) {
    return from;
  }
  const eased = 1 - (1 - elapsed / duration) ** 3;
  return Math.round(from + (to - from) * eased);
}

/**
 * Follows a number that changes over time, rolling smoothly from the old
 * value to the new one instead of jumping, like a purse being counted.
 * @param target - Current value
 * @param options - Duration in milliseconds; `instant` skips the roll
 * @returns The value to show this frame and whether it is still rolling
 */
export function useTweenedNumber(
  target: number,
  options: { duration: number; instant: boolean },
): { rolling: boolean; value: number } {
  const { duration, instant } = options;
  const [value, setValue] = useState(target);
  const shown = useRef(target);

  useEffect(() => {
    const from = shown.current;
    if (instant || from === target) {
      shown.current = target;
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    /**
     * @param now - Frame timestamp
     */
    const tick = (now: number) => {
      const next = tweenValue(from, target, now - start, duration);
      shown.current = next;
      setValue(next);
      if (next !== target) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, instant, target]);

  return { rolling: value !== target, value };
}

/**
 * Ticks softly while a counted number climbs, and rings once when it lands.
 * @param shown - Value on screen this frame
 * @param target - Value it is counting toward
 * @param options.enabled - Whether to make any sound
 * @param options.landing - Effect played when the count lands
 */
export function useCountSounds(
  shown: number,
  target: number,
  options: { enabled: boolean; landing: SoundName },
): void {
  const { enabled, landing } = options;
  const landed = useRef(false);

  useEffect(() => {
    if (!enabled || target <= 0 || landed.current || shown <= 0) {
      return;
    }
    if (shown < target) {
      playSound("tick", { pitch: 0.8 + (shown / target) * 0.6 });
      return;
    }
    landed.current = true;
    playSound(landing);
  }, [enabled, landing, shown, target]);
}
