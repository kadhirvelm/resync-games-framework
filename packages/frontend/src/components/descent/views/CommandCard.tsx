/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useEffect, useState } from "react";
import type { FormationId } from "../logic/types";
import styles from "./bottomHud.module.scss";
import { type CardButton, commandIconSrc } from "./card";
import formationStyles from "./formationControls.module.scss";

/** Dot layouts for the four selectable military formations. */
const FORMATION_ICON_POINTS: Record<
  FormationId,
  readonly (readonly [number, number])[]
> = {
  column: [
    [14, 7],
    [22, 7],
    [14, 18],
    [22, 18],
    [14, 29],
    [22, 29],
  ],
  line: [
    [5, 18],
    [10, 18],
    [15, 18],
    [21, 18],
    [26, 18],
    [31, 18],
  ],
  ranks: [
    [9, 10],
    [18, 10],
    [27, 10],
    [12, 25],
    [24, 25],
  ],
  wedge: [
    [18, 6],
    [12, 14],
    [24, 14],
    [7, 25],
    [18, 22],
    [29, 25],
  ],
};

/**
 * Draws a compact tactical diagram for one formation preset.
 * @param props - Formation whose slots should be shown
 * @returns An accessible-hidden formation glyph
 */
function FormationIcon({ formation }: { formation: FormationId }) {
  return (
    <svg
      aria-hidden="true"
      className={`${styles.actionIcon} ${formationStyles.icon}`}
      viewBox="0 0 36 36"
    >
      {FORMATION_ICON_POINTS[formation].map(([x, y]) => (
        <circle cx={x} cy={y} key={`${x}-${y}`} r="2.75" />
      ))}
    </svg>
  );
}

/**
 * Builds an accessible summary from the visible command-card copy.
 * @param button - Command or training choice
 * @returns Comma-separated label, role, behavior, and cost or blocker
 */
function buttonAriaLabel(button: CardButton): string {
  return [button.label, button.role, button.description, button.detail]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(", ");
}

/**
 * The copy a tile should show. Shift replaces a training cost with the batch.
 * @param button - Command-card button
 * @param shift - Whether Shift is held
 * @returns The button, with `detail` swapped when a batch is priced
 */
function shownButton(button: CardButton, shift: boolean): CardButton {
  if (!shift || button.batchDetail === undefined) return button;
  return { ...button, detail: button.batchDetail };
}

/**
 * One action tile: icon, label, and a short status line. Training tiles keep
 * their unit portrait and role. The full explanation shows in the hint strip.
 * @param props - Button, activation, hover callbacks, and whether Shift is held
 * @returns The tile
 */
function ActionTile({
  button,
  onActivate,
  onHint,
  shift,
}: {
  button: CardButton;
  onActivate: (button: CardButton) => void;
  onHint: (button: CardButton | null) => void;
  shift: boolean;
}) {
  const training = button.intent.type === "train";
  const formation =
    button.intent.type === "formation" ? button.intent.formation : null;
  const shown = shownButton(button, shift);
  return (
    <button
      aria-label={buttonAriaLabel(shown)}
      aria-pressed={formation === null ? undefined : button.pressed}
      className={`${styles.action} ${button.pressed === true ? formationStyles.active : ""}`}
      data-active={button.pressed === true}
      data-command={button.intent.type}
      data-formation={formation ?? undefined}
      data-training={training}
      data-unit-class={
        button.intent.type === "train" ? button.intent.classId : undefined
      }
      disabled={button.disabled}
      onBlur={() => onHint(null)}
      onClick={(event) => {
        if (
          event.shiftKey &&
          button.intent.type === "train" &&
          button.batchCount !== undefined &&
          button.batchCount > 1
        ) {
          onActivate({
            ...shown,
            intent: { ...button.intent, count: button.batchCount },
          });
          return;
        }
        onActivate(button);
      }}
      onFocus={() => onHint(button)}
      onPointerEnter={() => onHint(button)}
      onPointerLeave={() => onHint(null)}
      title={shown.detail ?? button.description}
      type="button"
    >
      {formation === null ? (
        // biome-ignore lint/performance/noImgElement: Tiny local icons must work in the offline game shell without URL transformation.
        <img
          alt=""
          aria-hidden="true"
          className={styles.actionIcon}
          src={commandIconSrc(button)}
        />
      ) : (
        <FormationIcon formation={formation} />
      )}
      <span className={styles.actionLabel}>
        {training ? button.label.replace(/^Train /, "") : button.label}
      </span>
      {training && button.role !== undefined ? (
        <span className={styles.actionRole}>{button.role}</span>
      ) : null}
      {shown.detail === undefined ? null : (
        <span
          className={styles.actionDetail}
          data-batch={shift && button.batchDetail !== undefined}
        >
          {shown.detail}
        </span>
      )}
      {button.hotkey === undefined ? null : (
        <kbd className={styles.actionHotkey}>{button.hotkey}</kbd>
      )}
      {button.description === undefined ? null : (
        <span className={styles.srOnly}>{button.description}</span>
      )}
    </button>
  );
}

/**
 * The hint strip line for a hovered action.
 * @param props - The hovered action
 * @returns Its name, role, explanation, and cost or blocker
 */
function ActionHint({ button, shift }: { button: CardButton; shift: boolean }) {
  const shown = shownButton(button, shift);
  return (
    <>
      <strong>{shown.label}</strong>
      {shown.role === undefined ? null : (
        <span className={styles.hintRole}>{shown.role}</span>
      )}
      {shown.detail === undefined ? null : (
        <span className={shown.disabled ? styles.hintBlocked : styles.hintCost}>
          {shown.detail}
        </span>
      )}
      {shown.description === undefined ? null : (
        <span>{shown.description}</span>
      )}
    </>
  );
}

/**
 * The bottom-right action panel: what the selection can do, as icon tiles,
 * with a hint strip that explains whichever tile is hovered or focused.
 * @param props - Buttons, the activator, and the name of what they act on
 * @returns The command card
 */
export function CommandCard({
  buttons,
  onActivate,
  subject,
}: {
  buttons: readonly CardButton[];
  onActivate: (button: CardButton) => void;
  /** What the actions apply to, e.g. "Camp" or "3 Villagers". */
  subject?: string;
}) {
  const [hinted, setHinted] = useState<string | null>(null);
  const hint = buttons.find((button) => button.id === hinted) ?? null;
  const [shift, setShift] = useState(false);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShift(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") setShift(false);
    };
    const onBlur = () => setShift(false);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
  const training = buttons.filter((button) => button.intent.type === "train");
  const commands = buttons.filter((button) => button.intent.type !== "train");
  const onHint = (button: CardButton | null) => setHinted(button?.id ?? null);
  return (
    <section aria-label="Command card" className={styles.actions}>
      <p aria-live="polite" className={styles.hint}>
        {hint === null ? (
          <span className={styles.hintIdle}>
            {buttons.length === 0
              ? "No actions for this selection."
              : shift && training.length > 0
                ? "Holding Shift queues up to 5. Hover a unit to see the cost."
                : `Actions${subject === undefined ? "" : ` · ${subject}`} — hover one to see what it does`}
          </span>
        ) : (
          <ActionHint button={hint} shift={shift} />
        )}
      </p>
      <div className={styles.actionGrid}>
        {[...training, ...commands].map((button) => (
          <ActionTile
            button={button}
            key={button.id}
            onActivate={onActivate}
            onHint={onHint}
            shift={shift}
          />
        ))}
      </div>
    </section>
  );
}
