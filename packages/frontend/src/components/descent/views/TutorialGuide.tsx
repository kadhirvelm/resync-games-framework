/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { memo, useMemo, useState } from "react";
import {
  evaluateTutorialProgress,
  type TutorialStepId,
  type TutorialTargetHint,
} from "../logic/tutorial";
import type { SimSnapshot } from "../logic/types";
import styles from "./tutorialGuide.module.scss";

/** Props for the interactive Descent tutorial HUD overlay. */
export interface TutorialGuideProps {
  /** Optional callback to dismiss the tutorial guide for the current run. */
  onDismiss?: () => void;
  /** Optional callback to focus or select the active step's target entity or menu. */
  onFocusTarget?: (hint: TutorialTargetHint) => void;
  /** Current deterministic sim snapshot used to evaluate step completion. */
  snapshot: SimSnapshot;
  /** When true, displays a calm badge noting that the next wave is paused. */
  waveHeld?: boolean;
}

/** Button label for each tutorial target hint. */
const FOCUS_ACTION_LABELS: Readonly<Record<TutorialTargetHint, string>> = {
  barracks: "Select Barracks",
  boss: "Focus Cinderjaw",
  build_barracks: "Open Build Menu",
  camp: "Select Camp",
  cultivator: "Select Cultivator",
  idle_villagers: "Select Idle Villager",
  soldiers: "Select Soldiers",
};

/**
 * Live, collapsible guided checklist HUD panel for Descent (solo and co-op).
 * Tracks all 7 objectives against the simulation snapshot, highlights the
 * active step with an optional focus action, and lets players inspect any step
 * or dismiss the guide.
 * @param props - Snapshot and optional focus, dismiss, and wave-hold controls
 * @returns The tutorial guide overlay
 */
export const TutorialGuide = memo(function TutorialGuide({
  onDismiss,
  onFocusTarget,
  snapshot,
  waveHeld = false,
}: TutorialGuideProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [inspectedId, setInspectedId] = useState<TutorialStepId | null>(null);

  const progress = useMemo(
    () => evaluateTutorialProgress(snapshot),
    [snapshot],
  );

  const inspectedStep =
    inspectedId === null
      ? null
      : (progress.steps.find((step) => step.id === inspectedId) ?? null);

  const focusedStep =
    inspectedStep ??
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
        aria-label="Descent tutorial guide"
        className={styles.guideCollapsed}
        data-testid="descent-tutorial-guide"
      >
        <div className={styles.collapsedInfo}>
          <span className={styles.eyebrow}>
            Guide · {progress.completedCount}/{progress.totalCount}
          </span>
          <strong className={styles.collapsedTitle}>
            {progress.allComplete
              ? "All objectives complete!"
              : (progress.activeStep?.title ?? "Follow the guide")}
          </strong>
          {waveHeld ? (
            <span className={styles.waveHeldCompact}>Wave paused</span>
          ) : null}
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.toggleButton}
            onClick={() => setCollapsed(false)}
            type="button"
          >
            Show
          </button>
          {onDismiss ? (
            <button
              aria-label="Skip tutorial guide"
              className={styles.dismissButton}
              onClick={onDismiss}
              type="button"
            >
              Skip
            </button>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Descent tutorial guide"
      className={styles.guide}
      data-testid="descent-tutorial-guide"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Learn to play · Descent</span>
          <h2 className={styles.heading}>
            {progress.completedCount} / {progress.totalCount} Complete
          </h2>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.toggleButton}
            onClick={() => setCollapsed(true)}
            type="button"
          >
            Hide
          </button>
          {onDismiss ? (
            <button
              aria-label="Skip tutorial guide"
              className={styles.dismissButton}
              onClick={onDismiss}
              type="button"
            >
              Skip
            </button>
          ) : null}
        </div>
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

      {waveHeld ? (
        <div className={styles.waveHeldBadge} role="status">
          <span aria-hidden="true" className={styles.waveHeldDot} />
          <span>
            The next wave is waiting. Finish the preparation objective to
            release it. Units and construction still need time to move and
            build.
          </span>
        </div>
      ) : null}

      {progress.allComplete ? (
        <div className={styles.completeBanner}>
          <strong>You defended the Hold!</strong>
          <p>
            You&apos;ve learned to gather, build, train, and fight. Cinderjaw is
            defeated. To finish the run, press Esc to clear your selection,
            click Descend in the bottom commands, and confirm Descend.
          </p>
        </div>
      ) : null}

      <details className={styles.basics}>
        <summary>New here? Goal &amp; controls</summary>
        <p>
          Protect your Camp, grow an army, and defeat Cinderjaw, the final
          enemy. Villagers collect supplies and build; soldiers fight
          automatically when enemies are in range.
        </p>
        <p>
          Left-click selects. Right-click gives the selected units an order.
          Drag on empty ground to select a group. Press Space to pause and plan;
          press it again to let gathering, building, and training continue.
        </p>
      </details>

      {inspectedStep &&
      inspectedStep.id !== progress.activeStep?.id &&
      progress.activeStep ? (
        <button
          className={styles.focusButton}
          onClick={() => setInspectedId(null)}
          type="button"
        >
          Back to current objective
        </button>
      ) : null}

      {progress.allComplete || focusedStep === null ? null : (
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
          <h3 aria-live="polite" className={styles.activeTitle}>
            {focusedStep.title}
          </h3>
          <p className={styles.activeDetail}>{focusedStep.detail}</p>
          <ol className={styles.instructions}>
            {focusedStep.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
          <div className={styles.actionRow}>
            {onFocusTarget && !focusedStep.completed ? (
              <button
                className={styles.focusButton}
                onClick={() => onFocusTarget(focusedStep.targetHint)}
                type="button"
              >
                {FOCUS_ACTION_LABELS[focusedStep.targetHint]}
              </button>
            ) : null}
            {focusedStep.hotkeys.length > 0 ? (
              <div className={styles.hotkeys}>
                {focusedStep.hotkeys.map((key) => (
                  <kbd className={styles.keycap} key={key}>
                    {key}
                  </kbd>
                ))}
              </div>
            ) : null}
          </div>
          <p className={styles.tip}>
            <strong>Need a hand?</strong> {focusedStep.tip}
          </p>
        </section>
      )}

      <details className={styles.basics}>
        <summary>
          All objectives ({progress.completedCount}/{progress.totalCount})
        </summary>
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
                      current === step.id || isCurrent ? null : step.id,
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
      </details>
    </aside>
  );
});
