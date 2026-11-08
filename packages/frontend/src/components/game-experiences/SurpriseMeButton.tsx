"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { gameExperiencePath } from "./gameExperiencePaths";
import type { GameExperienceId } from "./gameExperienceTypes";
import styles from "./gameLibrary.module.scss";
import { pickRandomExperience } from "./randomExperience";

/** How long the dice spin before the random game opens. */
const ROLL_DURATION_MS = 650;

/**
 * Rolls a die, then opens a random game.
 * @param ids - Games the roll can land on
 * @returns The "Surprise me" button
 */
export function SurpriseMeButton({
  ids,
}: {
  ids: readonly GameExperienceId[];
}) {
  const router = useRouter();
  const [rolling, setRolling] = useState(false);

  /** Spins the die, then navigates to the picked game. */
  const roll = () => {
    const picked = pickRandomExperience(ids);
    if (!picked || rolling) {
      return;
    }
    setRolling(true);
    globalThis.setTimeout(() => {
      router.push(gameExperiencePath(picked));
    }, ROLL_DURATION_MS);
  };

  return (
    <button
      className={styles.surprise}
      data-rolling={rolling ? "true" : undefined}
      disabled={ids.length === 0}
      onClick={roll}
      type="button"
    >
      <svg
        aria-hidden="true"
        className={styles.die}
        height="20"
        viewBox="0 0 24 24"
        width="20"
      >
        <rect
          fill="none"
          height="18"
          rx="4"
          stroke="currentColor"
          strokeWidth="2"
          width="18"
          x="3"
          y="3"
        />
        <circle cx="8.5" cy="8.5" fill="currentColor" r="1.6" />
        <circle cx="12" cy="12" fill="currentColor" r="1.6" />
        <circle cx="15.5" cy="15.5" fill="currentColor" r="1.6" />
      </svg>
      {rolling ? "Rolling…" : "Surprise me"}
    </button>
  );
}
