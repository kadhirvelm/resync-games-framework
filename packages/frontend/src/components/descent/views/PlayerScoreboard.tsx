/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import styles from "./playerScoreboard.module.scss";
import type { PlayerRosterReadout } from "./presentation";

/** Props for the live multiplayer standings panel. */
export interface PlayerScoreboardProps {
  /** Local player id, used to mark the viewer's row. */
  localPlayerId?: string;
  /** Current roster and deterministic score readouts. */
  players: readonly PlayerRosterReadout[];
}

/**
 * Sorts highest scores first and keeps roster order as the stable tie-break.
 * @param left - First standing
 * @param right - Second standing
 * @returns Descending score order
 */
function compareStandings(
  left: PlayerRosterReadout,
  right: PlayerRosterReadout,
): number {
  return (
    right.score.total - left.score.total || left.slotIndex - right.slotIndex
  );
}

/**
 * Converts a total into a leader-relative percentage.
 * @param total - Player's total score
 * @param leaderTotal - Highest current total
 * @returns CSS width for the player's comparison bar
 */
function relativeWidth(total: number, leaderTotal: number): string {
  if (leaderTotal <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (total / leaderTotal) * 100))}%`;
}

/**
 * Shows Age of Empires-inspired live co-op scores, ranked by total with bars
 * normalized to the leader. Category values explain movement without treating
 * Descent's shared stockpile as a per-player resource.
 * @param props - Roster scores and local player id
 * @returns Standings panel, or null when there is no multiplayer roster
 */
export function PlayerScoreboard({
  localPlayerId,
  players,
}: PlayerScoreboardProps) {
  if (players.length === 0) return null;
  const standings = [...players].sort(compareStandings);
  const leaderTotal = standings[0]?.score.total ?? 0;

  return (
    <section
      aria-label="Live player scores"
      className={styles.scoreboard}
      data-testid="descent-player-scores"
    >
      <header className={styles.header}>
        <h2 className={styles.title}>Hold standings</h2>
        <span className={styles.liveBadge}>Live</span>
      </header>
      <ol className={styles.standings}>
        {standings.map((player, index) => (
          <li
            aria-label={`${player.name}: ${player.score.total} points. Military ${player.score.military}, economy ${player.score.economy}, cultivation ${player.score.cultivation}.`}
            className={styles.player}
            data-local-player={player.id === localPlayerId}
            data-player-id={player.id}
            data-testid="player-score-row"
            key={player.id}
          >
            <div className={styles.playerLine}>
              <span className={styles.rank}>#{index + 1}</span>
              <span
                aria-hidden="true"
                className={styles.colorDot}
                style={{ backgroundColor: player.color }}
              />
              <span className={styles.name} title={player.name}>
                {player.name}
                {player.id === localPlayerId ? (
                  <span className={styles.you}> (You)</span>
                ) : null}
              </span>
              <strong className={styles.total}>
                {player.score.total.toLocaleString("en-US")}
              </strong>
            </div>
            <div aria-hidden="true" className={styles.scoreTrack}>
              <span
                className={styles.scoreFill}
                data-score-fill={player.id}
                style={{
                  backgroundColor: player.color,
                  width: relativeWidth(player.score.total, leaderTotal),
                }}
              />
            </div>
            <dl className={styles.breakdown}>
              <div>
                <dt>Military</dt>
                <dd>{player.score.military.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Economy</dt>
                <dd>{player.score.economy.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Cultivation</dt>
                <dd>{player.score.cultivation.toLocaleString("en-US")}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
      <footer className={styles.footer}>
        <span>AoE II-inspired · 20% of counted value</span>
        <details className={styles.help}>
          <summary>How scores work</summary>
          <div className={styles.helpBody}>
            <p>
              <strong>Military:</strong> 20% of the training value of enemies
              killed by your units and towers.
            </p>
            <p>
              <strong>Economy:</strong> 20% of your surviving units’ training
              costs and completed buildings’ costs.
            </p>
            <p>
              <strong>Cultivation:</strong> 20% of completed breakthrough
              essence and material costs. This research score survives unit
              deaths.
            </p>
          </div>
        </details>
      </footer>
    </section>
  );
}
