import {
  CROSSWORD_CRYPT_MVP_DECISIONS,
  CROSSWORD_CRYPT_RUN_SETTINGS,
  type CrosswordCryptAnswerCell,
  type CrosswordCryptDifficulty,
  type CrosswordCryptGuessResult,
  type CrosswordCryptPublicState,
  type CrosswordCryptRelic,
  type CrosswordCryptRoomType,
  roomDifficulty,
} from "@resync-game-framework/api";

/** Fewest seated players that can start a run. */
export const CROSSWORD_CRYPT_MIN_PLAYERS = 2;
/** Most seated players a crypt holds. */
export const CROSSWORD_CRYPT_MAX_PLAYERS = 4;

/** Player-facing names for each puzzle room. */
export const ROOM_TYPE_LABELS: Record<CrosswordCryptRoomType, string> = {
  anagram: "Anagram Altar",
  crossword: "Split Crossword",
  riddle: "Riddle Door",
  vault: "The Vault",
};

/** Relic names and what each one does, for buttons and tooltips. */
export const RELIC_DETAILS: Record<
  CrosswordCryptRelic,
  { description: string; label: string }
> = {
  "extra-hint": {
    description: "Adds one hint token to the shared pool.",
    label: "Extra Hint",
  },
  "freeze-timer": {
    description: "Kept for later. There is no countdown in this crypt yet.",
    label: "Freeze Timer",
  },
  "reveal-letter": {
    description: "Reveals one letter of the current answer.",
    label: "Reveal One Letter",
  },
  "steady-flame": {
    description: "The next wrong answer does not burn a torch.",
    label: "Steady Flame",
  },
  "swap-slices": {
    description: "Passes every private clue to a different player.",
    label: "Swap Slices",
  },
};

/** Difficulty buttons in the order shown, hardest first for adult groups. */
export const DIFFICULTY_OPTIONS: readonly {
  description: string;
  label: string;
  value: CrosswordCryptDifficulty;
}[] = [
  {
    description: "Adults. 5×5 crosswords, 9–13 letter anagrams, 3 torches.",
    label: "Expert",
    value: "expert",
  },
  {
    description: "Families. Everyday words and short grids.",
    label: "Standard",
    value: "standard",
  },
  {
    description: "Young kids. Short words and picture hints.",
    label: "Easy",
    value: "easy",
  },
];

/**
 * What the room will play at, given everyone's choices.
 * @param difficulties - Each seated player's choice
 * @returns e.g. "Room plays at Expert · 3 torches, 1 hint"
 */
export function roomLevelSummary(
  difficulties: readonly CrosswordCryptDifficulty[],
): string {
  const level = roomDifficulty(
    difficulties.map((difficulty) => ({ difficulty })),
  );
  const label =
    DIFFICULTY_OPTIONS.find((option) => option.value === level)?.label ?? level;
  const { hints, torches } = CROSSWORD_CRYPT_RUN_SETTINGS[level];
  return `Room plays at ${label} · ${torches} torches, ${hints} ${hints === 1 ? "hint" : "hints"}`;
}

/** How a guess result should read and look. */
export interface GuessFeedback {
  text: string;
  tone: "miss" | "saved" | "success";
}

/**
 * One line that says where the party is in the run.
 * @param state - Public run state
 * @returns e.g. "Riddle Door · Room 1 of 4", "Room 2 cleared", "Escaped!"
 */
export function roomProgressLabel(state: CrosswordCryptPublicState): string {
  const roomNumber = state.roomIndex + 1;
  const chain = CROSSWORD_CRYPT_MVP_DECISIONS.chainRooms;
  switch (state.phase) {
    case "lobby":
      return "Waiting to start";
    case "vault":
      return "The Vault · final room";
    case "relic":
      return `Room ${roomNumber} cleared`;
    case "escaped":
      return "Escaped!";
    case "sealed":
      return "Sealed in the crypt";
    case "room": {
      const roomName = state.roomType
        ? ROOM_TYPE_LABELS[state.roomType]
        : "Room";
      return `${roomName} · Room ${Math.min(roomNumber, chain)} of ${chain}`;
    }
  }
}

/**
 * Whether the host can start, and what to tell the room.
 * @param playerCount - Seated players
 * @returns `canStart` and a short status line
 */
export function startStatus(playerCount: number): {
  canStart: boolean;
  message: string;
} {
  const missing = CROSSWORD_CRYPT_MIN_PLAYERS - playerCount;
  if (missing > 0) {
    return {
      canStart: false,
      message: `Waiting for ${missing} more ${missing === 1 ? "player" : "players"}`,
    };
  }
  return { canStart: true, message: `${playerCount} players ready` };
}

/**
 * Turns the last committed answer into a message.
 * @param lastGuess - Result from the public state, if any
 * @returns Text and tone, or `null` before any guess
 */
export function guessFeedback(
  lastGuess: CrosswordCryptGuessResult | null,
): GuessFeedback | null {
  if (!lastGuess) {
    return null;
  }
  if (lastGuess.correct) {
    return { text: "The answer turns the lock.", tone: "success" };
  }
  if (lastGuess.protectedBySteadyFlame) {
    return {
      text: "Wrong, but Steady Flame protected the torch.",
      tone: "saved",
    };
  }
  return { text: "Wrong answer. One torch goes dark.", tone: "miss" };
}

/**
 * @param cells - Public answer cells
 * @returns e.g. "6 letters", or "1 letter"
 */
export function answerLengthLabel(
  cells: readonly CrosswordCryptAnswerCell[],
): string {
  return `${cells.length} ${cells.length === 1 ? "letter" : "letters"}`;
}

/**
 * @param role - Role id from a private slice, such as "across holder"
 * @returns The role with a capital first letter, e.g. "Across holder"
 */
export function roleLabel(role: string): string {
  if (role === "") {
    return role;
  }
  return role[0]?.toUpperCase() + role.slice(1);
}

/**
 * @param name - Display name
 * @returns One or two initials for an avatar badge
 */
export function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials === "" ? "?" : initials;
}

/**
 * @param phase - Public phase
 * @returns Whether a puzzle is open and answers can be committed
 */
export function isPuzzlePhase(phase: CrosswordCryptPublicState["phase"]) {
  return phase === "room" || phase === "vault";
}
