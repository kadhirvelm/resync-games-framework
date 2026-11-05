import { LAYER_BRIEFINGS } from "../data/narrative/layers";
import type { LayerBriefing } from "../data/narrative/types";
import type { PillPreview } from "../logic/cultivation/types";
import { LAYER_TABLE } from "../logic/layers/layerTable";
import type { LayerConfig, LayerId } from "../logic/layers/layerTypes";
import type { ClassId, ResourceId, SchoolId } from "../logic/types";

/** Player-facing class names. */
export const CLASS_LABEL: Record<ClassId, string> = {
  adept: "Adept",
  breaker: "Breaker",
  hunter: "Hunter",
  raider: "Raider",
  rider: "Rider",
  villager: "Villager",
  warden: "Warden",
};

/** Player-facing school names. */
export const SCHOOL_LABEL: Record<SchoolId, string> = {
  blood: "Blood",
  ember: "Ember",
  rime: "Rime",
};

/** Player-facing explanation for one selectable stockpile resource. */
export interface ResourceCopy {
  /** What the resource represents in the Hold. */
  description: string;
  /** How the Hold gets more. */
  more: string;
  name: string;
  /** Tooltip slang from the shared contract. */
  slang?: string;
  /** What the stockpile is spent on. */
  use: string;
}

/** A selectable stockpile entry, including population capacity. */
export type ResourceSelectionId = ResourceId | "population";

/**
 * The bundled HUD icon for a stockpile resource.
 * @param resource - Resource id
 * @returns Public path to its PNG icon
 */
export function resourceIconSrc(resource: ResourceId): string {
  return `/descent/resource-icons/${resource}.png`;
}

/** Resource names, uses, and gather hints. Slang stays in the tooltip. */
export const RESOURCE_COPY: Record<ResourceId, ResourceCopy> = {
  coin: {
    description: "Salvaged currency and tribute recovered for the Hold.",
    more: "Right-click ruins or a hoard.",
    name: "Coin",
    slang: "tithe",
    use: "Heroes and later ranks.",
  },
  essence: {
    description: "Condensed cultivation energy drawn from the Ashen Gate.",
    more: "Right-click a well. Kills drop some.",
    name: "Essence",
    slang: "ember",
    use: "Pills and breakthroughs.",
  },
  food: {
    description: "Meals and preserved stores that keep the Hold supplied.",
    more: "Right-click a grove. Root Cellar trickles more.",
    name: "Food",
    slang: "hearth",
    use: "Trains people. With water, feeds a wave.",
  },
  iron: {
    description: "Hard metal reserved for fortifications and elite arms.",
    more: "Right-click a deep vein.",
    name: "Iron",
    slang: "grit",
    use: "Gates, forges, and Sworn.",
  },
  spirit_herbs: {
    description: "Cultivation plants carrying useful spiritual properties.",
    more: "Right-click an herb patch.",
    name: "Spirit Herbs",
    slang: "green",
    use: "Pills and breakthroughs.",
  },
  stone: {
    description: "Quarried rock used wherever the Hold needs lasting strength.",
    more: "Right-click a rock vein.",
    name: "Stone",
    slang: "keep",
    use: "Walls, towers, and halls.",
  },
  water: {
    description: "Fresh water for the people and stores of the Hold.",
    more: "Right-click a spring. Root Cellar trickles more.",
    name: "Water",
    slang: "spring",
    use: "Trains people. With food, feeds a wave.",
  },
  wood: {
    description: "Timber and framing material gathered from dead trees.",
    more: "Right-click a tree.",
    name: "Wood",
    slang: "frame",
    use: "Raises buildings.",
  },
};

/** Explanation for the population-capacity chip beside the stockpile. */
export const POPULATION_COPY: ResourceCopy = {
  description: "The people currently living and fighting for the Hold.",
  more: "Train villagers. Housing raises the cap.",
  name: "People",
  use: "Workers and fighters share this cap.",
};

/**
 * Resolves the copy for any selectable stockpile entry.
 * @param resource - Harvested resource or population capacity
 * @returns The player-facing description and actions
 */
export function resourceSelectionCopy(
  resource: ResourceSelectionId,
): ResourceCopy {
  if (resource === "population") return POPULATION_COPY;
  return RESOURCE_COPY[resource];
}

/** Class order used when an Omen lists a mix. */
export const CLASS_ORDER = [
  "villager",
  "warden",
  "hunter",
  "rider",
  "raider",
  "breaker",
  "adept",
] as const satisfies readonly ClassId[];

/** Layer title, hazard, and school lines for the banner. */
export interface LayerBannerCopy {
  boost: string;
  essenceGrade: string;
  faction: string;
  hazard: string;
  hinder: string;
  name: string;
  rankCap: string;
}

const UNKNOWN_BANNER: LayerBannerCopy = {
  boost: "No school boosted",
  essenceGrade: "Essence grade unpublished",
  faction: "",
  hazard: "No hazard published.",
  hinder: "No school hindered",
  name: "No layer",
  rankCap: "Rank cap unpublished",
};

/**
 * Formats a 0–1 success chance as a whole percent.
 * @param value - Published success chance
 * @returns A percent string such as "62%"
 */
export function formatChance(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Formats Hell Pressure for the meter.
 * @param value - Published 0–1 pressure
 * @returns A whole percent from 0 through 100
 */
export function pressurePercent(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100);
}

/**
 * Formats the Omen countdown from the snapshot. Pause only changes the label.
 * @param seconds - Sim seconds remaining
 * @param paused - Whether the sim snapshot is paused
 * @returns The countdown text, marked held while paused
 */
