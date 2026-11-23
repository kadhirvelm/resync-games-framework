/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { useEffect, useId, useRef, useState } from "react";
import type { FormationId } from "../logic/types";
import styles from "./bottomHud.module.scss";
import { CostRow } from "./CostRow";
import { type CardButton, commandIconSrc } from "./card";
import { type CostStock, costLineText } from "./costLine";
import formationStyles from "./formationControls.module.scss";
import { resourceLineParts } from "./resourceLine";

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
 * Builds an accessible summary from the command-card copy.
 * @param button - Command or training choice
 * @returns Comma-separated label, role, behavior, cost, and blocker
 */
function buttonAriaLabel(button: CardButton): string {
  const cost =
    button.cost === undefined
      ? undefined
      : `Cost: ${costLineText(button.cost)}`;
  const blockers =
    button.disabled === true && button.blockers !== undefined
      ? `Unavailable: ${button.blockers.map((item) => item.problem).join("; ")}`
      : undefined;
  return [
    button.label,
    button.role,
    button.description,
    cost,
    blockers ?? button.detail,
  ]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(", ");
}

/**
 * Renders a cost line with each resource name replaced by its HUD icon.
 * The name stays available to assistive tech.
 * @param props - The cost or status line
 * @returns Icon and text fragments
 */
function ResourceLine({ text }: { text: string }) {
  return resourceLineParts(text).map((part) => {
    if (part.kind === "text") {
      return <span key={part.key}>{part.text}</span>;
    }
    return (
      <span className={styles.resourceToken} key={part.key}>
        {/* biome-ignore lint/performance/noImgElement: bundled game HUD icon */}
        <img alt="" className={styles.resourceTokenIcon} src={part.iconSrc} />
        <span className={styles.srOnly}>{part.name}</span>
      </span>
    );
  });
}

/**
 * The copy a tile should show. Shift replaces a training cost with the batch.
 * @param button - Command-card button
 * @param shift - Whether Shift is held
 * @returns The button, with its price swapped when a batch is priced
 */
function shownButton(button: CardButton, shift: boolean): CardButton {
  if (!shift) return button;
  if (button.batchCost !== undefined) {
    // A batch is only offered when the order is allowed, so the text line
    // can only be a cost the batch price replaces.
    return { ...button, cost: button.batchCost, detail: undefined };
  }
  if (button.batchDetail === undefined) return button;
  return { ...button, detail: button.batchDetail };
}

/**
 * Whether a tile is blocked and should explain itself instead of acting.
 * @param button - Command-card button
 * @returns True when the action cannot run right now
 */
function isBlocked(button: CardButton): boolean {
  return button.disabled === true;
}

/**
 * One square action tile, AoE-style: just the icon and its hotkey. Name,
 * price, and any blocker live in the tooltip. A blocked tile stays hoverable
 * and clickable so it can say why it is blocked and how to fix it.
 * @param props - Button, activation, block, hover callbacks, and denial flash
 * @returns The tile
 */
