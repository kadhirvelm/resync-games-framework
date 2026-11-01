import dynamic from "next/dynamic";
import styles from "./gameExperiences.module.scss";
import type {
  GameExperienceDefinition,
  GameExperienceId,
} from "./gameExperienceTypes";

/**
 * Loading surface shared by lazily imported game experiences.
 * @returns An accessible loading status.
 */
const ExperienceLoading = () => (
  <div aria-live="polite" className={styles.experienceLoading} role="status">
    <span className={styles.loadingMark} />
    Preparing experience…
  </div>
);

const TowerGameExperience = dynamic(
  () =>
    import("./TowerGameExperience").then(
      (module) => module.TowerGameExperience,
    ),
  { loading: ExperienceLoading },
);

const ThreeDSandboxGame = dynamic(
  () =>
    import("../babylonGame/ThreeDSandboxGame").then(
      (module) => module.ThreeDSandboxGame,
    ),
  { loading: ExperienceLoading, ssr: false },
);

/** Every game available from the home-route selector. */
export const gameExperienceCatalog = [
  {
    artwork: {
      accent: "#79c99e",
      glow: "#efd07b",
      label: "A watercolor tower rising through mist",
      monogram: "塔",
    },
    capabilities: { generatedAssets: true, localSaves: true },
    description:
      "Climb a shifting tower with a party of Coreborn in the original card-battling roguelike.",
    entry: TowerGameExperience,
    id: "towers-of-coreborn",
    launchLabel: "Enter the tower",
    name: "Towers of Coreborn",
    status: "Playable",
  },
  {
    artwork: {
      accent: "#73b7ff",
      glow: "#c687ff",
      label: "A luminous low-poly shrine in a dark vault",
      monogram: "3D",
    },
    capabilities: { generatedAssets: false, localSaves: false },
    description:
      "Explore the first Babylon.js scene and inspect the foundation for future GLB worlds.",
    entry: ThreeDSandboxGame,
    id: "three-d-sandbox",
    launchLabel: "Launch sandbox",
    name: "3D Sandbox",
    status: "Prototype",
  },
] as const satisfies readonly GameExperienceDefinition[];

/**
 * Resolves one registered game experience.
 * @param id - Stable experience identifier
 * @returns The matching catalog entry
 */
export function getGameExperience(
  id: GameExperienceId,
): GameExperienceDefinition {
  const experience = gameExperienceCatalog.find((entry) => entry.id === id);
  if (!experience) {
    throw new Error(`Unknown game experience: ${id}`);
  }
  return experience;
}