export function formatEta(seconds: number, paused: boolean): string {
  const whole = Math.max(0, Math.ceil(seconds));
  if (paused) return `${whole}s held`;
  return `${whole}s`;
}

/**
 * Names a school, or the unlocked-but-unchosen state.
 * @param school - Published school, if the unit has locked one
 * @returns The school name or "None yet"
 */
export function schoolName(school: SchoolId | undefined): string {
  if (school === undefined) return "None";
  return SCHOOL_LABEL[school];
}

/**
 * School row for a breakthrough or school-choice confirm.
 * @param school - Unit's locked school, if any
 * @returns Copy that names the match before the player commits
 */
export function schoolCommitValue(school: SchoolId | undefined): string {
  if (school === undefined) return "None";
  return SCHOOL_LABEL[school];
}

/**
 * Toxicity projection already computed for a pill.
 * @param preview - Cultivation pill preview
 * @returns Current toxicity, the cap, and the projected result
 */
export function toxicityLabel(preview: PillPreview): string {
  return `${preview.toxicity}/${preview.toxicityCap} → ${preview.toxicityAfter}/${preview.toxicityCap}`;
}

/**
 * Explains a refused pill feed with the published reason and school match.
 * @param preview - Cultivation pill preview
 * @param schoolMatch - Display sentence for the school match
 * @returns Toast and alert copy
 */
export function feedBlockMessage(
  preview: PillPreview,
  schoolMatch: string,
): string {
  const parts: string[] = [];
  if (preview.reason !== undefined && preview.reason.length > 0) {
    parts.push(preview.reason);
  }
  parts.push(
    `Toxicity ${preview.toxicity}/${preview.toxicityCap}.`,
    schoolMatch,
  );
  return parts.join(" ");
}

/**
 * Maps a published breakthrough checklist onto the shell's failure toasts.
 * @param missing - Requirement lines from the cultivation view
 * @returns Toast copy, including the canonical merit and population phrases
 */
export function breakthroughToast(missing: readonly string[]): string {
  const parts: string[] = [];
  const merit = missing.some((line) => line.toLowerCase().includes("merit"));
  const population = missing.some((line) =>
    line.toLowerCase().includes("population"),
  );
  if (merit) parts.push("Merit incomplete");
  if (population) parts.push("Need spare population");
  for (const line of missing) parts.push(line);
  if (parts.length === 0) return "Breakthrough requirements are incomplete.";
  return parts.join(". ");
}

/**
 * Uses the canonical population toast when a published reason is about pop.
 * @param reason - Reason string from the snapshot, if any
 * @returns Toast copy
 */
export function populationToast(reason: string | undefined): string {
  if (reason === undefined || reason.length === 0) {
    return "Need spare population";
  }
  if (reason.includes("Need spare population")) return reason;
  if (reason.toLowerCase().includes("population")) {
    return `Need spare population. ${reason}`;
  }
  return reason;
}

/**
 * Turns layer school multipliers into boost and hinder lines.
 * @param modifiers - Published per-school multipliers
 * @returns Display lines; a 1× school is omitted
 */
export function schoolModifierLines(
  modifiers: Readonly<Record<SchoolId, number>>,
): { boost: string; hinder: string } {
  const boosts: string[] = [];
  const hinders: string[] = [];
  const schools = ["ember", "rime", "blood"] as const;
  for (const school of schools) {
    const percent = Math.round((modifiers[school] - 1) * 100);
    if (percent > 0) boosts.push(`${SCHOOL_LABEL[school]} +${percent}%`);
    if (percent < 0) {
      hinders.push(`${SCHOOL_LABEL[school]} −${Math.abs(percent)}%`);
    }
  }
  return {
    boost: boosts.length > 0 ? boosts.join(", ") : "No school boosted",
    hinder: hinders.length > 0 ? hinders.join(", ") : "No school hindered",
  };
}

/**
 * Finds a layer config, accepting hyphen or underscore ids.
 * @param layerId - Snapshot layer id
 * @returns The published layer, or undefined
 */
export function findLayer(layerId: string | null): LayerConfig | undefined {
  if (layerId === null) return undefined;
  const normalized = layerId.replaceAll("-", "_");
  return LAYER_TABLE.layers.find(
    (layer) => layer.id === layerId || layer.id === normalized,
  );
}

/**
 * Looks up the narrative hazard line for a layer.
 * @param layerId - Layer id from the table
 * @returns The briefing, when narrative published one
 */
function briefingFor(layerId: LayerId): LayerBriefing | undefined {
  const briefings: Partial<Record<LayerId, LayerBriefing>> = LAYER_BRIEFINGS;
  return briefings[layerId];
}

/**
 * Builds the layer banner from the snapshot's layer id and the published tables.
 * @param layerId - Current sim layer
 * @returns Name, hazard, and school lines
 */
export function layerBannerFor(layerId: string | null): LayerBannerCopy {
  const layer = findLayer(layerId);
  if (layer === undefined) {
    if (layerId === null) return UNKNOWN_BANNER;
    return { ...UNKNOWN_BANNER, name: layerId };
  }
  const briefing = briefingFor(layer.id);
  const schools = schoolModifierLines(layer.schoolModifiers);
  return {
    boost: schools.boost,
    essenceGrade: `Essence grade ×${layer.essenceGrade}`,
    faction: layer.faction,
    hazard: briefing?.hazard ?? "No hazard published.",
    hinder: schools.hinder,
    name: layer.name,
    rankCap: `Rank cap ${layer.realmCap}`,
  };
}
