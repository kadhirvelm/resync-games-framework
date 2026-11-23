/** @jsxRuntime automatic */
/** @jsxImportSource react */

import { useEffect, useRef } from "react";
import { COACH_MARKS, type CoachMarkId } from "./coach";
import type { CommitModel } from "./confirm";
import styles from "./descentView.module.scss";
import { GLOSSARY } from "./glossary";
import { HOTKEY_ROWS } from "./hotkeys";

/**
 * Glossary of coined terms, opened from the unit panel, build menu, or Omen.
 * @param props - Close handler
 * @returns The dialog
 */
export function GlossaryDialog({ onClose }: { onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes modal via shell hotkeys
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label="Glossary" className={styles.dialog} role="dialog">
        <h2>Glossary</h2>
        <dl className={styles.glossaryList}>
          {GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt>{entry.term}</dt>
              <dd>{entry.meaning}</dd>
            </div>
          ))}
        </dl>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Confirm step. Cultivation rows are visible before the commit button runs.
 * @param props - Dialog model and actions
 * @returns The dialog
 */
export function CommitDialog({
  model,
  onClose,
  onCommit,
  onTradeAmount,
  tradeAmount,
}: {
  model: CommitModel;
  onClose: () => void;
  onCommit: () => void;
  onTradeAmount: (amount: number) => void;
  tradeAmount: number;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes modal via shell hotkeys
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby="descent-confirm-title"
        className={styles.dialog}
        role="dialog"
      >
        <h2 id="descent-confirm-title">{model.title}</h2>
        <dl className={styles.dialogRows}>
          {model.rows.map((row) => (
            <div key={`${row.label}-${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        {model.blockedMessage === null ? null : (
          <p role="alert">{model.blockedMessage}</p>
        )}
        {model.tradeAmount ? (
          <label className={styles.tradeAmountLabel}>
            Amount
            <input
              min={1}
              onChange={(event) =>
                onTradeAmount(
                  Math.max(1, Math.floor(Number(event.target.value) || 1)),
                )
              }
              type="number"
              value={tradeAmount}
            />
          </label>
        ) : null}
        <button onClick={onCommit} type="button">
          {model.confirmLabel}
        </button>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * A short Ashen Gate coach mark. It is not a modal wall.
 * @param props - Mark id and dismiss handler
 * @returns The note
 */
export function CoachMark({
  id,
  onDismiss,
}: {
  id: CoachMarkId;
  onDismiss: (id: CoachMarkId) => void;
}) {
  const mark = COACH_MARKS[id];
  return (
    <aside className={styles.coach} role="note">
      <h3>{mark.title}</h3>
      <p>{mark.body}</p>
      <button onClick={() => onDismiss(id)} type="button">
        OK
      </button>
    </aside>
  );
}

/**
 * The hotkey stub.
 * @param props - Close handler
 * @returns The dialog
 */
export function HotkeyDialog({ onClose }: { onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes modal via shell hotkeys
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label="Controls" className={styles.dialog} role="dialog">
        <h2>Controls</h2>
        <ul className={styles.hotkeyList}>
          {HOTKEY_ROWS.map((row) => (
            <li className={styles.hotkeyRow} key={`${row.key}:${row.action}`}>
              <kbd className={styles.keycap}>{row.key}</kbd>
              <span className={styles.hotkeyAction}>{row.action}</span>
            </li>
          ))}
        </ul>
        <button onClick={onClose} type="button">
          Close
        </button>
      </div>
    </div>
  );
}

/**
 * Pause menu opened with Escape: resume, review controls, or leave the match.
 * @param props - Handlers and whether leaving closes a co-op room
 * @returns The dialog
 */
export function PauseMenuDialog({
  onControls,
  onExit,
  onResume,
  roomExit,
}: {
  onControls: () => void;
  onExit: () => void;
  onResume: () => void;
  roomExit: boolean;
}) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click dismisses modal
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape closes modal via shell hotkeys
    <div
      className={styles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onResume();
      }}
    >
      <div aria-label="Game menu" className={styles.dialog} role="dialog">
        <h2>Paused</h2>
        <button onClick={onResume} type="button">
          Resume
        </button>
        <button onClick={onControls} type="button">
          Controls
        </button>
        <button onClick={onExit} type="button">
          {roomExit ? "Leave room" : "Exit to title"}
        </button>
      </div>
    </div>
  );
}

/** How long a notice stays before it leaves on its own. */
export const TOAST_DISMISS_MS = 2400;

/**
 * One quiet notice. It leaves on its own after a short delay.
 * @param props - Copy, lifetime, and dismiss handler
 * @returns The status line
 */
function ToastNotice({
  id,
  lifetimeMs,
  message,
  onDismiss,
  tone,
}: {
  id: number;
  lifetimeMs: number;
  message: string;
  onDismiss: (id: number) => void;
  tone: ToastTone;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(id), lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [id, lifetimeMs]);

  return (
    <p
      className={tone === "error" ? styles.errorToast : styles.toast}
      role={tone === "error" ? "alert" : "status"}
      style={{ ["--toast-life" as string]: `${lifetimeMs}ms` }}
    >
      <span>{message}</span>
      <button
        aria-label="Dismiss notice"
        onClick={() => onDismiss(id)}
        type="button"
      >
        ×
      </button>
    </p>
  );
}

/** How long an "action blocked" notice stays; it carries a fix to read. */
export const ERROR_TOAST_DISMISS_MS = 4200;

/** `info` for game events, `error` for an action the player could not take. */
export type ToastTone = "error" | "info";

/**
 * Two short stacks of notices: quiet game events in the corner, and blocked
 * actions centered above the HUD where the player is looking. Each leaves
 * on its own.
 * @param props - Messages, their tones, and the dismiss handler
 * @returns The live regions
 */
export function ToastList({
  lifetimeMs = TOAST_DISMISS_MS,
  onDismiss,
  only,
  toasts,
}: {
  /** How long each notice stays. Defaults to a short self-dismiss. */
  lifetimeMs?: number;
  onDismiss: (id: number) => void;
  /** Optional tone filter so the shell can dock info and error stacks separately. */
  only?: ToastTone;
  toasts: readonly { id: number; message: string; tone?: ToastTone }[];
}) {
  const errors = toasts.filter((toast) => toast.tone === "error");
  const notices = toasts.filter((toast) => toast.tone !== "error");
  const showInfo = only === undefined || only === "info";
  const showError = only === undefined || only === "error";
  return (
    <>
      {showInfo ? (
        <div aria-live="polite" className={styles.toasts} data-testid="toasts">
          {notices.map((toast) => (
            <ToastNotice
              id={toast.id}
              key={toast.id}
              lifetimeMs={lifetimeMs}
              message={toast.message}
              onDismiss={onDismiss}
              tone="info"
            />
          ))}
        </div>
      ) : null}
      {showError ? (
        <div className={styles.errorToasts} data-testid="error-toasts">
          {errors.map((toast) => (
            <ToastNotice
              id={toast.id}
              key={toast.id}
              lifetimeMs={Math.max(lifetimeMs, ERROR_TOAST_DISMISS_MS)}
              message={toast.message}
              onDismiss={onDismiss}
              tone="error"
            />
          ))}
        </div>
      ) : null}
    </>
  );
}
