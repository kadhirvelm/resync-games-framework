/**
 * Converts a frame delta into a frame-rate-independent exponential blend.
 * @param deltaMs - Elapsed frame time in milliseconds
 * @param responseMs - Approximate time for the motion to settle
 * @returns A clamped interpolation factor from zero to one
 */
export function motionBlend(deltaMs: number, responseMs: number): number {
  if (!(deltaMs > 0) || !(responseMs > 0)) return 1;
  return Math.max(0, Math.min(1, 1 - Math.exp(-deltaMs / responseMs)));
}

/**
 * Interpolates between radians along the shortest arc.
 * @param current - Current angle in radians
 * @param target - Desired angle in radians
 * @param blend - Interpolation factor from zero to one
 * @returns The smoothly interpolated angle
 */
export function smoothAngle(
  current: number,
  target: number,
  blend: number,
): number {
  const turn = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + turn * Math.max(0, Math.min(1, blend));
}

/** Canonical animation clips that can be played by a Descent character. */
export type CharacterClip = "attack" | "death" | "hit" | "idle" | "walk";

/**
 * Checks a Babylon animation-group name after a model has been instantiated.
 * Babylon runs the instance name mapper over animation groups, so `idle` may
 * arrive as `unit-idle` even though the source GLB uses the canonical name.
 * @param candidate - Animation-group name in the live scene
 * @param clip - Canonical clip to find
 * @returns Whether the group represents that clip
 */
export function animationClipMatches(
  candidate: string,
  clip: CharacterClip,
): boolean {
  const normalized = candidate.trim().toLowerCase();
  return normalized === clip || normalized.endsWith(`-${clip}`);
}

/**
 * Makes a stable animation phase from an entity id so a formation does not
 * breathe or step in perfect lockstep.
 * @param id - Stable simulation entity id
 * @returns Phase in radians
 */
export function unitMotionPhase(id: string): number {
  let hash = 0;
  for (const character of id) {
    hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % 997;
  }
  return (hash / 997) * Math.PI * 2;
}

/** Shortest and longest gaps, in ms, accepted as one sim movement step. */
export const MIN_STEP_INTERVAL_MS = 40;
export const MAX_STEP_INTERVAL_MS = 700;

/**
 * Updates the running estimate of how often the sim moves a unit. Villagers
 * hop a whole cell per economy step, so the renderer glides each hop over the
 * expected gap to the next one and the hops join into one continuous walk.
 * A long gap means the unit was standing still, so it does not count.
 * @param previousMs - Current estimate in milliseconds
 * @param observedMs - Time since the unit's previous position change
 * @returns The new estimate, clamped to the accepted step range
 */
export function estimateStepInterval(
  previousMs: number,
  observedMs: number,
): number {
  if (!(observedMs > 0) || observedMs > MAX_STEP_INTERVAL_MS) {
    return previousMs;
  }
  const observed = Math.max(MIN_STEP_INTERVAL_MS, observedMs);
  return previousMs * 0.6 + observed * 0.4;
}

/**
 * Linear progress through one glided step.
 * @param nowMs - Current presentation time
 * @param startedAtMs - When the step began
 * @param durationMs - How long the step lasts; zero or less snaps
 * @returns Progress from zero to one
 */
export function stepProgress(
  nowMs: number,
  startedAtMs: number,
  durationMs: number,
): number {
  if (!(durationMs > 0)) return 1;
  return Math.max(0, Math.min(1, (nowMs - startedAtMs) / durationMs));
}

/**
 * Advances the renderer-owned clock without letting a pause consume time.
 * @param nowMs - Current presentation time
 * @param deltaMs - Elapsed render-frame time
 * @param paused - Whether world presentation is frozen
 * @returns The next presentation time, unchanged while paused
 */
export function advancePresentationTime(
  nowMs: number,
  deltaMs: number,
  paused: boolean,
): number {
  if (paused || !(deltaMs > 0)) return nowMs;
  return nowMs + Math.min(50, deltaMs);
}

/** A unit's procedural gait: an integrated cycle phase and a walk weight. */
export interface Gait {
  /** Accumulated cycle phase in radians. */
  phase: number;
  /** Zero when standing, one when walking; eased between. */
  weight: number;
}

/**
 * Advances a gait one frame. The phase is integrated rather than computed
 * from wall time, so changing cadence between idle and walking never jumps.
 * @param gait - Current gait
 * @param deltaMs - Elapsed frame time in milliseconds
 * @param moving - Whether the unit is locomoting this frame
 * @returns The next gait
 */
export function advanceGait(
  gait: Gait,
  deltaMs: number,
  moving: boolean,
): Gait {
  const blend = motionBlend(deltaMs, 180);
  const weight = gait.weight + ((moving ? 1 : 0) - gait.weight) * blend;
  const frequency = 2.15 + (8.4 - 2.15) * weight;
  const phase = (gait.phase + (frequency * deltaMs) / 1000) % (Math.PI * 4);
  return { phase, weight };
}

/**
 * Produces subtle presentation-only bob and lean from a gait.
 * @param gait - Current gait
 * @returns Vertical bob and side-to-side lean
 */
export function gaitMotion(gait: Gait): { bob: number; lean: number } {
  const amplitude = 0.012 + (0.035 - 0.012) * gait.weight;
  const leanAmplitude = 0.004 + (0.012 - 0.004) * gait.weight;
  return {
    bob: (Math.sin(gait.phase) + 1) * amplitude,
    lean: Math.sin(gait.phase * 0.5) * leanAmplitude,
  };
}
