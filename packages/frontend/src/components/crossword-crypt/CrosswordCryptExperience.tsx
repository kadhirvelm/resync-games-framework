"use client";

import type {
  CrosswordCryptDifficulty,
  GameRoomPlayerInput,
} from "@resync-game-framework/api";
import { useState } from "react";
import type { GameExperienceEntryProps } from "@/components/game-experiences/gameExperienceTypes";
import { useCrosswordCryptGame } from "@/services/crosswordCrypt";
import styles from "./CrosswordCryptExperience.module.scss";
import { playerForName, readStoredPlayer, storePlayer } from "./playerIdentity";
import { useCrosswordCryptAssets } from "./useCrosswordCryptAssets";
import { type CryptDisplay, RoomCode, ViewSwitcher } from "./views/CryptPieces";
import { PhoneView } from "./views/PhoneView";
import { TableView } from "./views/TableView";
import { WaitingRoom } from "./views/WaitingRoom";

/**
 * Crossword Crypt entry shell with one stable browser identity.
 * @param _props - Library navigation, handled by the host's back button
 * @returns The name prompt, or the connected game
 */
export function CrosswordCryptExperience(_props: GameExperienceEntryProps) {
  const [storedPlayer, setStoredPlayer] = useState<GameRoomPlayerInput | null>(
    () =>
      typeof window === "undefined"
        ? null
        : readStoredPlayer(window.localStorage),
  );
  const [name, setName] = useState(storedPlayer?.name ?? "");

  if (storedPlayer) {
    return <ConnectedCrypt player={storedPlayer} />;
  }

  return (
    <main className={styles.screen}>
      <section className={styles.welcome}>
        <p className={styles.eyebrow}>Co-op word escape · 2–4 players</p>
        <h1>Crossword Crypt</h1>
        <p>
          Everyone holds one piece of the puzzle. Read yours aloud, never show
          your screen, and escape together.
        </p>
        <form
          className={styles.setupForm}
          onSubmit={(event) => {
            event.preventDefault();
            const player = playerForName(name, null);
            if (!player) return;
            storePlayer(window.localStorage, player);
            setStoredPlayer(player);
          }}
        >
          <label>
            Your name
            <input
              autoComplete="nickname"
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should the crypt call you?"
              value={name}
            />
          </label>
          <button
            className={styles.primaryButton}
            disabled={name.trim() === ""}
            type="submit"
          >
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}

/**
 * Connected lobby and run UI, mounted only after an identity exists.
 * @param props - The browser's saved player
 * @returns The lobby, waiting room, or the phone or table view of a run
 */
function ConnectedCrypt({ player }: { player: GameRoomPlayerInput }) {
  const [difficulty, setDifficulty] =
    useState<CrosswordCryptDifficulty>("expert");
  const [display, setDisplay] = useState<CryptDisplay>("phone");
  const [joinCode, setJoinCode] = useState("");
  const [guess, setGuess] = useState("");
  const game = useCrosswordCryptGame(player, difficulty);
  const room = game.room;
  const state = room?.gameState;
  const assets = useCrosswordCryptAssets(state);
  const errorMessage = game.gameError ?? game.error;

  /**
   * Commits the group's answer and clears the box.
   * @param value - Typed answer
   */
  const submitGuess = (value: string) => {
    void game.guess(value);
    setGuess("");
  };

  if (!room || !state) {
    return (
      <main className={styles.screen}>
        {errorMessage ? <ErrorLine message={errorMessage} /> : null}
        <LobbyEntry
          canAct={game.status === "connected"}
          joinCode={joinCode}
          onCreate={() => void game.createRoom()}
          onJoin={() => void game.joinRoom(joinCode)}
          onJoinCode={setJoinCode}
          player={player}
          status={game.status}
        />
      </main>
    );
  }

  const inRun = state.phase !== "lobby";

  return (
    <main className={styles.screen} data-display={display}>
      <header className={styles.gameBar}>
        <span className={styles.gameTitle}>Crossword Crypt</span>
        {inRun ? <RoomCode code={room.id} /> : null}
        {inRun ? (
          <ViewSwitcher display={display} onChange={setDisplay} />
        ) : null}
      </header>

      {errorMessage ? <ErrorLine message={errorMessage} /> : null}

      {inRun ? null : (
        <WaitingRoom
          difficulty={difficulty}
          hostPlayerId={room.hostPlayerId}
          isHost={game.isHost}
          onDifficulty={setDifficulty}
          onLeave={() => void game.leaveRoom()}
          onStart={() => void game.start()}
          playerId={player.id}
          players={room.players}
          roomCode={room.id}
          state={state}
        />
      )}

      {inRun ? (
        <div className={styles.playArea}>
          {display === "table" ? (
            <TableView
              art={assets.art}
              guess={guess}
              isHost={game.isHost}
              onChooseRelic={(relic) => void game.chooseRelic(relic)}
              onFillCells={game.fillCells}
              onGuess={submitGuess}
              onGuessChange={setGuess}
              onHint={() => void game.hint()}
              onStart={() => void game.start()}
              onUseRelic={(relic) => void game.spendRelic(relic)}
              state={state}
            />
          ) : (
            <PhoneView
              guess={guess}
              isHost={game.isHost}
              onGuess={submitGuess}
              onGuessChange={setGuess}
              onOpenTable={() => setDisplay("table")}
              onStart={() => void game.start()}
              onUseRelic={(relic) => void game.spendRelic(relic)}
              pictureHintUrl={
                game.privateSlice?.pictureHintTag
                  ? assets.pictureHints[game.privateSlice.pictureHintTag]
                  : undefined
              }
              slice={game.privateSlice}
              state={state}
            />
          )}
          <PartyPanel
            hostPlayerId={room.hostPlayerId}
            onLeave={() => void game.leaveRoom()}
            playerId={player.id}
            players={room.players}
          />
        </div>
      ) : null}
    </main>
  );
}

/**
 * Create a room, or join one by its code.
 * @param props - Connection state, typed code, and actions
 * @returns The lobby entry card
 */
function LobbyEntry(props: {
  canAct: boolean;
  joinCode: string;
  onCreate: () => void;
  onJoin: () => void;
  onJoinCode: (value: string) => void;
  player: GameRoomPlayerInput;
  status: string;
}) {
  return (
    <section className={styles.welcome}>
      <p className={styles.eyebrow}>Crossword Crypt</p>
      <h1>Welcome, {props.player.name}</h1>
      {props.canAct ? null : (
        <p className={styles.muted} role="status">
          Connecting to the crypt… ({props.status})
        </p>
      )}

      <div className={styles.entryChoices}>
        <div className={styles.entryChoice}>
          <h2>Start a new crypt</h2>
          <p className={styles.muted}>
            You'll get a code to share with the family.
          </p>
          <button
            className={styles.primaryButton}
            disabled={!props.canAct}
            onClick={props.onCreate}
            type="button"
          >
            Create a room
          </button>
        </div>
        <div className={styles.entryChoice}>
          <h2>Join a crypt</h2>
          <p className={styles.muted}>
            Enter the 6-character code you were given.
          </p>
          <form
            className={styles.joinRow}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.canAct && props.joinCode.length === 6) props.onJoin();
            }}
          >
            <input
              aria-label="Room code"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              onChange={(event) =>
                props.onJoinCode(event.target.value.toUpperCase())
              }
              placeholder="ABC123"
              spellCheck={false}
              value={props.joinCode}
            />
            <button
              className={styles.secondaryButton}
              disabled={!props.canAct || props.joinCode.length !== 6}
              type="submit"
            >
              Join
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/**
 * Who is playing, beside either in-run view.
 * @param props - Players, host, the local player, and leave action
 * @returns The party list
 */
function PartyPanel(props: {
  hostPlayerId: string;
  onLeave: () => void;
  playerId: string;
  players: readonly GameRoomPlayerInput[];
}) {
  return (
    <aside className={styles.party}>
      <span className={styles.sectionLabel}>Party</span>
      <ul className={styles.partyList}>
        {props.players.map((member) => (
          <li
            data-self={member.id === props.playerId || undefined}
            key={member.id}
          >
            {member.name}
            {member.id === props.playerId ? " (you)" : ""}
            {member.id === props.hostPlayerId ? (
              <span className={styles.hostTag}>Host</span>
            ) : null}
          </li>
        ))}
      </ul>
      <button
        className={styles.textButton}
        onClick={props.onLeave}
        type="button"
      >
        Leave room
      </button>
    </aside>
  );
}

/**
 * @param props - Message from the room or game command
 * @returns An alert line
 */
function ErrorLine({ message }: { message: string }) {
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
