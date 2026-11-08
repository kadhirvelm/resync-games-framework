"use client";

import type {
  CrosswordCryptAnswerCell,
  CrosswordCryptPublicState,
  CrosswordCryptRelic,
} from "@resync-game-framework/api";
import { useState } from "react";
import styles from "../CrosswordCryptExperience.module.scss";
import {
  guessFeedback,
  RELIC_DETAILS,
  roomProgressLabel,
} from "../logic/presentation";

/** Which screen this browser is acting as. */
export type CryptDisplay = "phone" | "table";

/**
 * Two-way switch between this player's private clues and the shared table.
 * @param props - Current display and change handler
 * @returns A labelled segmented control
 */
export function ViewSwitcher({
  display,
  onChange,
}: {
  display: CryptDisplay;
  onChange: (display: CryptDisplay) => void;
}) {
  return (
    <div className={styles.switcher}>
      <button
        aria-pressed={display === "phone"}
        onClick={() => onChange("phone")}
        type="button"
      >
        <span aria-hidden="true">🔒</span>
        My clues
      </button>
      <button
        aria-pressed={display === "table"}
        onClick={() => onChange("table")}
        type="button"
      >
        <span aria-hidden="true">🕯</span>
        Shared table
      </button>
    </div>
  );
}

/**
 * Room code with a copy button, sized for a header or a TV.
 * @param props - Room code and whether to render the large version
 * @returns The code badge
 */
export function RoomCode({
  code,
  large = false,
}: {
  code: string;
  large?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  /** Copies the code; failures (blocked clipboard) leave the label as is. */
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1_600);
    } catch {
      /* Clipboard can be blocked; the code is still on screen to read out. */
    }
  };

  return (
    <div className={large ? styles.roomCodeLarge : styles.roomCode}>
      <span className={styles.roomCodeLabel}>Room code</span>
      <strong>{code}</strong>
      <button
        className={styles.copyButton}
        onClick={() => void copy()}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/**
 * Where the party is, how many torches remain, and how many hints are left.
 * @param props - Public run state
 * @returns The status strip shown above both views
 */
export function StatusStrip({ state }: { state: CrosswordCryptPublicState }) {
  return (
    <div className={styles.statusStrip}>
      <span className={styles.progress}>{roomProgressLabel(state)}</span>
      <TorchRow count={state.torches} max={state.maxTorches ?? 5} />
      <span className={styles.hintCount}>
        {state.hintTokens} {state.hintTokens === 1 ? "hint" : "hints"} left
      </span>
    </div>
  );
}

/** Stable keys for up to five torch slots. */
const TORCH_KEYS = ["first", "second", "third", "fourth", "fifth"] as const;

/**
 * Row of the run's shared torches.
 * @param props - Torches still lit, and how many the run started with
 * @returns Lit and burnt-out flames
 */
export function TorchRow({ count, max }: { count: number; max: number }) {
  return (
    <div
      aria-label={`${count} of ${max} torches lit`}
      className={styles.torches}
      role="img"
    >
      {TORCH_KEYS.slice(0, max).map((id, index) => (
        <span data-lit={index < count || undefined} key={id}>
          ♨
        </span>
      ))}
    </div>
  );
}

/**
 * The group's answer as blanks, with revealed letters filled in.
 * @param props - Public answer cells and an optional compact size
 * @returns A row of letter tiles
 */
export function AnswerCells({
  cells,
  compact = false,
}: {
  cells: readonly CrosswordCryptAnswerCell[];
  compact?: boolean;
}) {
  return (
    <div
      aria-label={`Answer, ${cells.length} letters`}
      className={compact ? styles.answerCellsCompact : styles.answerCells}
      role="img"
    >
      {cells.map((cell) => (
        <span data-revealed={cell.revealed || undefined} key={cell.index}>
          {cell.revealed ? cell.letter : ""}
        </span>
      ))}
    </div>
  );
}

/**
 * Message for the last committed answer.
 * @param props - Public run state
 * @returns A coloured status line, or nothing before the first guess
 */
export function GuessFeedbackLine({
  state,
}: {
  state: CrosswordCryptPublicState;
}) {
  const feedback = guessFeedback(state.lastGuess);
  if (!feedback) return null;
  return (
    <p className={styles.feedback} data-tone={feedback.tone} role="status">
      {feedback.text}
    </p>
  );
}

/**
 * The party's relics; any seated player may spend one.
 * @param props - Inventory and spend handler
 * @returns Relic buttons with descriptions, or nothing when empty
 */
export function RelicTray({
  onUse,
  relics,
}: {
  onUse: (relic: CrosswordCryptRelic) => void;
  relics: readonly CrosswordCryptRelic[];
}) {
  if (relics.length === 0) return null;
  return (
    <div className={styles.relicTray}>
      <span className={styles.sectionLabel}>Relics · tap to use</span>
      <div className={styles.relicList}>
        {keyRelics(relics).map(({ key, relic }) => (
          <button
            className={styles.relicButton}
            key={key}
            onClick={() => onUse(relic)}
            title={RELIC_DETAILS[relic].description}
            type="button"
          >
            <strong>{RELIC_DETAILS[relic].label}</strong>
            <small>{RELIC_DETAILS[relic].description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * End-of-run summary, with a restart for the host.
 * @param props - Public state, host flag, and restart handler
 * @returns The escaped or sealed card
 */
export function ResultCard({
  isHost,
  onStart,
  state,
}: {
  isHost: boolean;
  onStart: () => void;
  state: CrosswordCryptPublicState;
}) {
  const escaped = state.phase === "escaped";
  const record = state.runRecord;
  return (
    <div
      className={styles.resultCard}
      data-outcome={escaped ? "escaped" : "sealed"}
    >
      <h2>{escaped ? "You escaped the crypt!" : "The crypt is sealed"}</h2>
      <p>
        {escaped
          ? "Every voice found its piece. The way out is open."
          : "The last torch went out. Gather round and try again."}
      </p>
      {record ? (
        <dl className={styles.runStats}>
          <div>
            <dt>Rooms</dt>
            <dd>{escaped ? record.roomCount : record.roomIndexReached + 1}</dd>
          </div>
          <div>
            <dt>Torches left</dt>
            <dd>{record.torchesLeft}</dd>
          </div>
          <div>
            <dt>Relics</dt>
            <dd>{record.relics.length}</dd>
          </div>
        </dl>
      ) : null}
      {isHost ? (
        <button
          className={styles.primaryButton}
          onClick={onStart}
          type="button"
        >
          Start another run
        </button>
      ) : (
        <p className={styles.muted}>The host can start another run.</p>
      )}
    </div>
  );
}

/**
 * Gives repeated relic ids stable occurrence keys without array positions.
 * @param relics - Inventory, possibly with repeats
 * @returns Each relic with a unique key
 */
function keyRelics(relics: readonly CrosswordCryptRelic[]) {
  const counts = new Map<CrosswordCryptRelic, number>();
  return relics.map((relic) => {
    const occurrence = (counts.get(relic) ?? 0) + 1;
    counts.set(relic, occurrence);
    return { key: `${relic}-${occurrence}`, relic };
  });
}
