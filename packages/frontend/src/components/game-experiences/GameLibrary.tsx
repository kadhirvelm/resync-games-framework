"use client";

import { useState } from "react";
import { GameSelector } from "./GameSelector";
import { gameExperienceCatalog } from "./gameExperienceCatalog";
import type { GameExperienceId } from "./gameExperienceTypes";
import { readBrowserResumeExperienceIds } from "./resumeAvailability";

/**
 * Home-route library. Opening a game navigates to that game's path.
 * @returns The game selector
 */
export function GameLibrary() {
  const [resumeExperienceIds] = useState<ReadonlySet<GameExperienceId>>(
    readBrowserResumeExperienceIds,
  );

  return (
    <GameSelector
      experiences={gameExperienceCatalog}
      resumeExperienceIds={resumeExperienceIds}
    />
  );
}
