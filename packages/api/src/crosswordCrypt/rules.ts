import {
  ANAGRAM_ENTRIES,
  CROSSWORD_CRYPT_WORDS,
  CROSSWORD_ENTRIES,
  containsBlockedTerm,
  RIDDLE_ENTRIES,
} from "./content";
import type {
  CrosswordCryptCellUpdate,
  CrosswordCryptDeal,
  CrosswordCryptDifficulty,
  CrosswordCryptGridCell,
  CrosswordCryptPlayer,
  CrosswordCryptPrivateSlice,
  CrosswordCryptPublicState,
  CrosswordCryptRelic,
  CrosswordCryptRoomType,
  CrosswordCryptWordSpan,
} from "./types";

/** Fixed number of puzzle rooms before the final vault. */
export const CROSSWORD_CRYPT_CHAIN_LENGTH = 4;
/** Shared life bar at the start of every run. */
export const CROSSWORD_CRYPT_STARTING_TORCHES = 5;
/** Shared unstick tokens at the start of every run. */
export const CROSSWORD_CRYPT_STARTING_HINTS = 2;

/** Lives and hints for a run at each difficulty. Expert is unforgiving. */
export const CROSSWORD_CRYPT_RUN_SETTINGS: Record<
  CrosswordCryptDifficulty,
  { hints: number; torches: number }
> = {
  easy: {
    hints: CROSSWORD_CRYPT_STARTING_HINTS,
    torches: CROSSWORD_CRYPT_STARTING_TORCHES,
  },
  expert: { hints: 1, torches: 3 },
  standard: {
    hints: CROSSWORD_CRYPT_STARTING_HINTS,
    torches: CROSSWORD_CRYPT_STARTING_TORCHES,
  },
};

const DIFFICULTY_ORDER: readonly CrosswordCryptDifficulty[] = [
  "easy",
  "standard",
  "expert",
];

/**
 * The level a room plays at: the easiest level any seated player picked.
 * @param players - Seated players and their choices
 * @returns The room's difficulty
 */
export function roomDifficulty(
  players: readonly Pick<CrosswordCryptPlayer, "difficulty">[],
): CrosswordCryptDifficulty {
  const levels = players.map((player) =>
    DIFFICULTY_ORDER.indexOf(player.difficulty),
  );
  const easiest = Math.min(...levels.filter((level) => level >= 0));
  return DIFFICULTY_ORDER[easiest] ?? "standard";
}

/**
 * Whether a piece of content can be dealt at a room's difficulty. Easy rooms
 * use easy content; standard rooms mix easy and standard; expert rooms use
 * only expert content.
 * @param content - The content's own difficulty
 * @param room - The room's difficulty
 * @returns Whether it may be dealt
 */
export function fitsDifficulty(
  content: CrosswordCryptDifficulty,
  room: CrosswordCryptDifficulty,
): boolean {
  if (room === "expert") return content === "expert";
  if (room === "easy") return content === "easy";
  return content !== "expert";
}

/**
 * Removes case, punctuation, and spacing differences from an answer.
 * @param value - Typed guess or curated key
 * @returns Uppercase letters and digits only
 */
