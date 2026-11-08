import Link from "next/link";
import type { CSSProperties } from "react";
import { gameExperiencePath } from "./gameExperiencePaths";
import type {
  GameExperienceDefinition,
  GameExperiencePlayers,
} from "./gameExperienceTypes";
import styles from "./gameLibrary.module.scss";

type GameCardProps = {
  /** Whether this browser has saved progress in the game. */
  canResume: boolean;
  experience: GameExperienceDefinition;
  /** Position in the list, used for the card number and entrance stagger. */
  index: number;
};

type CardStyle = CSSProperties & {
  "--accent": string;
  "--glow": string;
  "--i": number;
};

/**
 * One game in the library. The whole card is a single link to the game.
 * @param props - The game, its list position, and whether it has a save
 * @returns A list item holding the game's card
 */
export function GameCard({ canResume, experience, index }: GameCardProps) {
  const cardStyle: CardStyle = {
    "--accent": experience.artwork.accent,
    "--glow": experience.artwork.glow,
    "--i": index,
  };
  const actionLabel = canResume ? "Continue" : experience.launchLabel;

  return (
    <li className={styles.card} style={cardStyle}>
      <div
        aria-label={experience.artwork.label}
        className={styles.art}
        role="img"
      >
        <span aria-hidden="true" className={styles.artStripes} />
        <span aria-hidden="true" className={styles.number}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span aria-hidden="true" className={styles.tile}>
          {experience.artwork.monogram}
        </span>
        <span aria-hidden="true" className={styles.sparkleA} />
        <span aria-hidden="true" className={styles.sparkleB} />
        <span aria-hidden="true" className={styles.sparkleC} />
        {canResume ? (
          <span className={styles.savedBadge}>Saved game</span>
        ) : null}
      </div>

      <div className={styles.body}>
        <div className={styles.meta}>
          <span className={styles.chip}>
            <PlayersIcon players={experience.players} />
            {experience.players}
          </span>
          <span className={styles.chip}>{experience.genre}</span>
          <span className={styles.status} data-status={experience.status}>
            {experience.status}
          </span>
        </div>
        <h2>
          <Link
            className={styles.cardLink}
            href={gameExperiencePath(experience.id)}
          >
            {experience.name}
          </Link>
        </h2>
        <p>{experience.description}</p>
        <span aria-hidden="true" className={styles.cta}>
          {actionLabel}
          <span className={styles.ctaArrow}>→</span>
        </span>
      </div>
    </li>
  );
}

/**
 * Small person icon: one figure for solo games, two for multiplayer.
 * @param players - How the game is played
 * @returns A decorative inline SVG
 */
function PlayersIcon({ players }: { players: GameExperiencePlayers }) {
  if (players === "Solo") {
    return (
      <svg aria-hidden="true" height="12" viewBox="0 0 16 16" width="12">
        <circle cx="8" cy="5" fill="currentColor" r="3" />
        <path d="M2.5 15a5.5 5.5 0 0 1 11 0z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 20 16" width="15">
      <circle cx="6.5" cy="5" fill="currentColor" r="2.6" />
      <circle cx="13.5" cy="5" fill="currentColor" r="2.6" />
      <path d="M1.5 15a5 5 0 0 1 10 0z" fill="currentColor" />
      <path d="M8.5 15a5 5 0 0 1 10 0z" fill="currentColor" />
    </svg>
  );
}
