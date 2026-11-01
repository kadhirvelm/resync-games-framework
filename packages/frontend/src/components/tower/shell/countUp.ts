"use client";

import { useEffect, useState } from "react";

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