export function normalizeCrosswordCryptAnswer(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Compares a human-entered guess with the server-held answer key.
 * @param guess - Player input
 * @param answer - Curated answer key
 * @returns Whether the normalized values match
 */
export function assembleAnswer(guess: string, answer: string): boolean {
  return (
    normalizeCrosswordCryptAnswer(guess) ===
    normalizeCrosswordCryptAnswer(answer)
  );
}

/**
 * Produces a deterministic room deal for a seed and seated players.
 * @param seed - Stable run seed
 * @param players - Players in room join order
 * @param roomIndex - Zero-based chain room index
 * @param excludedEntryIds - Entries already used in this run
 * @returns Server-only answer, public shape, whisper, and private assignments
 */
export function dealRoom(
  seed: string,
  players: readonly CrosswordCryptPlayer[],
  roomIndex: number,
  excludedEntryIds: readonly string[] = [],
): CrosswordCryptDeal {
  const difficulty = roomDifficulty(players);
  const roomTypes: CrosswordCryptRoomType[] = [
    "crossword",
    "anagram",
    "riddle",
  ];
  const typeStart = seededIndex(`${seed}:types`, roomTypes.length);
  const roomType =
    roomTypes[(typeStart + roomIndex) % roomTypes.length] ?? "riddle";
  const roomSeed = `${seed}:${roomIndex}:${roomType}`;

  if (roomType === "anagram") {
    const entry = pickEntry(
      ANAGRAM_ENTRIES.filter((candidate) =>
        fitsDifficulty(candidate.difficulty, difficulty),
      ),
      roomSeed,
      excludedEntryIds,
    );
    const parts = entry.splits[3];
    const pictureHintTag = CROSSWORD_CRYPT_WORDS.find(
      (word) => word.answer === entry.answer && word.difficulty === "easy",
    )?.pictureHintTag;
    return buildDeal(
      roomSeed,
      players,
      roomIndex,
      roomType,
      entry.id,
      entry.answer,
      [
        {
          content: [`Tiles: ${parts[0] ?? ""}`],
          role: "letter holder",
          title: "Scattered letters",
        },
        {
          content: [
            `Tiles: ${parts[1] ?? ""}`,
            `The password belongs to the ${entry.pack} pack.`,
          ],
          pictureHintTag,
          role: "clue holder",
          title: "More letters",
        },
        {
          content: [
            `Tiles: ${parts[2] ?? ""}`,
            `Rearrange all ${entry.answer.length} spoken letters.`,
          ],
          role: "rule holder",
          title: "Final letters",
        },
      ],
    );
  }

  if (roomType === "riddle") {
    const entry = pickEntry(
      RIDDLE_ENTRIES.filter((candidate) =>
        fitsDifficulty(candidate.difficulty, difficulty),
      ),
      roomSeed,
      excludedEntryIds,
    );
    return buildDeal(
      roomSeed,
      players,
      roomIndex,
      roomType,
      entry.id,
      entry.answer,
      entry.lines.map((line, index) => ({
        content: [line],
        role:
          ["clue holder", "letter holder", "rule holder"][index] ??
          "clue holder",
        title: `Riddle line ${index + 1}`,
      })),
    );
  }

  const entry = pickEntry(
    CROSSWORD_ENTRIES.filter((candidate) =>
      fitsDifficulty(candidate.difficulty, difficulty),
    ),
    roomSeed,
    excludedEntryIds,
  );
  const grid = buildGrid(entry.grid);
  const answer = entry.grid.join("").replaceAll("#", "");
  const clueBank = { across: [...entry.across], down: [...entry.down] };
  const deal = buildDeal(
    roomSeed,
    players,
    roomIndex,
    roomType,
    entry.id,
    answer,
    crosswordSliceTemplates(clueBank, grid, players.length),
    grid,
  );
  return { ...deal, clueBank };
}

/**
 * Deals the final vault from a riddle plus a shared scrambled password.
 * @param seed - Stable run seed
 * @param players - All seated players
 * @returns A vault deal using every seat at once
 */
export function dealVault(
  seed: string,
  players: readonly CrosswordCryptPlayer[],
): CrosswordCryptDeal {
  const difficulty = roomDifficulty(players);
  const candidates = CROSSWORD_CRYPT_WORDS.filter((entry) =>
    fitsDifficulty(entry.difficulty, difficulty),
  );
  const entry =
    candidates[seededIndex(`${seed}:vault`, candidates.length)] ??
    candidates[0];
  if (!entry || containsBlockedTerm(entry.answer)) {
    throw new Error("The curated vault dictionary is unavailable.");
  }
  const scrambled = deterministicShuffle(
    [...entry.answer],
    `${seed}:vault:letters`,
  ).join(" ");
  const core: SliceTemplate[] = [
    {
      content: [entry.slices.clue],
      pictureHintTag: entry.pictureHintTag,
      role: "clue holder",
      title: "Vault clue",
    },
    {
      content: [entry.slices.letters],
      role: "letter watcher",
      title: "Vault length",
    },
    { content: [entry.slices.rule], role: "rule holder", title: "Vault rule" },
  ];
  if (players.length === 4) {
    core.push({
      content: ["Listen to every keeper, then commit the shared letters."],
      role: "assembler",
      title: "Vault assembler",
    });
  }
  const deal = buildDeal(
    `${seed}:vault`,
    players,
    CROSSWORD_CRYPT_CHAIN_LENGTH,
    "vault",
    entry.id,
    entry.answer,
    core,
  );
  return { ...deal, whisper: `Shared anagram: ${scrambled}` };
}

/**
 * Reassigns an existing room's private slices without changing its key.
 * @param deal - Current server-only deal
 * @param players - New seated player order
 * @param assignmentVersion - Monotonic redistribution marker
 * @returns Same puzzle with freshly rotated private ownership
 */
export function redistribute(
  deal: CrosswordCryptDeal,
  players: readonly CrosswordCryptPlayer[],
  assignmentVersion: number,
): CrosswordCryptDeal {
  if (deal.roomType === "crossword" && deal.clueBank) {
    return redealCrossword(deal, players, assignmentVersion);
  }
  const templates: SliceTemplate[] = Object.values(deal.privateSlices).map(
    (slice) => ({
      content: slice.content,
      pictureHintTag: slice.pictureHintTag,
      role: slice.role,
      title: slice.title,
    }),
  );
  if (deal.whisper && players.length > 2 && templates.length < 3) {
    templates.push({
      content: [deal.whisper],
      role: "rule holder",
      title: "Recovered whisper",
    });
  }
  const assignment = assignSlices(
    templates,
    players,
    assignmentVersion,
    seededIndex(deal.roomToken, Math.max(players.length, 1)) +
      assignmentVersion,
  );
  const privateSlices = Object.fromEntries(
    Object.entries(assignment.privateSlices).map(([playerId, slice]) => [
      playerId,
      { ...slice, roomToken: deal.roomToken },
    ]),
  );
  const whisper =
    players.length === 2
      ? (deal.whisper ?? templates[2]?.content.join(" ") ?? null)
      : null;
  return { ...deal, privateSlices, whisper };
}

/**
 * Applies one guess to public run state without exposing the answer.
 * @param state - Current table state
 * @param correct - Server-side answer comparison result
 * @returns Next table state
 */
export function applyGuess(
  state: CrosswordCryptPublicState,
  correct: boolean,
): CrosswordCryptPublicState {
  if (correct) {
    return {
      ...state,
      lastGuess: { correct: true, protectedBySteadyFlame: false },
    };
  }
  if (state.steadyFlameArmed) {
    return {
      ...state,
      lastGuess: { correct: false, protectedBySteadyFlame: true },
      steadyFlameArmed: false,
    };
  }
  return {
    ...state,
    lastGuess: { correct: false, protectedBySteadyFlame: false },
    torches: Math.max(0, state.torches - 1),
  };
}

/**
 * Reveals the next hidden answer letter for one shared hint token.
 * @param state - Current table state
 * @param answer - Server-held normalized answer
 * @returns State with one new letter, or unchanged when no hint can be spent
 */
export function spendHint(
  state: CrosswordCryptPublicState,
  answer: string,
): CrosswordCryptPublicState {
  if (state.hintTokens < 1) return state;
  const letters = [...normalizeCrosswordCryptAnswer(answer)];
  const unrevealed = state.answerCells.filter((cell) => !cell.revealed);
  const target =
    unrevealed.find(
      (cell) => (state.gridLetters ?? [])[cell.index] !== letters[cell.index],
    ) ?? unrevealed[0];
  const index = target ? state.answerCells.indexOf(target) : -1;
  if (index < 0) return state;
  return {
    ...state,
    answerCells: state.answerCells.map((cell, cellIndex) =>
      cellIndex === index
        ? { ...cell, letter: letters[index], revealed: true }
        : cell,
    ),
    hintTokens: state.hintTokens - 1,
  };
}

/**
 * Applies a stored relic's immediate pure effect.
 * @param state - Current public run state
 * @param relic - Relic being spent
 * @param answer - Server-held answer used by reveal effects
 * @returns Updated state with the relic removed
 */
export function applyRelic(
  state: CrosswordCryptPublicState,
  relic: CrosswordCryptRelic,
  answer: string,
): CrosswordCryptPublicState {
  const relicIndex = state.relics.indexOf(relic);
  if (relicIndex < 0) return state;
  const relics = state.relics.filter((_, index) => index !== relicIndex);
  if (relic === "extra-hint")
    return { ...state, hintTokens: state.hintTokens + 1, relics };
  if (relic === "reveal-letter") {
    return {
      ...spendHint({ ...state, hintTokens: state.hintTokens + 1 }, answer),
      relics,
    };
  }
  if (relic === "steady-flame")
    return { ...state, relics, steadyFlameArmed: true };
  if (relic === "freeze-timer")
    return { ...state, freezeTimerArmed: true, relics };
  return { ...state, relics };
}

/**
 * Draws two deterministic reward choices from all five relics.
 * @param seed - Run seed
 * @param roomIndex - Cleared room index
 * @returns Two distinct relic ids
 */
export function drawRelicChoices(
  seed: string,
  roomIndex: number,
): CrosswordCryptRelic[] {
  const relics: CrosswordCryptRelic[] = [
    "extra-hint",
    "freeze-timer",
    "reveal-letter",
    "swap-slices",
    "steady-flame",
  ];
  return deterministicShuffle(relics, `${seed}:relic:${roomIndex}`).slice(0, 2);
}

/**
 * Builds hidden answer cells for a newly dealt key.
 * @param answer - Server-held answer
 * @returns One unrevealed cell per normalized character
 */
export function hiddenAnswerCells(answer: string) {
  return [...normalizeCrosswordCryptAnswer(answer)].map((_, index) => ({
    index,
    revealed: false,
  }));
}

/**
 * Lists every across and down word in a public grid, numbered as printed.
 * Works from the public shape alone, so the table and phones can use it.
 * @param grid - Public grid cells
 * @returns Words in clue order: by number, across before down
 */
export function crosswordWordSpans(
  grid: readonly CrosswordCryptGridCell[],
): CrosswordCryptWordSpan[] {
  const byPosition = new Map(
    grid.map((cell) => [`${cell.row}:${cell.column}`, cell]),
  );
  const at = (row: number, column: number) =>
    byPosition.get(`${row}:${column}`);
  const spans: CrosswordCryptWordSpan[] = [];
  for (const cell of grid) {
    if (cell.number === undefined) continue;
    for (const direction of ["across", "down"] as const) {
      const step = direction === "across" ? [0, 1] : [1, 0];
      const before = at(
        cell.row - (step[0] ?? 0),
        cell.column - (step[1] ?? 0),
      );
      if (before) continue;
      const cells: number[] = [];
      let cursor: CrosswordCryptGridCell | undefined = cell;
      while (cursor) {
        cells.push(cursor.answerIndex ?? 0);
        cursor = at(
          cursor.row + (step[0] ?? 0),
          cursor.column + (step[1] ?? 0),
        );
      }
      if (cells.length > 1) {
        spans.push({ cells, direction, number: cell.number });
      }
    }
  }
  return spans.sort(
    (left, right) =>
      left.number - right.number ||
      (left.direction === "across" ? -1 : 1) -
        (right.direction === "across" ? -1 : 1),
  );
}

/**
 * Applies typed squares to the shared crossword. Out-of-range squares,
 * non-letters, and squares already revealed by a hint are ignored.
 * @param state - Current public state
 * @param updates - Squares the group typed or cleared
 * @returns Next state, or the same object when nothing changed
 */
export function applyCellUpdates(
  state: CrosswordCryptPublicState,
  updates: readonly CrosswordCryptCellUpdate[],
): CrosswordCryptPublicState {
  const letters = [...state.gridLetters];
  let changed = false;
  for (const update of updates) {
    const index = update?.index;
    const letter =
      typeof update?.letter === "string" ? update.letter.toUpperCase() : null;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= letters.length ||
      letter === null ||
      !/^[A-Z]?$/.test(letter) ||
      state.answerCells[index]?.revealed
    ) {
      continue;
    }
    if (letters[index] !== letter) {
      letters[index] = letter;
      changed = true;
    }
  }
  return changed ? { ...state, gridLetters: letters } : state;
}

