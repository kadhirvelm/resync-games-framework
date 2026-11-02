"use client";

import { useRouter } from "next/navigation";
import { GameExperienceErrorBoundary } from "./GameExperienceErrorBoundary";
import { getGameExperience } from "./gameExperienceCatalog";
import styles from "./gameExperiences.module.scss";
import type { GameExperienceId } from "./gameExperienceTypes";

/**
 * Mounts one game at its own path. Refresh stays here because the address
 * already names the game.
 * @param gameId - Game selected by the route
 * @returns The experience shell
 */
export function GameExperienceHost({ gameId }: { gameId: GameExperienceId }) {
  const router = useRouter();
  const experience = getGameExperience(gameId);
  const ExperienceEntry = experience.entry;

  /** Returns to the library without leaving a game address behind. */
  const returnToSelector = () => {
    router.push("/");
  };

  return (
    <div className={styles.experienceHost}>
      {gameId === "descent" ? null : (
        <button
          aria-label="Return to the game selector"
          className={styles.libraryButton}
          onClick={returnToSelector}
          type="button"
        >
          <span aria-hidden="true">←</span>
          All games
        </button>
      )}
      <GameExperienceErrorBoundary
        experienceName={experience.name}
        key={experience.id}
        onExit={returnToSelector}
      >
        <ExperienceEntry onExit={returnToSelector} />
      </GameExperienceErrorBoundary>
    </div>
  );
}
