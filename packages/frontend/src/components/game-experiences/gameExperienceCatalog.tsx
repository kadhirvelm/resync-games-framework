import dynamic from "next/dynamic";
import styles from "./gameExperiences.module.scss";
import type {
  GameExperienceDefinition,
  GameExperienceEntryProps,
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

const ThreeDSandboxRuntime = dynamic(
  () =>
    import("../babylonGame/ThreeDSandboxGame").then(
      (module) => module.ThreeDSandboxGame,
    ),
  { loading: ExperienceLoading, ssr: false },
);

/**
 * Adapts the standalone 3D sandbox to the common library entry contract.
 * @param _props - Library navigation handled by the host overlay for now
 * @returns The mounted 3D sandbox
 */
const ThreeDSandboxGame = (_props: GameExperienceEntryProps) => (
  <ThreeDSandboxRuntime />
);

const DescentGameExperience = dynamic(
  () =>
    import("./DescentGameExperience").then(
      (module) => module.DescentGameExperience,
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
    capabilities: { generatedAssets: true, localSaves: true },
    description:
      "Build a 3D world in the Blueprint Workshop, explore its arena, and awaken its aether beacons.",
    entry: ThreeDSandboxGame,
    id: "three-d-sandbox",
    launchLabel: "Launch sandbox",
    name: "3D Sandbox",
    status: "Prototype",
  },
  {
    artwork: {
      accent: "#e0603a",
      glow: "#f2b544",
      label: "An ember-lit shaft descending into dark rock",
      monogram: "獄",
    },
    capabilities: { generatedAssets: true, localSaves: true },
    description:
      "Build a Hold, cultivate its defenders, and dig layer by layer into Hell.",
    entry: DescentGameExperience,
    id: "descent",
    launchLabel: "Begin the descent",
    name: "Descent",
    status: "Playable",
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
