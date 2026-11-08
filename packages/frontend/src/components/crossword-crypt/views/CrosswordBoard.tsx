"use client";

import {
  type CrosswordCryptAnswerCell,
  type CrosswordCryptCellUpdate,
  type CrosswordCryptGridCell,
  crosswordWordSpans,
} from "@resync-game-framework/api";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "../CrosswordCryptExperience.module.scss";
import {
  type CrosswordDirection,
  moveInGrid,
  stepInWord,
  wordAt,
} from "../logic/crosswordNavigation";

interface CrosswordBoardProps {
  answerCells: readonly CrosswordCryptAnswerCell[];
  grid: readonly CrosswordCryptGridCell[];
  /** Letters the group has typed, by answer index. */
  letters: readonly string[];
  /** Sends typed squares to the server. Leave out for a read-only board. */
  onFill?: (cells: CrosswordCryptCellUpdate[]) => Promise<unknown>;
}

const ARROWS: Record<string, [number, number]> = {
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  ArrowUp: [-1, 0],
};

/**
 * The shared crossword. With `onFill` it is the table's editable grid: tap a
 * square or a numbered word and type; letters reach every screen. Without it
 * the board is read-only, for phones.
 * @param props - Grid shape, public letters, and the fill command
 * @returns The crossword board and its word list
 */
