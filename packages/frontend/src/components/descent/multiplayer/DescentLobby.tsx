/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  DESCENT_MAX_PLAYERS,
  DESCENT_PLAYER_COLOR_NAMES,
  type DescentRoomState,
  descentPlayerColor,
  type GameRoomPlayerInput,
} from "@resync-game-framework/api";
import { useState } from "react";
import type {
  MultiplayerRoomState,
  MultiplayerRoomStatus,
} from "@/services/multiplayer";
import styles from "./DescentLobby.module.scss";

/** Props for the Descent co-op room creation, join, and waiting lobby screen. */
export interface DescentLobbyProps {
  error: string | null;
  isHost: boolean;
  onBack: () => void;
  onCreateRoom: () => Promise<void>;
  onJoinRoom: (roomCode: string) => Promise<void>;
  onLeaveRoom: () => Promise<boolean>;
  onPlayerNameChange: (name: string) => void;
  onStartMatch: () => Promise<void>;
  player: GameRoomPlayerInput;
  room: MultiplayerRoomState<DescentRoomState> | null;
  status: MultiplayerRoomStatus;
}

/**
 * Co-op multiplayer lobby for Descent: host a room, join by room code,
 * preview the 1–4 player Ashen Crucible roster with assigned ring colors,
 * and launch the match.
 * @param props - Room state, player identity, and lobby callbacks
 * @returns The co-op lobby screen
 */
export function DescentLobby({
  error,
  isHost,
  onBack,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onPlayerNameChange,
  onStartMatch,
  player,
  room,
  status,
}: DescentLobbyProps) {
  const [nameDraft, setNameDraft] = useState(player.name);
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const commitName = () => {
    const trimmed = nameDraft.trim() || "Commander";
    setNameDraft(trimmed);
    onPlayerNameChange(trimmed);
  };

  const handleHost = async () => {
    commitName();
    setBusy(true);
    try {
      await onCreateRoom();
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = roomCode.trim().toUpperCase();
    if (!cleaned) return;
    commitName();
    setBusy(true);
    try {
      await onJoinRoom(cleaned);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard may be unavailable in insecure contexts.
    }
  };

  const handleStart = async () => {
    setBusy(true);
    try {
      await onStartMatch();
    } finally {
      setBusy(false);
    }
  };

  const slots = Array.from({ length: DESCENT_MAX_PLAYERS }, (_, index) => ({
    color: descentPlayerColor(index),
    colorName: DESCENT_PLAYER_COLOR_NAMES[index] ?? `Player ${index + 1}`,
    player: room?.players[index] ?? null,
    slotIndex: index,
  }));

  return (
    <main className={styles.lobbyScreen} data-testid="descent-coop-lobby">
      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>
              Co-op Multiplayer · Up to 4 Players
            </p>
            <h1 className={styles.title}>Descent — Ashen Crucible</h1>
          </div>
          <span className={styles.statusPill} data-status={status}>
            {status === "reconnecting" ? "Reconnecting…" : status}
          </span>
        </header>

        <p className={styles.subtitle}>
          Allied Holds share the western ridge against the Horde. Player units
          cannot harm each other and wear distinct color rings on the
          battlefield.
        </p>

        {error === null ? null : (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}

        {room === null ? (
          <div className={styles.entryGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="descent-player-name">
                Commander name
              </label>
              <input
                className={styles.input}
                id="descent-player-name"
                maxLength={32}
                onBlur={commitName}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Commander"
                type="text"
                value={nameDraft}
              />
            </div>

            <div className={styles.actionsRow}>
              <section className={styles.card}>
                <h2>Host a room</h2>
                <p>
                  Create a 4-player Ashen Crucible room and share the 6-letter
                  code with your allies.
                </p>
                <button
                  className={styles.primaryButton}
                  disabled={busy || status === "connecting"}
                  onClick={() => void handleHost()}
                  type="button"
                >
                  {busy ? "Creating…" : "Host Co-op Room"}
                </button>
              </section>

              <form
                className={styles.card}
                onSubmit={(event) => void handleJoin(event)}
              >
                <h2>Join a room</h2>
                <p>Enter a host&apos;s room code to join their co-op squad.</p>
                <div className={styles.joinRow}>
                  <input
                    aria-label="Room code"
                    className={styles.codeInput}
                    maxLength={8}
                    onChange={(event) =>
                      setRoomCode(event.target.value.toUpperCase())
                    }
                    placeholder="ABC234"
                    type="text"
                    value={roomCode}
                  />
                  <button
                    className={styles.secondaryButton}
                    disabled={
                      busy ||
                      status === "connecting" ||
                      roomCode.trim().length < 4
                    }
                    type="submit"
                  >
                    Join Room
                  </button>
                </div>
              </form>
            </div>

            <div className={styles.footerRow}>
              <button
                className={styles.linkButton}
                onClick={onBack}
                type="button"
              >
                ← Back to Descent title
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.waitingRoom}>
            <div className={styles.roomBanner}>
              <div>
                <span className={styles.label}>Room Code</span>
                <div
                  className={styles.roomCode}
                  data-testid="descent-room-code"
                >
                  {room.id}
                </div>
              </div>
              <div className={styles.roomMeta}>
                <span className={styles.mapTag}>
                  Map: Ashen Crucible (288×216 Co-op)
                </span>
                <button
                  className={styles.secondaryButton}
                  onClick={() => void handleCopy()}
                  type="button"
                >
                  {copied ? "Copied!" : "Copy Code"}
                </button>
              </div>
            </div>

            <div className={styles.rosterSection}>
              <div className={styles.rosterHeader}>
                <h2>
                  Allied Commanders ({room.players.length}/{DESCENT_MAX_PLAYERS}
                  )
                </h2>
                <span className={styles.rosterHint}>
                  Each commander spawns with a Camp, Captain Warden, and 3
                  Villagers.
                </span>
              </div>

              <ul className={styles.slotList}>
                {slots.map((slot) => (
                  <li
                    className={
                      slot.player ? styles.slotFilled : styles.slotEmpty
                    }
                    key={slot.slotIndex}
                  >
                    <span
                      aria-hidden="true"
                      className={styles.colorRing}
                      style={{
                        borderColor: slot.color,
                        boxShadow: `0 0 10px ${slot.color}66`,
                      }}
                    />
                    <div className={styles.slotText}>
                      <strong>
                        {slot.player ? slot.player.name : "Open slot"}
                      </strong>
                      <span className={styles.slotSub}>
                        {slot.colorName} Ring
                        {slot.player?.id === room.hostPlayerId ? " · Host" : ""}
                        {slot.player?.id === player.id ? " · You" : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.footerRow}>
              <button
                className={styles.linkButton}
                onClick={() => void onLeaveRoom()}
                type="button"
              >
                Leave Room
              </button>
              {isHost ? (
                <button
                  className={styles.primaryButton}
                  disabled={busy}
                  onClick={() => void handleStart()}
                  type="button"
                >
                  {busy ? "Launching…" : "Start Co-op Match"}
                </button>
              ) : (
                <span className={styles.waitingNote}>
                  Waiting for the host to start the match…
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