/**
 * Reads the shared crossword as one answer, with hint letters filled in.
 * @param state - Current public state
 * @returns The grid's letters in answer order, or `null` while a square is empty
 */
export function crosswordGridGuess(
  state: CrosswordCryptPublicState,
): string | null {
  const letters = state.answerCells.map((cell) =>
    cell.revealed ? (cell.letter ?? "") : (state.gridLetters[cell.index] ?? ""),
  );
  return letters.every((letter) => letter !== "") ? letters.join("") : null;
}

/**
 * Empty typing squares for a newly dealt room.
 * @param deal - The dealt room
 * @returns One "" per square for a crossword, otherwise an empty list
 */
export function emptyGridLetters(deal: CrosswordCryptDeal): string[] {
  return deal.roomType === "crossword" ? deal.grid.map(() => "") : [];
}

/**
 * Splits a crossword's numbered clues into private slices for the party.
 * Two players hold across and down; the last down clue becomes the table
 * whisper so the shared screen holds a piece too. Three or four players get
 * an even mix, one clue each when there are as many clues as players.
 * @param clueBank - Across and down clues in clue-number order
 * @param grid - Public grid, used for numbers and word lengths
 * @param playerCount - Seated players
 * @returns Slice templates; with two players the third is the whisper
 */
function crosswordSliceTemplates(
  clueBank: { across: readonly string[]; down: readonly string[] },
  grid: readonly CrosswordCryptGridCell[],
  playerCount: number,
): SliceTemplate[] {
  const spans = crosswordWordSpans(grid);
  const label = (direction: "across" | "down", clues: readonly string[]) =>
    spans
      .filter((span) => span.direction === direction)
      .map((span, index) => {
        const heading = direction === "across" ? "Across" : "Down";
        return `${span.number} ${heading} (${span.cells.length}): ${clues[index] ?? ""}`;
      });
  const across = label("across", clueBank.across);
  const down = label("down", clueBank.down);

  if (playerCount <= 2) {
    const whisper = down.length > 1 ? down.slice(-1) : across.slice(-1);
    const keptDown = down.length > 1 ? down.slice(0, -1) : down;
    const keptAcross = down.length > 1 ? across : across.slice(0, -1);
    return [
      { content: keptAcross, role: "across holder", title: "Across clues" },
      { content: keptDown, role: "down holder", title: "Down clues" },
      { content: whisper, role: "whisper", title: "Whisper" },
    ];
  }

  const interleaved: string[] = [];
  for (
    let index = 0;
    index < Math.max(across.length, down.length);
    index += 1
  ) {
    const acrossClue = across[index];
    const downClue = down[index];
    if (acrossClue) interleaved.push(acrossClue);
    if (downClue) interleaved.push(downClue);
  }
  return Array.from({ length: playerCount }, (_, seat) => ({
    content: interleaved.filter((_, index) => index % playerCount === seat),
    role: "clue keeper",
    title: "Your clues",
  })).filter((template) => template.content.length > 0);
}

