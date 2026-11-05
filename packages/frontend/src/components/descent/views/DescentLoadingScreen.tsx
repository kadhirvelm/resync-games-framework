/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useEffect, useState } from "react";
import { type LoadingProgress, loadingFraction } from "./loadingProgress";
import styles from "./loadingScreen.module.scss";

/** How long the player waits before they may enter with art still loading. */
const SKIP_AFTER_MS = 8_000;

/** Props for the opening load screen. */
export interface DescentLoadingScreenProps {
  /** Whether the battlefield is ready and the screen is fading out. */
  leaving: boolean;
  /** Enters the game now; anything still loading streams in behind it. */
  onSkip: () => void;
  progress: LoadingProgress;
}

/**
 * Covers the battlefield and HUD while models, paintings, and shaders load,
 * so the first frame the player sees is complete.
 * @param props - Load counts, whether it is leaving, and the skip action
 * @returns The loading overlay
 */
export function DescentLoadingScreen({
  leaving,
  onSkip,
  progress,
}: DescentLoadingScreenProps) {
  const [shown, setShown] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const fraction = leaving ? 1 : loadingFraction(progress);
  // New loads can start after earlier ones finish; never draw the bar
  // moving backward.
  if (fraction > shown) setShown(fraction);

  useEffect(() => {
    const timer = setTimeout(() => setCanSkip(true), SKIP_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const percent = Math.round(shown * 100);
  return (
    <section
      aria-busy={!leaving}
      aria-label="Loading Descent"
      className={styles.loadingScreen}
      data-leaving={leaving}
      data-testid="descent-loading"
    >
      <div aria-hidden="true" className={styles.artwork} />
      <div className={styles.content}>
        <p className={styles.eyebrow}>Ashen Gate</p>
        <h2 className={styles.title}>Descending</h2>
        <div
          aria-label="Battlefield loading"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className={styles.track}
          role="progressbar"
        >
          <span
            className={styles.fill}
            style={{ transform: `scaleX(${shown})` }}
          />
        </div>
        <p className={styles.detail}>
          <span>{loadingLine(progress, leaving)}</span>
          {progress.total === 0 ? null : (
            <span className={styles.count}>
              {progress.completed} / {progress.total}
            </span>
          )}
        </p>
        {progress.failed === 0 ? null : (
          <p className={styles.note}>
            {standInNote(progress.failed)} Stand-ins will take their place.
          </p>
        )}
        {canSkip && !leaving ? (
          <button className={styles.skip} onClick={onSkip} type="button">
            Enter now
            <span>Remaining art will stream in</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * What the loading screen is working on.
 * @param progress - Current counts
 * @param leaving - Whether loading finished
 * @returns One short status line
 */
export function loadingLine(
  progress: LoadingProgress,
  leaving: boolean,
): string {
  if (leaving) return "The gate is open";
  if (progress.current === null) return "Gathering the descent";
  return progress.current;
}

/**
 * Names how many pieces of art could not load.
 * @param failed - Failed load count, at least 1
 * @returns A sentence naming the count
 */
export function standInNote(failed: number): string {
  if (failed === 1) return "1 piece of art could not load.";
  return `${failed} pieces of art could not load.`;
}
