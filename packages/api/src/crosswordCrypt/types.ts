import type { GameRoomPlayerInput, GameRoomState } from "../websockets/game";

/** Stable id used by the catalog, room framework, and socket gateway. */
export const CROSSWORD_CRYPT_GAME_ID = "crossword-crypt";

/** Product decisions fixed for the first playable family release. */
export const CROSSWORD_CRYPT_MVP_DECISIONS = {
  builtInVoice: false,
  chainRooms: 4,
  contentEditors: "repository maintainers",
  curatedContentRequiresProfanityCheck: true,
  fifthRelic: "steady-flame",
  sameRoomPlay: true,
  twoPlayerWhisper: true,
} as const;

/**
 * Difficulty selected by one seated player. A room plays at the easiest level
 * anyone picks, so a child choosing "easy" keeps the room playable for them.
 */
export type CrosswordCryptDifficulty = "easy" | "expert" | "standard";

/** Puzzle presentations included in the first playable chain. */
export type CrosswordCryptRoomType =
  | "anagram"
  | "crossword"
  | "riddle"
  | "vault";

/** Collectible co-op assists available in the MVP. */
export type CrosswordCryptRelic =
  | "extra-hint"
  | "freeze-timer"
  | "reveal-letter"
  | "steady-flame"
  | "swap-slices";

/** Public phase rendered by the shared table. */
export type CrosswordCryptPhase =
  | "escaped"
  | "lobby"
  | "relic"
  | "room"
  | "sealed"
  | "vault";

/** One answer position safe to show on the table. */
export interface CrosswordCryptAnswerCell {
  index: number;
  letter?: string;
  revealed: boolean;
}

/** Public shape for a crossword square. Letters are never included. */
export interface CrosswordCryptGridCell {
  answerIndex?: number;
  column: number;
  number?: number;
  row: number;
}

/** One across or down word in a public crossword grid. */
export interface CrosswordCryptWordSpan {
  /** Answer indexes of the word's squares, first letter first. */
  cells: number[];
  direction: "across" | "down";
  /** Clue number printed in the word's first square. */
  number: number;
}

/** One square the group typed into on the shared grid. */
export interface CrosswordCryptCellUpdate {
  /** Answer index of the square. */
  index: number;
  /** One letter A–Z, or "" to clear the square. */
  letter: string;
}

/** Result of the most recent submitted answer. */
export interface CrosswordCryptGuessResult {
  correct: boolean;
  protectedBySteadyFlame: boolean;
}

/** Compact family-hall-compatible terminal record. */
export interface CrosswordCryptRunRecord {
  relics: CrosswordCryptRelic[];
  roomCount: number;
  roomIndexReached: number;
  theme: "stone-crypt";
  torchesLeft: number;
  outcome: "escaped" | "sealed";
}

/** Table-safe authoritative state broadcast through the room framework. */
export interface CrosswordCryptPublicState {
  answerCells: CrosswordCryptAnswerCell[];
  difficulties: Record<string, CrosswordCryptDifficulty>;
  freezeTimerArmed: boolean;
  grid: CrosswordCryptGridCell[];
  /**
   * Letters the group has typed into the crossword, by answer index ("" for
   * an empty square). Empty outside crossword rooms. These are the group's
   * own guesses, so they are safe to broadcast.
   */
  gridLetters: string[];
  hintTokens: number;
  lastGuess: CrosswordCryptGuessResult | null;
  /** Torches the run started with; fewer on harder runs. */
  maxTorches: number;
  notice: string | null;
  phase: CrosswordCryptPhase;
  relicChoices: CrosswordCryptRelic[];
  relics: CrosswordCryptRelic[];
  roomIndex: number;
  roomToken: string | null;
  roomType: CrosswordCryptRoomType | null;
  runRecord: CrosswordCryptRunRecord | null;
  steadyFlameArmed: boolean;
  theme: "stone-crypt";
  torches: number;
  whisper: string | null;
}

/** Player identity used by deterministic dealing. */
export interface CrosswordCryptPlayer extends GameRoomPlayerInput {
  difficulty: CrosswordCryptDifficulty;
}

/** One private clue sent only to its assigned player's socket. */
export interface CrosswordCryptPrivateSlice {
  assignmentVersion: number;
  content: string[];
  pictureHintTag?: string;
  playerId: string;
  role: string;
  roomToken: string;
  title: string;
}

/** A deterministic room deal retained only on the server. */
export interface CrosswordCryptDeal {
  answer: string;
  /** Crossword clues kept whole so a redeal can split them for any party size. */
  clueBank?: { across: string[]; down: string[] };
  entryId: string;
  grid: CrosswordCryptGridCell[];
  privateSlices: Record<string, CrosswordCryptPrivateSlice>;
  roomToken: string;
  roomType: CrosswordCryptRoomType;
  whisper: string | null;
}

/** Empty state supplied to the generic room creator before server sync. */
export const INITIAL_CROSSWORD_CRYPT_STATE: CrosswordCryptPublicState = {
  answerCells: [],
  difficulties: {},
  freezeTimerArmed: false,
  grid: [],
  gridLetters: [],
  hintTokens: 2,
  lastGuess: null,
  maxTorches: 5,
  notice: null,
  phase: "lobby",
  relicChoices: [],
  relics: [],
  roomIndex: -1,
  roomToken: null,
  roomType: null,
  runRecord: null,
  steadyFlameArmed: false,
  theme: "stone-crypt",
  torches: 5,
  whisper: null,
};

/** Successful or failed game-specific command acknowledgement. */
export type CrosswordCryptCommandResult =
  | {
      ok: true;
      room: GameRoomState<CrosswordCryptPublicState>;
      slice?: CrosswordCryptPrivateSlice | null;
    }
  | {
      error: { code: string; message: string };
      ok: false;
      room?: GameRoomState<CrosswordCryptPublicState>;
    };

/** One command scoped to the room and current dealt puzzle. */
export interface CrosswordCryptRoomCommand {
  roomId: string;
  roomToken?: string;
}
