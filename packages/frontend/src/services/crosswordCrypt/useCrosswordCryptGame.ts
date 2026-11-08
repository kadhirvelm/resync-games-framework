"use client";

import {
  CROSSWORD_CRYPT_GAME_ID,
  type CrosswordCryptCellUpdate,
  type CrosswordCryptCommandResult,
  type CrosswordCryptDifficulty,
  CrosswordCryptEventsDefinition,
  type CrosswordCryptPrivateSlice,
  type CrosswordCryptPublicState,
  type CrosswordCryptRelic,
  type GameRoomPlayerInput,
  INITIAL_CROSSWORD_CRYPT_STATE,
} from "@resync-game-framework/api";
import { useCallback, useEffect, useState } from "react";
import { useMultiplayerRoom } from "../multiplayer";

/** Complete room, private-slice, and authoritative-command state for the UI. */
export function useCrosswordCryptGame(
  player: GameRoomPlayerInput,
  difficulty: CrosswordCryptDifficulty,
) {
  const multiplayer = useMultiplayerRoom<CrosswordCryptPublicState>({
    gameId: CROSSWORD_CRYPT_GAME_ID,
    initialState: INITIAL_CROSSWORD_CRYPT_STATE,
    maxPlayers: 4,
    player,
  });
  const [privateSlice, setPrivateSlice] =
    useState<CrosswordCryptPrivateSlice | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  useEffect(
    () =>
      multiplayer.client.onGameEvent(
        CrosswordCryptEventsDefinition.serverToClient.crosswordCryptSlice,
        setPrivateSlice,
      ),
    [multiplayer.client],
  );

  const membershipKey =
    multiplayer.room?.players.map((member) => member.id).join("|") ?? "";
  const roomId = multiplayer.room?.id;
  const roomStatus = multiplayer.status;

  const command = useCallback(
    async (
      event: string,
      payload: Record<string, unknown>,
    ): Promise<CrosswordCryptCommandResult> => {
      const result =
        await multiplayer.client.sendGameCommand<CrosswordCryptCommandResult>(
          event,
          payload,
        );
      setGameError(result.ok ? null : result.error.message);
      if (result.ok && result.slice !== undefined)
        setPrivateSlice(result.slice ?? null);
      return result;
    },
    [multiplayer.client],
  );

  useEffect(() => {
    if (!roomId || roomStatus !== "joined") return;
    void command(
      CrosswordCryptEventsDefinition.clientToServer.crosswordCryptSync,
      { difficulty, membershipKey, roomId },
    );
  }, [command, difficulty, membershipKey, roomId, roomStatus]);

  const roomCommand = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      const room = multiplayer.room;
      if (!room) return Promise.resolve(null);
      return command(event, {
        roomId: room.id,
        roomToken: room.gameState.roomToken ?? undefined,
        ...extra,
      });
    },
    [command, multiplayer.room],
  );

  return {
    ...multiplayer,
    chooseRelic: (relic: CrosswordCryptRelic) =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptChooseRelic,
        { relic },
      ),
    /** Types or clears squares on the shared crossword. */
    fillCells: (cells: CrosswordCryptCellUpdate[]) =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptFillCells,
        { cells },
      ),
    gameError,
    guess: (guess: string) =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptGuess,
        { guess },
      ),
    hint: () =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptHint,
      ),
    privateSlice,
    spendRelic: (relic: CrosswordCryptRelic) =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptUseRelic,
        { relic },
      ),
    start: () =>
      roomCommand(
        CrosswordCryptEventsDefinition.clientToServer.crosswordCryptStart,
      ),
  };
}
