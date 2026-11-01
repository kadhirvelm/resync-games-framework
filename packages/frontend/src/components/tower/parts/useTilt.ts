"use client";

import { useCallback } from "react";
import { tiltFromPointer } from "./tilt";

const TILT_PROPERTIES = ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"];

/**
 * @param element - Element about to animate
 * @returns Whether the player asked for less motion, in the game settings
 * (`data-reduced-motion` on an ancestor) or the operating system
 */
export function prefersLessMotion(element: Element): boolean {
  if (element.closest("[data-reduced-motion]")) {
    return true;
  }
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Leans an element toward a mouse pointer by writing `--tilt-x`, `--tilt-y`,
 * `--glare-x`, and `--glare-y` on it; the stylesheet decides what to do with
 * them. Writes styles directly, so moving the pointer never re-renders.
 * Touch and reduced motion leave the element flat.
 * @param maxDegrees - Lean at the very edge
 * @returns Pointer handlers to spread on the element
 */
export function useTilt(maxDegrees = 8): {
  onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
} {
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const element = event.currentTarget;
      if (event.pointerType !== "mouse" || prefersLessMotion(element)) {
        return;
      }
      const pose = tiltFromPointer(
        element.getBoundingClientRect(),
        event.clientX,
        event.clientY,
        maxDegrees,
      );
      element.style.setProperty("--tilt-x", `${pose.rotateX}deg`);
      element.style.setProperty("--tilt-y", `${pose.rotateY}deg`);
      element.style.setProperty("--glare-x", `${pose.glareX}%`);
      element.style.setProperty("--glare-y", `${pose.glareY}%`);
    },
    [maxDegrees],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      for (const property of TILT_PROPERTIES) {
        event.currentTarget.style.removeProperty(property);
      }
    },
    [],
  );

  return { onPointerLeave, onPointerMove };
}