function ActionTile({
  button,
  denied,
  describedBy,
  onActivate,
  onDenied,
  onHint,
  shift,
}: {
  button: CardButton;
  /** Tooltip id while this tile's tooltip is showing. */
  describedBy?: string;
  /** Whether the tile is flashing after a blocked click. */
  denied: boolean;
  onActivate: (button: CardButton) => void;
  onDenied: (button: CardButton) => void;
  onHint: (button: CardButton | null) => void;
  shift: boolean;
}) {
  const training = button.intent.type === "train";
  const formation =
    button.intent.type === "formation" ? button.intent.formation : null;
  const shown = shownButton(button, shift);
  const blocked = isBlocked(button);
  const batch =
    shift && button.batchCount !== undefined && button.batchCount > 1
      ? button.batchCount
      : null;
  return (
    <button
      aria-describedby={describedBy}
      aria-disabled={blocked ? true : undefined}
      aria-label={buttonAriaLabel(shown)}
      aria-pressed={formation === null ? undefined : button.pressed}
      className={`${styles.action} ${button.pressed === true ? formationStyles.active : ""}`}
      data-active={button.pressed === true}
      data-blocked={blocked}
      data-command={button.intent.type}
      data-denied={denied}
      data-formation={formation ?? undefined}
      data-training={training}
      data-unit-class={
        button.intent.type === "train" ? button.intent.classId : undefined
      }
      onBlur={() => onHint(null)}
      onClick={(event) => {
        if (blocked) {
          onDenied(button);
          return;
        }
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
      <span className={styles.srOnly}>
        {training ? button.label.replace(/^Train /, "") : button.label}
      </span>
      {button.hotkey === undefined ? null : (
        <kbd className={styles.actionHotkey}>{button.hotkey}</kbd>
      )}
      {batch === null ? null : (
        <span aria-hidden="true" className={styles.actionBatch}>
          ×{batch}
        </span>
      )}
      {blocked ? (
        <span aria-hidden="true" className={styles.actionLock}>
          !
        </span>
      ) : null}
    </button>
  );
}

/**
 * The tooltip for a hovered action, laid out like an RTS tooltip: name and
 * hotkey, price, what it does, then — when blocked — every missing
 * requirement with the step that fixes it.
 * @param props - The hovered action, whether Shift is held, and stock
 * @returns The tooltip body
 */
function ActionTooltip({
  button,
  id,
  shift,
  stock,
}: {
  button: CardButton;
  id: string;
  shift: boolean;
  stock: CostStock;
}) {
  const shown = shownButton(button, shift);
  const blocked = isBlocked(button);
  const blockers = blocked ? (button.blockers ?? []) : [];
  const showDetail =
    shown.detail !== undefined && (blockers.length === 0 || !blocked);
  return (
    <div
      className={styles.tooltip}
      data-blocked={blocked}
      data-testid="command-tooltip"
      id={id}
      role="tooltip"
    >
      <div className={styles.tooltipHead}>
        <strong>{shown.label}</strong>
        {shown.hotkey === undefined ? null : (
          <kbd className={styles.hintHotkey}>{shown.hotkey}</kbd>
        )}
        {shown.role === undefined ? null : (
          <span className={styles.hintRole}>{shown.role}</span>
        )}
      </div>
      {shown.cost === undefined ? null : (
        <CostRow line={shown.cost} size="full" stock={stock} />
      )}
      {shown.description === undefined ? null : (
        <p className={styles.tooltipText}>{shown.description}</p>
      )}
      {showDetail && shown.detail !== undefined ? (
        <p className={blocked ? styles.hintBlocked : styles.hintCost}>
          <ResourceLine text={shown.detail} />
        </p>
      ) : null}
      {blockers.length === 0 ? null : (
        <section aria-label="Requirements" className={styles.requirements}>
          <h4 className={styles.requirementsHeading}>Can't do this yet</h4>
          <ul className={styles.requirementList}>
            {blockers.map((item) => (
              <li key={item.problem}>
                <span className={styles.requirementProblem}>
                  {item.problem}
                </span>
                {item.fix === undefined ? null : (
                  <span className={styles.requirementFix}>{item.fix}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** How long a blocked tile flashes after a click. */
const DENIED_FLASH_MS = 450;

/**
 * Tracks whether Shift is held anywhere on the page.
 * @returns Whether Shift is down
 */
function useShiftHeld(): boolean {
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
  return shift;
}

/**
 * The bottom-left action grid: what the selection can do, as square icon
 * tiles, with a tooltip above for whichever tile is hovered or focused.
 * Clicking a blocked tile flashes it, pins its tooltip, and reports it.
 * @param props - Buttons, activators, stock, and the name of what they act on
 * @returns The command card
 */
export function CommandCard({
  buttons,
  onActivate,
  onBlocked,
  stock,
  subject,
}: {
  buttons: readonly CardButton[];
  onActivate: (button: CardButton) => void;
  /** Called when the player clicks an action that cannot run. */
  onBlocked?: (button: CardButton) => void;
  /** What the player can spend, so short amounts draw in red. */
  stock: CostStock;
  /** What the actions apply to, e.g. "Camp" or "3 Villagers". */
  subject?: string;
}) {
  const [hinted, setHinted] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);
  const deniedTimer = useRef<number | null>(null);
  const hint = buttons.find((button) => button.id === hinted) ?? null;
  const shift = useShiftHeld();
  const tooltipId = useId();
  // A tile that vanished with the selection never fires blur or leave, so
  // forget it rather than pop its tooltip when a same-id tile returns.
  useEffect(() => {
    if (hinted !== null && hint === null) setHinted(null);
  }, [hint, hinted]);
  useEffect(
    () => () => {
      if (deniedTimer.current !== null) {
        window.clearTimeout(deniedTimer.current);
      }
    },
    [],
  );
  const training = buttons.filter((button) => button.intent.type === "train");
  const commands = buttons.filter((button) => button.intent.type !== "train");
  const onHint = (button: CardButton | null) => setHinted(button?.id ?? null);
  const onDenied = (button: CardButton) => {
    setHinted(button.id);
    setDenied(button.id);
    if (deniedTimer.current !== null) window.clearTimeout(deniedTimer.current);
    deniedTimer.current = window.setTimeout(
      () => setDenied(null),
      DENIED_FLASH_MS,
    );
    onBlocked?.(button);
  };
  return (
    <section aria-label="Command card" className={styles.actions}>
      <h3 className={styles.srOnly}>
        {subject === undefined ? "Actions" : `Actions · ${subject}`}
      </h3>
      <div className={styles.tooltipDock}>
        {hint === null ? null : (
          <ActionTooltip
            button={hint}
            id={tooltipId}
            shift={shift}
            stock={stock}
          />
        )}
      </div>
      {buttons.length === 0 ? (
        <p className={styles.actionsEmpty}>No actions</p>
      ) : (
        <div className={styles.actionGrid}>
          {[...training, ...commands].map((button) => (
            <ActionTile
              button={button}
              denied={denied === button.id}
              describedBy={hint?.id === button.id ? tooltipId : undefined}
              key={button.id}
              onActivate={onActivate}
              onDenied={onDenied}
              onHint={onHint}
              shift={shift}
            />
          ))}
        </div>
      )}
    </section>
  );
}
