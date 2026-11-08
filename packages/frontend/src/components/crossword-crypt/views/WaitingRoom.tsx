"use client";

import type {
  CrosswordCryptDifficulty,
  CrosswordCryptPublicState,
  GameRoomPlayer,
} from "@resync-game-framework/api";
import styles from "../CrosswordCryptExperience.module.scss";
import {
  CROSSWORD_CRYPT_MAX_PLAYERS,
  DIFFICULTY_OPTIONS,
  playerInitials,
  roomLevelSummary,
  startStatus,
} from "../logic/presentation";
import { RoomCode } from "./CryptPieces";

/** Placeholder rows shown until the second player arrives. */
const OPEN_SEAT_KEYS = ["open-seat-first", "open-seat-second"] as const;

interface WaitingRoomProps {
  difficulty: CrosswordCryptDifficulty;
  hostPlayerId: string;
  isHost: boolean;
  onDifficulty: (difficulty: CrosswordCryptDifficulty) => void;
  onLeave: () => void;
  onStart: () => void;
  playerId: string;
  players: readonly GameRoomPlayer[];
  roomCode: string;
  state: CrosswordCryptPublicState;
}

/**
 * Before the run: the code to share, who has joined, how to play, each
 * player's difficulty, and the host's start button.
 * @param props - Room, players, local choices, and actions
 * @returns The waiting room
 */
export function WaitingRoom(props: WaitingRoomProps) {
  const start = startStatus(props.players.length);
  const host = props.players.find((member) => member.id === props.hostPlayerId);

  return (
    <div className={styles.waitingRoom}>
      <section className={styles.panel}>
        <RoomCode code={props.roomCode} large={true} />
        <p className={styles.muted}>
          Everyone opens Crossword Crypt on their own phone and enters this
          code. 2–{CROSSWORD_CRYPT_MAX_PLAYERS} players.
        </p>

        <h2 className={styles.panelTitle}>
          Players
          <span className={styles.countBadge}>
            {props.players.length}/{CROSSWORD_CRYPT_MAX_PLAYERS}
          </span>
        </h2>
        <ul className={styles.playerList}>
          {props.players.map((member) => (
            <li
              data-self={member.id === props.playerId || undefined}
              key={member.id}
            >
              <span aria-hidden="true" className={styles.avatar}>
                {playerInitials(member.name)}
              </span>
              <span className={styles.playerName}>
                {member.name}
                {member.id === props.playerId ? " (you)" : ""}
              </span>
              {member.id === props.hostPlayerId ? (
                <span className={styles.hostTag}>Host</span>
              ) : null}
              <small>{props.state.difficulties[member.id] ?? "standard"}</small>
            </li>
          ))}
          {OPEN_SEAT_KEYS.slice(0, Math.max(0, 2 - props.players.length)).map(
            (seatKey) => (
              <li className={styles.emptySeat} key={seatKey}>
                <span aria-hidden="true" className={styles.avatar}>
                  ?
                </span>
                <span className={styles.playerName}>Waiting for a player…</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>How to play</h2>
        <ol className={styles.steps}>
          <li>
            <strong>Each phone gets a secret clue.</strong> Nobody can solve a
            room alone.
          </li>
          <li>
            <strong>Read your clue out loud.</strong> Describe it; never show
            your screen.
          </li>
          <li>
            <strong>Put one screen on the Shared table.</strong> A TV or laptop
            everyone can see. Type the group's answer there.
          </li>
          <li>
            <strong>Wrong answers burn a torch.</strong> Clear 4 rooms and the
            vault before the last one goes out.
          </li>
        </ol>

        <fieldset className={styles.difficulty}>
          <legend>My difficulty</legend>
          <div className={styles.choiceRow}>
            {DIFFICULTY_OPTIONS.map((option) => (
              <button
                aria-pressed={props.difficulty === option.value}
                key={option.value}
                onClick={() => props.onDifficulty(option.value)}
                type="button"
              >
                {option.label}
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          <p className={styles.levelSummary}>
            {roomLevelSummary(
              props.players.map(
                (member) => props.state.difficulties[member.id] ?? "standard",
              ),
            )}
            . The room uses the easiest level anyone picks.
          </p>
        </fieldset>

        <div className={styles.startArea}>
          {props.isHost ? (
            <button
              className={styles.primaryButton}
              disabled={!start.canStart}
              onClick={props.onStart}
              type="button"
            >
              Start the run
            </button>
          ) : null}
          <p className={styles.muted} role="status">
            {props.isHost || !start.canStart
              ? start.message
              : `Waiting for ${host?.name ?? "the host"} to start`}
          </p>
          <button
            className={styles.textButton}
            onClick={props.onLeave}
            type="button"
          >
            Leave room
          </button>
        </div>
      </section>
    </div>
  );
}