/**
 * Re-splits a crossword's clues for a new party size and seat rotation, so
 * no clue is lost when players join or leave.
 * @param deal - Current crossword deal with its clue bank
 * @param players - New seated player order
 * @param assignmentVersion - Monotonic redistribution marker
 * @returns The same puzzle with new private slices and whisper
 */
function redealCrossword(
  deal: CrosswordCryptDeal,
  players: readonly CrosswordCryptPlayer[],
  assignmentVersion: number,
): CrosswordCryptDeal {
  const templates = crosswordSliceTemplates(
    deal.clueBank ?? { across: [], down: [] },
    deal.grid,
    players.length,
  );
  const assignment = assignSlices(
    templates,
    players,
    assignmentVersion,
    seededIndex(deal.roomToken, Math.max(players.length, 1)) +
      assignmentVersion,
  );
  const privateSlices = Object.fromEntries(
    Object.entries(assignment.privateSlices).map(([playerId, slice]) => [
      playerId,
      { ...slice, roomToken: deal.roomToken },
    ]),
  );
  const whisper =
    players.length === 2 ? (templates[2]?.content.join(" ") ?? null) : null;
  return { ...deal, privateSlices, whisper };
}

interface SliceTemplate {
  content: readonly string[];
  pictureHintTag?: string;
  role: string;
  title: string;
}

