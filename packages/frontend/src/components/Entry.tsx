"use client";

import { useReducer, useState } from "react";
import { GameExperienceErrorBoundary } from "./game-experiences/GameExperienceErrorBoundary";
import { GameSelector } from "./game-experiences/GameSelector";
import {
  gameExperienceCatalog,
  getGameExperience,
} from "./game-experiences/gameExperienceCatalog";
import styles from "./game-experiences/gameExperiences.module.scss";
import {
  experienceNavigationReducer,
  type GameExperienceId,
} from "./game-experiences/gameExperienceTypes";
import { getResumeExperienceIds } from "./game-experiences/resumeAvailability";

/**
 * App shell for choosing and mounting one isolated game experience.
 * @returns The game selector or the currently selected experience.
 */
export const Entry = () => {
  const [selectedExperienceId, navigate] = useReducer(
    experienceNavigationReducer,
    null,
  );
  const [resumeExperienceIds, setResumeExperienceIds] = useState<
    ReadonlySet<GameExperienceId>
  >(() => getResumeExperienceIds(window.localStorage));

  /**
   * Returns to the selector and refreshes save availability after unmounting
   * the current experience.
   */
  const returnToSelector = () => {
    navigate({ type: "close" });
    setResumeExperienceIds(getResumeExperienceIds(window.localStorage));
  };

  if (selectedExperienceId === null) {
    return (
      <GameSelector
        experiences={gameExperienceCatalog}
        onSelect={(id) => navigate({ id, type: "open" })}
        resumeExperienceIds={resumeExperienceIds}
      />
    );
  }

  const experience = getGameExperience(selectedExperienceId);
  const ExperienceEntry = experience.entry;

  return (
    <div className={styles.experienceHost}>
      <button
        aria-label="Return to the game selector"
        className={styles.libraryButton}
        onClick={returnToSelector}
        type="button"
      >
        <span aria-hidden="true">←</span>
        All games
      </button>
      <GameExperienceErrorBoundary
        experienceName={experience.name}
        key={experience.id}
        onExit={returnToSelector}
      >
        <ExperienceEntry />
      </GameExperienceErrorBoundary>
    </div>
  );
};
