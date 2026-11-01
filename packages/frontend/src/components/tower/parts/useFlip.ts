"use client";

import { type RefObject, useLayoutEffect, useRef } from "react";

/** Milliseconds a moved element takes to slide into place. */
const FLIP_MS = 320;

/**
 * Slides children into their new places when a list reorders, instead of
 * letting them jump. Children opt in with a `data-flip-key` attribute.
 * Uses the Web Animations API, so it never fights React for styles.
 * @param container - Element whose children move
 * @param order - Keys in their current order; a change triggers the slide
 * @param disabled - Skip animation, such as for reduced motion
 */
export function useFlip(
  container: RefObject<HTMLElement | null>,
  order: string,
  disabled = false,
): void {
  const previous = useRef(new Map<string, DOMRect>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: `order` is the trigger; positions are read from the DOM
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) {
      return;
    }
    const next = new Map<string, DOMRect>();
    for (const element of root.querySelectorAll<HTMLElement>(
      "[data-flip-key]",
    )) {
      const key = element.dataset.flipKey ?? "";
      const rect = element.getBoundingClientRect();
      next.set(key, rect);
      const before = previous.current.get(key);
      if (disabled || !before || typeof element.animate !== "function") {
        continue;
      }
      const deltaX = before.left - rect.left;
      const deltaY = before.top - rect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue;
      }
      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration: FLIP_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    previous.current = next;
  }, [order, disabled]);
}
