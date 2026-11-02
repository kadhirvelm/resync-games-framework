import { TowerGame } from "@/components/tower/TowerGame";
import type { GameExperienceEntryProps } from "./gameExperienceTypes";

/**
 * Catalog entry point for the existing two-dimensional game.
 * @param _props - Library navigation reserved for the Towers title screen
 * @returns The unchanged Towers of Coreborn game shell.
 */
export const TowerGameExperience = (_props: GameExperienceEntryProps) => (
  <TowerGame />
);
