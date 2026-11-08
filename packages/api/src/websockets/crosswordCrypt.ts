import type {
  CrosswordCryptCellUpdate,
  CrosswordCryptCommandResult,
  CrosswordCryptDifficulty,
  CrosswordCryptPrivateSlice,
  CrosswordCryptRelic,
  CrosswordCryptRoomCommand,
} from "../crosswordCrypt";
import type {
  WebsocketEvents,
  WebsocketEventsDefinition,
} from "../genericTypes/websocket";

/** Synchronizes lobby difficulty and requests the caller's current slice. */
export interface CrosswordCryptSyncPayload extends CrosswordCryptRoomCommand {
  difficulty: CrosswordCryptDifficulty;
}

/** Types or clears squares on the shared crossword grid. */
export interface CrosswordCryptFillCellsPayload
  extends CrosswordCryptRoomCommand {
  cells: CrosswordCryptCellUpdate[];
  roomToken: string;
}

/**
 * Submits a guess without ever sending an answer key. In a crossword room the
 * server checks the shared grid instead, and `guess` is ignored.
 */
export interface CrosswordCryptGuessPayload extends CrosswordCryptRoomCommand {
  guess: string;
  roomToken: string;
}

/** Selects one offered reward after clearing a room. */
export interface CrosswordCryptChooseRelicPayload
  extends CrosswordCryptRoomCommand {
  relic: CrosswordCryptRelic;
}

/** Spends one relic already held by the run. */
export interface CrosswordCryptUseRelicPayload
  extends CrosswordCryptRoomCommand {
  relic: CrosswordCryptRelic;
  roomToken: string;
}

/** Typed commands and private delivery events for Crossword Crypt. */
export interface CrosswordCryptWebsocketEvents extends WebsocketEvents {
  clientToServer: {
    crosswordCryptChooseRelic: {
      payload: CrosswordCryptChooseRelicPayload;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptFillCells: {
      payload: CrosswordCryptFillCellsPayload;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptGuess: {
      payload: CrosswordCryptGuessPayload;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptHint: {
      payload: CrosswordCryptRoomCommand;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptStart: {
      payload: CrosswordCryptRoomCommand;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptSync: {
      payload: CrosswordCryptSyncPayload;
      response: CrosswordCryptCommandResult;
    };
    crosswordCryptUseRelic: {
      payload: CrosswordCryptUseRelicPayload;
      response: CrosswordCryptCommandResult;
    };
  };
  serverToClient: {
    crosswordCryptSlice: { response: CrosswordCryptPrivateSlice | null };
  };
}

/** Shared Socket.IO event names for the client and Nest gateway. */
export const CrosswordCryptEventsDefinition: WebsocketEventsDefinition<CrosswordCryptWebsocketEvents> =
  {
    clientToServer: {
      crosswordCryptChooseRelic: "crosswordCryptChooseRelic",
      crosswordCryptFillCells: "crosswordCryptFillCells",
      crosswordCryptGuess: "crosswordCryptGuess",
      crosswordCryptHint: "crosswordCryptHint",
      crosswordCryptStart: "crosswordCryptStart",
      crosswordCryptSync: "crosswordCryptSync",
      crosswordCryptUseRelic: "crosswordCryptUseRelic",
    },
    serverToClient: { crosswordCryptSlice: "crosswordCryptSlice" },
  };
