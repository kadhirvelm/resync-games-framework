import type { ComponentType } from "react";

/** Stable identifiers used by navigation and future experience-specific data. */
export type GameExperienceId = "three-d-sandbox" | "towers-of-coreborn";

/** Product maturity shown on an experience card. */
export type GameExperienceStatus = "Playable" | "Prototype";

/** Presentation metadata for the selector's artwork panel. */
export interface GameExperienceArtwork {
  accent: string;
  glow: string;
  label: string;
  monogram: string;
}

/** Capabilities which experiences may opt into independently. */
export interface GameExperienceCapabilities {
  generatedAssets: boolean;
  localSaves: boolean;
}

/** A selectable game and the lazily loaded component that runs it. */
export interface GameExperienceDefinition {
  artwork: GameExperienceArtwork;
  capabilities: GameExperienceCapabilities;
  description: string;
  entry: ComponentType;
  id: GameExperienceId;
  launchLabel: string;
  name: string;
  status: GameExperienceStatus;
}

/** The selector or one mounted experience. */
export type ExperienceNavigationState = GameExperienceId | null;

/** Navigation events emitted by selector and experience-shell controls. */
export type ExperienceNavigationAction =
  | { id: GameExperienceId; type: "open" }
  | { type: "close" };

/**
 * Moves between the selector and one game experience.
 * @param state - Currently mounted experience, or the selector state
 * @param action - Experience to open or a request to return to the selector
 * @returns The next selected experience id, or `null` for the selector
 */
export function experienceNavigationReducer(
  state: ExperienceNavigationState,
  action: ExperienceNavigationAction,
): ExperienceNavigationState {
  if (action.type === "close") {
    return null;
  }
  if (state === action.id) {
    return state;
  }
  return action.id;
}