/** Builds a server-only deal and rotates its core roles by room index. */
function buildDeal(
  roomSeed: string,
  players: readonly CrosswordCryptPlayer[],
  roomIndex: number,
  roomType: CrosswordCryptRoomType,
  entryId: string,
  answer: string,
  templates: readonly SliceTemplate[],
  grid: CrosswordCryptGridCell[] = [],
): CrosswordCryptDeal {
  const roomToken = `${hashString(roomSeed).toString(36)}-${roomIndex}`;
  const assignment = assignSlices(templates, players, 1, roomIndex);
  const privateSlices = Object.fromEntries(
    Object.entries(assignment.privateSlices).map(([playerId, slice]) => [
      playerId,
      { ...slice, roomToken },
    ]),
  );
  return {
    answer,
    entryId,
    grid,
    privateSlices,
    roomToken,
    roomType,
    whisper:
      players.length === 2 ? (templates[2]?.content.join(" ") ?? null) : null,
  };
}

/** Assigns core templates to rotated seats without copying another role. */
function assignSlices(
  templates: readonly SliceTemplate[],
  players: readonly CrosswordCryptPlayer[],
  assignmentVersion: number,
  rotation: number,
): { privateSlices: Record<string, CrosswordCryptPrivateSlice> } {
  const privateCount =
    players.length === 4 ? 4 : Math.min(players.length, templates.length);
  const expanded = [...templates];
  if (players.length === 4 && expanded.length < 4) {
    expanded.push({
      content: ["Listen, assemble, and commit the group's answer."],
      role: "assembler",
      title: "Assembler",
    });
  }
  const privateSlices: Record<string, CrosswordCryptPrivateSlice> = {};
  for (let seat = 0; seat < privateCount; seat += 1) {
    const player = players[(seat + rotation) % players.length];
    const template = expanded[seat];
    if (!player || !template) continue;
    privateSlices[player.id] = {
      assignmentVersion,
      content: [...template.content],
      pictureHintTag: template.pictureHintTag,
      playerId: player.id,
      role: template.role,
      roomToken: "",
      title: template.title,
    };
  }
  return { privateSlices };
}

