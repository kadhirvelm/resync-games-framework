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
    <div className={styles.backdrop}>
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
    <div className={styles.backdrop}>
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
          <label>
            Amount
            <input
              min={1}
              onChange={(event) => onTradeAmount(Number(event.target.value))}
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
    <div className={styles.backdrop}>
      <div aria-label="Controls" className={styles.dialog} role="dialog">
        <h2>Controls</h2>
        <ul>
          {HOTKEY_ROWS.map((row) => (
            <li key={`${row.key}:${row.action}`}>
              {row.key}: {row.action}
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
}: {
  id: number;
  lifetimeMs: number;
  message: string;
  onDismiss: (id: number) => void;
}) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    const timer = window.setTimeout(() => dismiss.current(id), lifetimeMs);
    return () => window.clearTimeout(timer);
  }, [id, lifetimeMs]);

  return (
    <p
      className={styles.toast}
      role="status"
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

/**
 * A short stack of notices. Each one leaves on its own.
 * @param props - Messages and dismiss handler
 * @returns The live region
 */
export function ToastList({
  lifetimeMs = TOAST_DISMISS_MS,
  onDismiss,
  toasts,
}: {
  /** How long each notice stays. Defaults to a short self-dismiss. */
  lifetimeMs?: number;
  onDismiss: (id: number) => void;
  toasts: readonly { id: number; message: string }[];
}) {
  return (
    <div aria-live="polite" className={styles.toasts} data-testid="toasts">
      {toasts.map((toast) => (
        <ToastNotice
          id={toast.id}
          key={toast.id}
          lifetimeMs={lifetimeMs}
          message={toast.message}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
