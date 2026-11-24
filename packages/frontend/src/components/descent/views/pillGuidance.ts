import { PILLS } from "../logic/cultivation/data";

/** Pill stats with a live consumer in cultivation combat modifiers. */
const IMPLEMENTED_PILL_STATS = new Set([
  "max_health",
  "move_speed",
  "school_effect",
]);

/**
 * Whether a recipe has a real effect in the mounted Ashen Gate game.
 * Data-only Battle Pills, later-layer Breakthrough Pills, and unimplemented
 * resistance effects stay out of live brewing so players cannot waste resources.
 * @param pillId - Recipe id from the shared pill catalog
 * @returns True for permanent and Dao pills with implemented stat effects
 */
export function isLiveBrewablePill(pillId: string): boolean {
  const pill = PILLS.find((candidate) => candidate.id === pillId);
  if (pill === undefined) return false;
  if (pill.role !== "permanent" && pill.role !== "dao") return false;
  return IMPLEMENTED_PILL_STATS.has(pill.effect.stat);
}

/**
 * Converts a projected pill amount into a concrete player-facing effect.
 * @param pillId - Shared pill id
 * @param amount - Projected amount after school matching
 * @returns Readable effect with the projected percentage applied
 */
export function pillEffectLabel(pillId: string, amount: number): string {
  const pill = PILLS.find((candidate) => candidate.id === pillId);
  if (pill === undefined) return "Unknown pill effect";
  const percent = Math.round(amount * 100);
  if (pill.effect.stat === "max_health") {
    return `+${percent}% maximum health`;
  }
  if (pill.effect.stat === "move_speed") {
    return `+${percent}% movement speed`;
  }
  if (pill.effect.stat === "school_effect") {
    return `+${percent}% school effect`;
  }
  if (pill.effect.stat === "school_resistance") {
    return `+${percent}% school resistance`;
  }
  return pill.description;
}
