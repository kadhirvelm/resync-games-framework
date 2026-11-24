import Link from "next/link";
import { ProductNowConnection } from "@/components/productNow/ProductNowConnection";
import { GameCard } from "./GameCard";
import { gameExperiencePath } from "./gameExperiencePaths";
import type {
  GameExperienceDefinition,
  GameExperienceId,
} from "./gameExperienceTypes";
import styles from "./gameLibrary.module.scss";
import { SurpriseMeButton } from "./SurpriseMeButton";

type GameSelectorProps = {
  experiences: readonly GameExperienceDefinition[];
  resumeExperienceIds: ReadonlySet<GameExperienceId>;
};

/**
 * The home-route game library: a clear "pick one" list of every game, with
 * shortcuts back into games that have saved progress.
 * @param experiences - Registered games to show
 * @param resumeExperienceIds - Games with resumable local data
 * @returns The library page
 */
export const GameSelector = ({
  experiences,
  resumeExperienceIds,
}: GameSelectorProps) => {
  const resumable = experiences.filter((experience) =>
    resumeExperienceIds.has(experience.id),
  );

  return (
    <main className={styles.library}>
      <header className={styles.topBar}>
        <span className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark}>
            R
          </span>
          Resync <strong>Arcade</strong>
        </span>
        <ProductNowConnection placement="inline" />
      </header>

      <section className={styles.hero}>
        <h1>Pick a game</h1>
        <SurpriseMeButton
          ids={experiences.map((experience) => experience.id)}
        />
      </section>

      {resumable.length > 0 ? (
        <nav aria-label="Continue playing" className={styles.resumeRow}>
          <span className={styles.resumeLabel}>
            Continue where you left off
          </span>
          {resumable.map((experience) => (
            <Link
              className={styles.resumeChip}
              href={gameExperiencePath(experience.id)}
              key={experience.id}
            >
              <span aria-hidden="true" className={styles.resumeDot} />
              {experience.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <ul aria-label="Games" className={styles.grid}>
        {experiences.map((experience, index) => (
          <GameCard
            canResume={resumeExperienceIds.has(experience.id)}
            experience={experience}
            index={index}
            key={experience.id}
          />
        ))}
      </ul>
    </main>
  );
};
