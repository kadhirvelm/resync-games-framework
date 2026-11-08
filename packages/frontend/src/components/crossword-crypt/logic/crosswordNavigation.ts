import type {
  CrosswordCryptGridCell,
  CrosswordCryptWordSpan,
} from "@resync-game-framework/api";

/** Typing direction on the shared grid. */
export type CrosswordDirection = CrosswordCryptWordSpan["direction"];

/**
 * Finds the word a square belongs to, preferring the current direction.
 * @param spans - Words in the grid
 * @param index - Answer index of the selected square
 * @param direction - Direction the player is typing in
 * @returns The word, or `null` when the square is in no word
 */
export function wordAt(
  spans: readonly CrosswordCryptWordSpan[],
  index: number,
  direction: CrosswordDirection,
): CrosswordCryptWordSpan | null {
  const inDirection = spans.find(
    (span) => span.direction === direction && span.cells.includes(index),
  );
  if (inDirection) {
    return inDirection;
  }
  return spans.find((span) => span.cells.includes(index)) ?? null;
}

/**
 * The next or previous square in a word, stopping at either end.
 * @param word - Active word
 * @param index - Current square
 * @param delta - +1 to move forward, -1 to move back
 * @returns The neighbouring square, or `index` at the end of the word
 */
export function stepInWord(
  word: CrosswordCryptWordSpan,
  index: number,
  delta: 1 | -1,
): number {
  const position = word.cells.indexOf(index);
  if (position < 0) {
    return index;
  }
  return word.cells[position + delta] ?? index;
}

/**
 * Moves across the grid with the arrow keys, jumping over stone squares.
 * @param grid - Public grid cells
 * @param index - Current square
 * @param rowDelta - -1 up, +1 down, 0 to stay in the row
 * @param columnDelta - -1 left, +1 right, 0 to stay in the column
 * @returns The next open square in that direction, or `index` at the edge
 */
export function moveInGrid(
  grid: readonly CrosswordCryptGridCell[],
  index: number,
  rowDelta: number,
  columnDelta: number,
): number {
  const current = grid.find((cell) => cell.answerIndex === index);
  if (!current) {
    return index;
  }
  const rows = Math.max(...grid.map((cell) => cell.row)) + 1;
  const columns = Math.max(...grid.map((cell) => cell.column)) + 1;
  let row = current.row + rowDelta;
  let column = current.column + columnDelta;
  while (row >= 0 && row < rows && column >= 0 && column < columns) {
    const target = grid.find(
      (cell) => cell.row === row && cell.column === column,
    );
    if (target?.answerIndex !== undefined) {
      return target.answerIndex;
    }
    row += rowDelta;
    column += columnDelta;
  }
  return index;
}
