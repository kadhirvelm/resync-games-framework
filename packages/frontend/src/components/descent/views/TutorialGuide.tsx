/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useMemo, useState } from "react";
import {
  evaluateTutorialProgress,
  type TutorialStepId,
} from "../logic/tutorial";
import type { SimSnapshot } from "../logic/types";
import styles from "./tutorialGuide.module.scss";

/** Props for the interactive co-op tutorial HUD overlay. */
export interface TutorialGuideProps {
  /** Current deterministic sim snapshot used to evaluate step completion. */
  snapshot: SimSnapshot;
}

/**
 * Live, collapsible co-op tutorial HUD panel for Descent. Tracks all 7
 * collaborative objectives against the simulation snapshot, highlights the
 * active step with hotkeys and strategy tips, and lets players inspect any
 * step in the checklist.
 * @param props - Current sim snapshot
 * @returns The tutorial guide overlay
 */
export function TutorialGuide({ snapshot }: TutorialGuideProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [inspectedId, setInspectedId] = useState<TutorialStepId | null>(null);

  const progress = useMemo(
    () => evaluateTutorialProgress(snapshot),
    [snapshot],
  );

  const focusedStep =
    (inspectedId === null
      ? null
      : progress.steps.find((step) => step.id === inspectedId)) ??
    progress.activeStep ??
    progress.steps[progress.steps.length - 1] ??
    null;

  const progressPct =
    progress.totalCount > 0
      ? Math.round((progress.completedCount / progress.totalCount) * 100)
      : 0;

  if (collapsed) {
    return (
      <aside
        aria-label="Co-op tutorial guide"
        className={styles.guideCollapsed}
        data-testid="descent-tutorial-guide"
      >
        <div className={styles.collapsedInfo}>
          <span className={styles.eyebrow}>
            Co-op Tutorial · {progress.completedCount}/{progress.totalCount}
          </span>
          <strong className={styles.collapsedTitle}>
            {progress.allComplete
              ? "All objectives complete!"
              : (progress.activeStep?.title ?? "Follow the guide")}
          </strong>
        </div>
        <button
          className={styles.toggleButton}
          onClick={() => setCollapsed(false)}
          type="button"
        >
          Show Guide
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Co-op tutorial guide"
      className={styles.guide}
      data-testid="descent-tutorial-guide"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Co-op Tutorial</span>
          <h2 className={styles.heading}>
            {progress.completedCount} / {progress.totalCount} Complete
          </h2>
        </div>
        <button
          className={styles.toggleButton}
          onClick={() => setCollapsed(true)}
          type="button"
        >
          Hide
        </button>
      </header>

      <div
        aria-label={`Tutorial progress ${progressPct}%`}
        aria-valuemax={progress.totalCount}
        aria-valuemin={0}
        aria-valuenow={progress.completedCount}
        className={styles.progressTrack}
        role="progressbar"
      >
        <span
          className={styles.progressFill}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {progress.allComplete ? (
        <div className={styles.completeBanner}>
          <strong>Allied Hold Mastered!</strong>
          <p>
            You&apos;ve completed every co-op tutorial step. Ready to test your
            squad in full-intensity Ashen Crucible!
          </p>
        </div>
      ) : null}

      {focusedStep === null ? null : (
        <section
          aria-label="Current tutorial objective"
          className={styles.activeCard}
          data-completed={focusedStep.completed}
        >
          <div className={styles.activeHeader}>
            <span className={styles.stepIndex}>
              Step {focusedStep.index + 1}
            </span>
            <span className={styles.progressBadge}>
              {focusedStep.progressLabel}
            </span>
          </div>
          <h3 className={styles.activeTitle}>{focusedStep.title}</h3>
          <p className={styles.activeDetail}>{focusedStep.detail}</p>
          {focusedStep.hotkeys.length > 0 ? (
            <div className={styles.hotkeys}>
              {focusedStep.hotkeys.map((key) => (
                <kbd className={styles.keycap} key={key}>
                  {key}
                </kbd>
              ))}
            </div>
          ) : null}
          <p className={styles.tip}>
            <strong>Co-op tip:</strong> {focusedStep.tip}
          </p>
        </section>
      )}

      <ol className={styles.checklist}>
        {progress.steps.map((step) => {
          const isCurrent = progress.activeStep?.id === step.id;
          const isFocused = focusedStep?.id === step.id;
          return (
            <li key={step.id}>
              <button
                aria-current={isCurrent ? "step" : undefined}
                className={
                  isFocused ? styles.checkItemFocused : styles.checkItem
                }
                data-completed={step.completed}
                data-step-id={step.id}
                onClick={() =>
                  setInspectedId((current) =>
                    current === step.id ? null : step.id,
                  )
                }
                type="button"
              >
                <span aria-hidden="true" className={styles.checkIcon}>
                  {step.completed ? "✓" : step.index + 1}
                </span>
                <span className={styles.checkTitle}>{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