/**
 * Converts authoring rows into a letter-free public numbered shape. A square
 * gets a number only when it starts an across or down word of two or more
 * letters, as in a printed crossword.
 * @param rows - Grid rows, `#` for a stone square
 * @returns Open squares in reading order
 */
function buildGrid(rows: readonly string[]): CrosswordCryptGridCell[] {
  const cells: CrosswordCryptGridCell[] = [];
  const open = (rowIndex: number, column: number) => {
    const character = rows[rowIndex]?.[column];
    return character !== undefined && character !== "#";
  };
  let answerIndex = 0;
  let number = 1;
  rows.forEach((row, rowIndex) => {
    [...row].forEach((character, column) => {
      if (character === "#") return;
      const startsAcross =
        !open(rowIndex, column - 1) && open(rowIndex, column + 1);
      const startsDown =
        !open(rowIndex - 1, column) && open(rowIndex + 1, column);
      cells.push({
        answerIndex,
        column,
        number: startsAcross || startsDown ? number++ : undefined,
        row: rowIndex,
      });
      answerIndex += 1;
    });
  });
  return cells;
}

/** Selects a deterministic unused entry, falling back after exhaustion. */
function pickEntry<T extends { id: string }>(
  entries: readonly T[],
  seed: string,
  excluded: readonly string[],
): T {
  const available = entries.filter((entry) => !excluded.includes(entry.id));
  const pool = available.length > 0 ? available : entries;
  const entry = pool[seededIndex(seed, pool.length)];
  if (!entry)
    throw new Error("No curated Crossword Crypt entry fits this room.");
  return entry;
}

/** Maps a stable seed into a bounded array index. */
function seededIndex(seed: string, length: number): number {
  if (length < 1) return 0;
  return hashString(seed) % length;
}

/** Returns a stable seed-ranked copy of a list. */
function deterministicShuffle<T>(values: readonly T[], seed: string): T[] {
  return values
    .map((value, index) => ({ rank: hashString(`${seed}:${index}`), value }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ value }) => value);
}

/** Hashes text into an unsigned deterministic 32-bit value. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
