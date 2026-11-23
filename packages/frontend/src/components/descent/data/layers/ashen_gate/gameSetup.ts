import type { AshenGateMap } from "./map";

/** Solo rulesets configurable from the New Game setup screen. */
export type DescentSoloMode = "exploration" | "siege";

/** Terrain-focused map archetypes inspired by Age of Empires skirmish maps. */
export type AshenGateMapType =
  | "ashen_crossings"
  | "highlands"
  | "king_of_the_hill"
  | "open_steppe";

/** Difficulty presets controlling wave timing and horde strength. */
export type DescentDifficulty = "standard" | "moderate" | "hard" | "brutal";

/** Starting resource presets inspired by Age of Empires skirmish rules. */
export type DescentStartingResources = "standard" | "abundant" | "deathmatch";

/** Complete solo skirmish configuration selected before launching a match. */
export interface DescentGameSetup {
  difficulty: DescentDifficulty;
  mapType: AshenGateMapType;
  mode: DescentSoloMode;
  /** Optional custom numeric seed; `null` rolls a fresh random seed. */
  seed: number | null;
  startingResources: DescentStartingResources;
}

/** Default balanced Descent skirmish settings. */
export const DEFAULT_GAME_SETUP: DescentGameSetup = {
  difficulty: "moderate",
  mapType: "ashen_crossings",
  mode: "siege",
  seed: null,
  startingResources: "standard",
};

/** Display and generation metadata for one selectable map archetype. */
export interface MapTypeOption {
  readonly badge: string;
  readonly id: AshenGateMapType;
  readonly name: string;
  readonly summary: string;
  readonly terrainHighlights: string;
}

/** Selectable terrain-focused map types shown in the New Game setup screen. */
export const ASHEN_GATE_MAP_TYPES: readonly MapTypeOption[] = [
  {
    badge: "Balanced",
    id: "ashen_crossings",
    name: "Ashen Crossings",
    summary:
      "Two winding rivers bridged across choke points with tactical hills overlooking each crossing.",
    terrainHighlights: "2 rivers · 4 bridges · 11 hills",
  },
  {
    badge: "High Ground",
    id: "highlands",
    name: "Highland Ridges",
    summary:
      "Tall terraced hills and steep ridges split by a single river gorge. Control the crests to dominate downhill fire.",
    terrainHighlights: "1 gorge river · 3 bridges · 18 tall hills",
  },
  {
    badge: "Hill Fortress",
    id: "king_of_the_hill",
    name: "Crown Plateau",
    summary:
      "A massive two-tier central fortress hill commands the entire mid-field, ringed by rolling foothill knolls.",
    terrainHighlights: "No rivers · giant central peak · 12 hills",
  },
  {
    badge: "Open Field",
    id: "open_steppe",
    name: "Basalt Flats",
    summary:
      "Wide-open dry terrain with gentle rolling knolls and no river choke points. Built for fast flanking.",
    terrainHighlights: "No rivers · open approaches · 7 gentle hills",
  },
];

/** Display and wave-scaling metadata for one difficulty level. */
export interface DifficultyOption {
  readonly id: DescentDifficulty;
  readonly name: string;
  readonly summary: string;
  /** Multiplier on horde HP and attack damage. */
  readonly waveStatScale: number;
  /** Multiplier on time between waves (> 1 = more prep time). */
  readonly waveTimeScale: number;
}

/** Selectable difficulty presets for solo siege matches. */
export const DESCENT_DIFFICULTIES: readonly DifficultyOption[] = [
  {
    id: "standard",
    name: "Standard",
    summary: "25% more prep time between waves and lighter horde stats.",
    waveStatScale: 0.8,
    waveTimeScale: 1.25,
  },
  {
    id: "moderate",
    name: "Moderate",
    summary: "Default Ashen Gate pacing and balanced horde strength.",
    waveStatScale: 1,
    waveTimeScale: 1,
  },
  {
    id: "hard",
    name: "Hard",
    summary: "Faster waves and +25% stronger enemies. Hold the high ground.",
    waveStatScale: 1.25,
    waveTimeScale: 0.85,
  },
  {
    id: "brutal",
    name: "Brutal",
    summary: "Relentless siege tempo with +50% horde strength.",
    waveStatScale: 1.5,
    waveTimeScale: 0.72,
  },
];

/** Display metadata for one starting resource preset. */
export interface StartingResourcesOption {
  readonly id: DescentStartingResources;
  readonly name: string;
  readonly summary: string;
}

/** Selectable starting stockpile presets. */
export const DESCENT_STARTING_RESOURCES: readonly StartingResourcesOption[] = [
  {
    id: "standard",
    name: "Standard",
    summary: "Classic lean opening — gather early wood and food to expand.",
  },
  {
    id: "abundant",
    name: "Abundant",
    summary: "1.75× starting supplies plus starter iron and coin.",
  },
  {
    id: "deathmatch",
    name: "Deathmatch",
    summary: "Rich war chest to fortify hilltops and field an army right away.",
  },
];

/**
 * Looks up wave scaling for a difficulty id, defaulting to Moderate.
 * @param difficulty - Requested difficulty preset
 * @returns Matching difficulty descriptor
 */
export function getDifficultyOption(
  difficulty: DescentDifficulty = "moderate",
): DifficultyOption {
  return (
    DESCENT_DIFFICULTIES.find((entry) => entry.id === difficulty) ??
    (DESCENT_DIFFICULTIES[1] as DifficultyOption)
  );
}

/**
 * Looks up map metadata for a map type id, defaulting to Ashen Crossings.
 * @param mapType - Requested map type
 * @returns Matching map type descriptor
 */
export function getMapTypeOption(
  mapType: AshenGateMapType = "ashen_crossings",
): MapTypeOption {
  return (
    ASHEN_GATE_MAP_TYPES.find((entry) => entry.id === mapType) ??
    (ASHEN_GATE_MAP_TYPES[0] as MapTypeOption)
  );
}

/**
 * Scales a map's base starting stockpile according to the chosen resource preset.
 * @param base - Base map stockpile
 * @param preset - Selected starting resource level
 * @returns New stockpile record
 */
export function applyStartingResources(
  base: AshenGateMap["stockpile"],
  preset: DescentStartingResources = "standard",
): AshenGateMap["stockpile"] {
  if (preset === "standard") return { ...base };
  if (preset === "abundant") {
    return {
      coin: Math.round((base.coin ?? 0) + 60),
      essence: Math.round((base.essence ?? 0) + 30),
      food: Math.round((base.food ?? 0) * 1.75),
      iron: Math.round((base.iron ?? 0) + 40),
      spirit_herbs: Math.round((base.spirit_herbs ?? 0) + 20),
      stone: Math.round((base.stone ?? 0) * 1.75),
      water: Math.round((base.water ?? 0) * 1.75),
      wood: Math.round((base.wood ?? 0) * 1.75),
    };
  }
  return {
    coin: Math.round((base.coin ?? 0) + 200),
    essence: Math.round((base.essence ?? 0) + 120),
    food: Math.round((base.food ?? 0) * 3.5),
    iron: Math.round((base.iron ?? 0) + 140),
    spirit_herbs: Math.round((base.spirit_herbs ?? 0) + 60),
    stone: Math.round((base.stone ?? 0) * 3.5),
    water: Math.round((base.water ?? 0) * 3.5),
    wood: Math.round((base.wood ?? 0) * 3.5),
  };
}
