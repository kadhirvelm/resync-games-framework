"use client";

import {
  type CrosswordCryptCellUpdate,
  type CrosswordCryptPublicState,
  type CrosswordCryptRelic,
  crosswordGridGuess,
} from "@resync-game-framework/api";
import styles from "../CrosswordCryptExperience.module.scss";
import { CROSSWORD_CRYPT_ART_TAGS } from "../data/art";
import {
  answerLengthLabel,
  isPuzzlePhase,
  RELIC_DETAILS,
} from "../logic/presentation";
import { CrosswordBoard } from "./CrosswordBoard";
import {
  AnswerCells,
  GuessFeedbackLine,
  RelicTray,
  ResultCard,
  StatusStrip,
} from "./CryptPieces";
import { GuessForm } from "./GuessForm";

interface TableViewProps {
  art: Partial<Record<string, string>>;
  guess: string;
  isHost: boolean;
  onChooseRelic: (relic: CrosswordCryptRelic) => void;
  /** Types or clears squares on the shared crossword. */
  onFillCells: (cells: CrosswordCryptCellUpdate[]) => Promise<unknown>;
  onGuess: (guess: string) => void;
  onGuessChange: (value: string) => void;
  onHint: () => void;
  onStart: () => void;
  onUseRelic: (relic: CrosswordCryptRelic) => void;
  state: CrosswordCryptPublicState;
}

/**
 * The shared screen everyone looks at: door and torches, the public board,
 * the whisper when two play, and the answer box. Never shows private clues.
 * @param props - Public state, door art, and actions
 * @returns The table view
 */
export function TableView(props: TableViewProps) {
  const { state } = props;
  const puzzle = isPuzzlePhase(state.phase);
  const doorUrl = props.art[doorArtTag(state)];

  return (
    <section className={styles.table}>
      <StatusStrip state={state} />

      <div className={styles.tableStage}>
        <div
          aria-hidden="true"
          className={styles.door}
          data-open={
            state.lastGuess?.correct || state.phase === "escaped" || undefined
          }
          style={doorUrl ? { backgroundImage: `url(${doorUrl})` } : undefined}
        />

        <div className={styles.board}>
          {state.notice ? (
            <p className={styles.notice}>{state.notice}</p>
          ) : null}

          {puzzle && state.whisper ? (
            <blockquote className={styles.whisper}>
              <span className={styles.sectionLabel}>
                Crypt whisper · everyone can see this
              </span>
              {state.whisper}
            </blockquote>
          ) : null}

          {puzzle && state.roomType === "crossword" ? (
            <CrosswordRoom
              onCheck={() => props.onGuess("grid")}
              onFillCells={props.onFillCells}
              onHint={props.onHint}
              state={state}
            />
          ) : null}

          {puzzle && state.roomType !== "crossword" ? (
            <>
              <span className={styles.sectionLabel}>
                The answer · {answerLengthLabel(state.answerCells)}
              </span>
              <AnswerCells cells={state.answerCells} />
              <GuessForm
                guess={props.guess}
                hint={{ onHint: props.onHint, tokens: state.hintTokens }}
                letterCount={state.answerCells.length}
                onGuess={props.onGuess}
                onGuessChange={props.onGuessChange}
              />
              <p className={styles.muted}>
                Ask each player to read their clue aloud. Wrong answers burn a
                torch; hints never do.
              </p>
            </>
          ) : null}

          <GuessFeedbackLine state={state} />

          {state.phase === "relic" ? (
            <RelicChoice
              choices={state.relicChoices}
              isHost={props.isHost}
              onChoose={props.onChooseRelic}
            />
          ) : null}

          {state.phase === "escaped" || state.phase === "sealed" ? (
            <ResultCard
              isHost={props.isHost}
              onStart={props.onStart}
              state={state}
            />
          ) : null}
        </div>
      </div>

      <RelicTray onUse={props.onUseRelic} relics={state.relics} />
    </section>
  );
}

/**
 * The crossword on the table: the editable grid, then check and hint.
 * @param props - Public state and crossword commands
 * @returns The crossword room controls
 */
function CrosswordRoom({
  onCheck,
  onFillCells,
  onHint,
  state,
}: {
  onCheck: () => void;
  onFillCells: (cells: CrosswordCryptCellUpdate[]) => Promise<unknown>;
  onHint: () => void;
  state: CrosswordCryptPublicState;
}) {
  const complete = crosswordGridGuess(state) !== null;
  return (
    <>
      <CrosswordBoard
        answerCells={state.answerCells}
        grid={state.grid}
        letters={state.gridLetters}
        onFill={onFillCells}
      />
      <div className={styles.checkRow}>
        <button
          className={styles.primaryButton}
          disabled={!complete}
          onClick={onCheck}
          type="button"
        >
          Check the grid
        </button>
        <button
          className={styles.secondaryButton}
          disabled={state.hintTokens < 1}
          onClick={onHint}
          title="Reveals one square. Does not cost a torch."
          type="button"
        >
          Reveal a square ({state.hintTokens})
        </button>
      </div>
      <p className={styles.muted}>
        {complete
          ? "Every square is filled. Check it when the group agrees; a wrong grid burns a torch."
          : "Tap a square or a word, then type. Players read their numbered clues aloud."}
      </p>
    </>
  );
}

/**
 * Relic reward after a cleared room. Only the host confirms.
 * @param props - Offered relics, host flag, and choose handler
 * @returns Relic cards to pick from
 */
function RelicChoice({
  choices,
  isHost,
  onChoose,
}: {
  choices: readonly CrosswordCryptRelic[];
  isHost: boolean;
  onChoose: (relic: CrosswordCryptRelic) => void;
}) {
  return (
    <div className={styles.relicChoice}>
      <h2>The door opens. Choose one relic.</h2>
      {isHost ? null : <p className={styles.muted}>The host makes the pick.</p>}
      <div className={styles.relicOptions}>
        {choices.map((relic) => (
          <button
            className={styles.relicOption}
            disabled={!isHost}
            key={relic}
            onClick={() => onChoose(relic)}
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
 * Selects the generated door painting for the public phase when it exists.
 * @param state - Public run state
 * @returns Art tag for the current door
 */
function doorArtTag(state: CrosswordCryptPublicState): string {
  if (state.phase === "escaped") return CROSSWORD_CRYPT_ART_TAGS.escape;
  if (state.phase === "sealed") return CROSSWORD_CRYPT_ART_TAGS.sealed;
  if (state.phase === "vault") return CROSSWORD_CRYPT_ART_TAGS.vault;
  if (state.lastGuess?.correct) return CROSSWORD_CRYPT_ART_TAGS.openDoor;
  return CROSSWORD_CRYPT_ART_TAGS.closedDoor;
}
