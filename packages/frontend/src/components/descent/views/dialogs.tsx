/** @jsxRuntime automatic */
/** @jsxImportSource react */

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

/**
 * Failure toasts. They stay until dismissed.
 * @param props - Messages and dismiss handler
 * @returns The live region
 */
export function ToastList({
  onDismiss,
  toasts,
}: {
  onDismiss: (id: number) => void;
  toasts: readonly { id: number; message: string }[];
}) {
  return (
    <div aria-live="polite" className={styles.toasts} data-testid="toasts">
      {toasts.map((toast) => (
        <p className={styles.toast} key={toast.id} role="status">
          {toast.message}{" "}
          <button
            aria-label="Dismiss notice"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            ×
          </button>
        </p>
      ))}
    </div>
  );
}
