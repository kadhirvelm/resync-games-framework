import { type FogOfWarState, isFogExplored, isFogVisible } from "../logic/fog";
import type { FxReadout } from "./presentation";

/** Anything drawn on the battlefield that belongs to a side. */
interface FactionPoint {
  factionId: "hold" | "horde";
  x: number;
  y: number;
}

/**
 * Keeps every Hold entity and only the horde entities in sight right now.
 * Horde bodies in explored ground vanish as soon as the Hold looks away.
 * @param entries - Units or buildings to filter
 * @param fog - Published fog, or null to show everything
 * @returns The entries the player may see
 */
export function visibleToHold<TEntry extends FactionPoint>(
  entries: readonly TEntry[],
  fog: FogOfWarState | null,
): TEntry[] {
  if (fog === null) return [...entries];
  return entries.filter(
    (entry) => entry.factionId === "hold" || isFogVisible(fog, entry),
  );
}

/**
 * Keeps map features (deposits, veins, vents) on ground the Hold has seen.
 * @param features - Features with map positions
 * @param fog - Published fog, or null to show everything
 * @returns The features the player has discovered
 */
export function exploredFeatures<TFeature extends { x: number; y: number }>(
  features: readonly TFeature[],
  fog: FogOfWarState | null,
): TFeature[] {
  if (fog === null) return [...features];
  return features.filter((feature) => isFogExplored(fog, feature));
}

/**
 * Keeps short-lived cues (rings, telegraphs) that happen in sight.
 * @param cues - Cues with map positions
 * @param fog - Published fog, or null to show everything
 * @returns The cues the player can witness
 */
export function cuesInSight<TCue extends { x: number; y: number }>(
  cues: readonly TCue[],
  fog: FogOfWarState | null,
): TCue[] {
  if (fog === null) return [...cues];
  return cues.filter((cue) => isFogVisible(fog, cue));
}

/**
 * Keeps combat effects that start or land in sight, so a Hunter firing into
 * the dark still shows its shot.
 * @param effects - Published effects
 * @param fog - Published fog, or null to show everything
 * @returns The effects the player can witness
 */
export function effectsInSight(
  effects: readonly FxReadout[],
  fog: FogOfWarState | null,
): FxReadout[] {
  if (fog === null) return [...effects];
  return effects.filter((effect) => {
    if ("from" in effect) {
      return isFogVisible(fog, effect.from) || isFogVisible(fog, effect.to);
    }
    return isFogVisible(fog, effect);
  });
}
