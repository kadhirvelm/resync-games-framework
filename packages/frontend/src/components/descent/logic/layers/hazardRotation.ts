import type { HazardId, HazardRotation, LayerConfig } from "./layerTypes";

/**
 * Returns which rotation slot is active after some sim time on the layer.
 * Deterministic: slot 0 at layer start, then the next slot every period,
 * wrapping around.
 * @param rotation - The layer's hazard rotation.
 * @param elapsedSimSeconds - Sim-seconds since the layer started; negatives count as 0.
 * @returns Index into `rotation.hazards`.
 */
export function rotationSlotAt(
  rotation: HazardRotation,
  elapsedSimSeconds: number,
): number {
  const elapsed = Math.max(0, elapsedSimSeconds);
  const periodsPassed = Math.floor(elapsed / rotation.periodSeconds);
  return periodsPassed % rotation.hazards.length;
}

/**
 * Lists the hazards active on a layer at a point in its sim time: the
 * fixed hazards, or the current rotation hazard on a rotating layer.
 * @param layer - Layer config.
 * @param elapsedSimSeconds - Sim-seconds since the layer started.
 * @returns Active hazard ids.
 */
export function activeHazardsAt(
  layer: LayerConfig,
  elapsedSimSeconds: number,
): readonly HazardId[] {
  const rotation = layer.hazardRotation;
  if (rotation === null) {
    return layer.hazards;
  }
  const hazard = rotation.hazards[rotationSlotAt(rotation, elapsedSimSeconds)];
  if (hazard === undefined) {
    return layer.hazards;
  }
  return [...layer.hazards, hazard];
}
