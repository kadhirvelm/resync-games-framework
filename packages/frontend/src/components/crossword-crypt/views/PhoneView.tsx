"use client";

import type {
  CrosswordCryptPrivateSlice,
  CrosswordCryptPublicState,
  CrosswordCryptRelic,
} from "@resync-game-framework/api";
import styles from "../CrosswordCryptExperience.module.scss";
import {
  answerLengthLabel,
  isPuzzlePhase,
  roleLabel,
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

interface PhoneViewProps {
  guess: string;
  isHost: boolean;
  onGuess: (guess: string) => void;
  onGuessChange: (value: string) => void;
  onOpenTable: () => void;
  onStart: () => void;
  onUseRelic: (relic: CrosswordCryptRelic) => void;
  pictureHintUrl?: string;
  slice: CrosswordCryptPrivateSlice | null;
  state: CrosswordCryptPublicState;
}

/**
 * One player's private screen: their secret clue, the shared progress, and
 * a pointer to the table where answers are typed. The assembler (4 players)
 * types the answer here instead.
 * @param props - Private slice, public state, and actions
 * @returns The phone view
 */
export function PhoneView(props: PhoneViewProps) {
  const { state } = props;
  const puzzle = isPuzzlePhase(state.phase);
  const assembler = props.slice?.role === "assembler";

  return (
    <section className={styles.phone}>
      <StatusStrip state={state} />
      {state.notice ? <p className={styles.notice}>{state.notice}</p> : null}

      {puzzle ? (
        <SliceCard pictureHintUrl={props.pictureHintUrl} slice={props.slice} />
      ) : null}

      {state.phase === "relic" ? (
        <div className={styles.interlude}>
          <h2>Room cleared!</h2>
          <p>The host is choosing a relic on the shared table.</p>
        </div>
      ) : null}

      {state.phase === "escaped" || state.phase === "sealed" ? (
        <ResultCard
          isHost={props.isHost}
          onStart={props.onStart}
          state={state}
        />
      ) : null}

      {puzzle ? (
        <div className={styles.phoneAnswer}>
          {state.roomType === "crossword" ? (
            <>
              <span className={styles.sectionLabel}>The grid so far</span>
              <CrosswordBoard
                answerCells={state.answerCells}
                grid={state.grid}
                letters={state.gridLetters}
              />
            </>
          ) : (
            <>
              <span className={styles.sectionLabel}>
                Group answer · {answerLengthLabel(state.answerCells)}
              </span>
              <AnswerCells cells={state.answerCells} compact={true} />
            </>
          )}
          {assembler && state.roomType !== "crossword" ? (
            <GuessForm
              guess={props.guess}
              letterCount={state.answerCells.length}
              onGuess={props.onGuess}
              onGuessChange={props.onGuessChange}
            />
          ) : (
            <div className={styles.tableCallout}>
              <p>
                {state.roomType === "crossword"
                  ? "Read your clues aloud, then fill the grid on the "
                  : "Talk it through, then type the answer on the "}
                <strong>Shared table</strong>.
              </p>
              <button
                className={styles.secondaryButton}
                onClick={props.onOpenTable}
                type="button"
              >
                Use this screen as the table
              </button>
            </div>
          )}
          <GuessFeedbackLine state={state} />
        </div>
      ) : null}

      <RelicTray onUse={props.onUseRelic} relics={state.relics} />
    </section>
  );
}

/**
 * The private clue card, or a short wait while the slice arrives.
 * @param props - The slice and its optional picture hint
 * @returns The paper clue card
 */
function SliceCard({
  pictureHintUrl,
  slice,
}: {
  pictureHintUrl?: string;
  slice: CrosswordCryptPrivateSlice | null;
}) {
  if (!slice) {
    return (
      <article className={styles.sliceCard}>
        <h2>Dealing your clue…</h2>
        <p>Your secret clue will appear here in a moment.</p>
      </article>
    );
  }
  return (
    <article className={styles.sliceCard}>
      <p className={styles.role}>Your role · {roleLabel(slice.role)}</p>
      <h2>{slice.title}</h2>
      {slice.content.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {slice.pictureHintTag ? (
        <div
          aria-label="Private picture hint"
          className={styles.pictureHint}
          role="img"
          style={
            pictureHintUrl
              ? { backgroundImage: `url(${pictureHintUrl})` }
              : undefined
          }
        >
          {pictureHintUrl ? null : "Picture hint unavailable"}
        </div>
      ) : null}
      <small>🤫 Say this out loud. Don't show your screen.</small>
    </article>
  );
}
