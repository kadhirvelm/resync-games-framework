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
import { readBrowserResumeExperienceIds } from "./game-experiences/resumeAvailability";

/**
 * App shell for choosing and mounting one isolated game experience.
 * @returns The game selector or the currently selected experience.
 */
export const Entry = () => {
  const [selectedExperienceId, navigate] = useReducer(
    experienceNavigationReducer,
    new URLSearchParams(window.location.search).get("experience") ===
      "three-d-sandbox"
      ? "three-d-sandbox"
      : null,
  );
  const [resumeExperienceIds, setResumeExperienceIds] = useState<
    ReadonlySet<GameExperienceId>
  >(readBrowserResumeExperienceIds);

  /**
   * Returns to the selector and refreshes save availability after unmounting
   * the current experience.
   */
  const returnToSelector = () => {
    const url = new URL(window.location.href);
    for (const key of ["experience", "prototype", "asset", "kind"])
      url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
    navigate({ type: "close" });
    setResumeExperienceIds(readBrowserResumeExperienceIds());
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
