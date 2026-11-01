import type { CSSProperties } from "react";
import styles from "./gameExperiences.module.scss";
import type {
  GameExperienceDefinition,
  GameExperienceId,
} from "./gameExperienceTypes";

type GameSelectorProps = {
  experiences: readonly GameExperienceDefinition[];
  onSelect: (id: GameExperienceId) => void;
  resumeExperienceIds: ReadonlySet<GameExperienceId>;
};

type ArtworkStyle = CSSProperties & {
  "--experience-accent": string;
  "--experience-glow": string;
};

/**
 * Top-level library of independently mounted game experiments.
 * @param experiences - Registered games to show
 * @param onSelect - Called with the game the player opens
 * @param resumeExperienceIds - Games with resumable local data
 * @returns A responsive experience-card selector
 */
export const GameSelector = ({
  experiences,
  onSelect,
  resumeExperienceIds,
}: GameSelectorProps) => (
  <main className={styles.selector}>
    <div aria-hidden="true" className={styles.selectorGlow} />
    <header className={styles.selectorHeader}>
      <p className={styles.eyebrow}>Coreborn experiments</p>
      <h1>Choose your path</h1>
      <p>
        Each experience has its own runtime and rules. Return here whenever you
        want to step into another world.
      </p>
    </header>

    <div className={styles.experienceGrid}>
      {experiences.map((experience) => {
        const canResume = resumeExperienceIds.has(experience.id);
        const actionLabel = canResume
          ? `Continue ${experience.name}`
          : experience.launchLabel;
        const artworkStyle: ArtworkStyle = {
          "--experience-accent": experience.artwork.accent,
          "--experience-glow": experience.artwork.glow,
        };

        return (
          <article className={styles.experienceCard} key={experience.id}>
            <div
              aria-label={experience.artwork.label}
              className={styles.experienceArtwork}
              role="img"
              style={artworkStyle}
            >
              <span aria-hidden="true" className={styles.artworkOrbit} />
              <span aria-hidden="true" className={styles.artworkMonogram}>
                {experience.artwork.monogram}
              </span>
              <span aria-hidden="true" className={styles.artworkHorizon} />
            </div>

            <div className={styles.cardBody}>
              <div className={styles.cardHeading}>
                <h2>{experience.name}</h2>
                <span className={styles.status}>{experience.status}</span>
              </div>
              <p>{experience.description}</p>
              <ul aria-label={`${experience.name} capabilities`}>
                <li>
                  {experience.capabilities.localSaves
                    ? "Local saves"
                    : "Session play"}
                </li>
                <li>
                  {experience.capabilities.generatedAssets
                    ? "Generated worlds"
                    : "Curated prototype"}
                </li>
              </ul>
              <button onClick={() => onSelect(experience.id)} type="button">
                {actionLabel}
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  </main>
);