export function CrosswordBoard({
  answerCells,
  grid,
  letters,
  onFill,
}: CrosswordBoardProps) {
  const editable = onFill !== undefined;
  const spans = useMemo(() => crosswordWordSpans(grid), [grid]);
  const [selected, setSelectedState] = useState<number | null>(null);
  const [direction, setDirectionState] = useState<CrosswordDirection>("across");
  // Handlers run before React re-renders, so they read the latest values here.
  const selectedRef = useRef<number | null>(null);
  const directionRef = useRef<CrosswordDirection>("across");
  const [pending, setPending] = useState<Record<number, string>>({});
  const inputs = useRef(new Map<number, HTMLInputElement>());

  const columns = Math.max(1, ...grid.map((cell) => cell.column + 1));
  const rows = Math.max(1, ...grid.map((cell) => cell.row + 1));
  const positions = useMemo(
    () => new Map(grid.map((cell) => [`${cell.row}:${cell.column}`, cell])),
    [grid],
  );
  /** @param index - Square to select, or null */
  const setSelected = (index: number | null) => {
    selectedRef.current = index;
    setSelectedState(index);
  };

  /** @param next - Typing direction */
  const setDirection = (next: CrosswordDirection) => {
    directionRef.current = next;
    setDirectionState(next);
  };

  const activeWord =
    selected === null ? null : wordAt(spans, selected, direction);

  // A server letter that matches what we typed confirms it.
  useEffect(() => {
    setPending((current) => {
      const next = { ...current };
      for (const [index, letter] of Object.entries(current)) {
        if (letters[Number(index)] === letter) delete next[Number(index)];
      }
      return next;
    });
  }, [letters]);

  /**
   * @param index - Answer index
   * @returns The letter to show: hint, our unconfirmed typing, or the server's
   */
  const letterAt = (index: number): string => {
    const cell = answerCells[index];
    if (cell?.revealed) return cell.letter ?? "";
    return pending[index] ?? letters[index] ?? "";
  };

  /**
   * Moves the cursor to a square and focuses its input.
   * @param index - Answer index to select
   */
  const focusSquare = (index: number) => {
    setSelected(index);
    inputs.current.get(index)?.focus();
  };

  /**
   * Sets one square locally and on the server.
   * @param index - Answer index
   * @param letter - Letter, or "" to clear
   */
  const write = (index: number, letter: string) => {
    if (!onFill || answerCells[index]?.revealed) return;
    setPending((current) => ({ ...current, [index]: letter }));
    void onFill([{ index, letter }]).finally(() => {
      setPending((current) => {
        if (current[index] !== letter) return current;
        const next = { ...current };
        delete next[index];
        return next;
      });
    });
  };

  /**
   * A square gained focus (tap, arrow key, or typing moved the cursor).
   * Keeps the typing direction unless this square has no word that way.
   * @param index - Square that gained focus
   */
  const handleFocus = (index: number) => {
    setSelected(index);
    const word = wordAt(spans, index, directionRef.current);
    if (word) setDirection(word.direction);
  };

  /**
   * A second tap on the square that already has focus flips between across
   * and down, when the square is part of a word both ways.
   * @param index - Square that was tapped again
   */
  const handleRetap = (index: number) => {
    const other = directionRef.current === "across" ? "down" : "across";
    if (
      spans.some(
        (span) => span.direction === other && span.cells.includes(index),
      )
    ) {
      setDirection(other);
    }
  };

  /**
   * Typing a letter fills the square and moves along the word.
   * @param index - Square typed into
   * @param value - New input value
   */
  const handleInput = (index: number, value: string) => {
    const letter = value.slice(-1).toUpperCase();
    if (!/^[A-Z]$/.test(letter)) return;
    write(index, letter);
    const word = wordAt(spans, index, directionRef.current);
    if (word) focusSquare(stepInWord(word, index, 1));
  };

  /**
   * Backspace clears and steps back; arrows move around the grid.
   * @param index - Square with focus
   * @param event - Key press
   */
  const handleKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      focusSquare(moveInGrid(grid, index, arrow[0], arrow[1]));
      return;
    }
    if (event.key !== "Backspace") return;
    event.preventDefault();
    if (letterAt(index) !== "" && !answerCells[index]?.revealed) {
      write(index, "");
      return;
    }
    const word = wordAt(spans, index, directionRef.current);
    if (!word) return;
    const previous = stepInWord(word, index, -1);
    write(previous, "");
    focusSquare(previous);
  };

  return (
    <div className={styles.crossword}>
      <div
        className={styles.grid}
        data-editable={editable || undefined}
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: rows * columns }, (_, position) => {
          const row = Math.floor(position / columns);
          const column = position % columns;
          const key = `${row}:${column}`;
          const cell = positions.get(key);
          if (cell?.answerIndex === undefined) {
            return <i aria-hidden="true" key={key} />;
          }
          const index = cell.answerIndex;
          const revealed = answerCells[index]?.revealed ?? false;
          return (
            <div
              className={styles.square}
              data-active={activeWord?.cells.includes(index) || undefined}
              data-revealed={revealed || undefined}
              data-selected={selected === index || undefined}
              key={key}
            >
              {cell.number === undefined ? null : <small>{cell.number}</small>}
              {editable ? (
                <input
                  aria-label={`Square ${index + 1}`}
                  autoCapitalize="characters"
                  autoComplete="off"
                  inputMode="text"
                  onChange={(event) => handleInput(index, event.target.value)}
                  onFocus={() => handleFocus(index)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onMouseDown={(event) => {
                    // A second tap on the focused square flips direction.
                    if (document.activeElement === event.currentTarget) {
                      handleRetap(index);
                    }
                  }}
                  readOnly={revealed}
                  ref={(element) => {
                    if (element) inputs.current.set(index, element);
                    else inputs.current.delete(index);
                  }}
                  spellCheck={false}
                  value={letterAt(index)}
                />
              ) : (
                <span>{letterAt(index)}</span>
              )}
            </div>
          );
        })}
      </div>

      {editable ? (
        <div className={styles.wordList}>
          {spans.map((span) => (
            <button
              aria-pressed={
                activeWord?.number === span.number &&
                activeWord.direction === span.direction
              }
              key={`${span.number}-${span.direction}`}
              onClick={() => {
                setDirection(span.direction);
                focusSquare(span.cells[0] ?? 0);
              }}
              type="button"
            >
              {span.number} {span.direction === "across" ? "Across" : "Down"}
              <small>{span.cells.length} letters</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
