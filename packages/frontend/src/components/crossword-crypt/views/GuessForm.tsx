"use client";

import styles from "../CrosswordCryptExperience.module.scss";

interface GuessFormProps {
  guess: string;
  /** Hint button; left out on the assembler's phone. */
  hint?: { onHint: () => void; tokens: number };
  letterCount: number;
  onGuess: (guess: string) => void;
  onGuessChange: (value: string) => void;
}

/**
 * Where the group commits its answer.
 * @param props - Current text, answer length, and handlers
 * @returns The answer form
 */
export function GuessForm(props: GuessFormProps) {
  return (
    <form
      className={styles.guessForm}
      onSubmit={(event) => {
        event.preventDefault();
        if (props.guess.trim()) props.onGuess(props.guess);
      }}
    >
      <input
        aria-label="Group answer"
        autoCapitalize="characters"
        autoComplete="off"
        onChange={(event) => props.onGuessChange(event.target.value)}
        placeholder={`Type the ${props.letterCount}-letter answer`}
        spellCheck={false}
        value={props.guess}
      />
      <button
        className={styles.primaryButton}
        disabled={!props.guess.trim()}
        type="submit"
      >
        Try answer
      </button>
      {props.hint ? (
        <button
          className={styles.secondaryButton}
          disabled={props.hint.tokens < 1}
          onClick={props.hint.onHint}
          title="Reveals one letter. Does not cost a torch."
          type="button"
        >
          Reveal a letter ({props.hint.tokens})
        </button>
      ) : null}
    </form>
  );
}
