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
export type CharacterClip =
  | "attack"
  | "death"
  | "hit"
  | "idle"
  | "meditate"
  | "run"
  | "walk"
  | "work";

const VILLAGER_WORK_ACTIVITY_PREFIXES = [
  "Gathering",
  "Building",
  "Repairing",
  "Working",
  "Harvesting",
  "Tending",
] as const;

/**
 * @param activity - Published villager task readout, e.g. "Gathering Wood"
 * @returns Whether the villager is actively performing stationary labor
 */
export function isVillagerWorkingActivity(activity?: string): boolean {
  if (!activity) return false;
  return VILLAGER_WORK_ACTIVITY_PREFIXES.some((prefix) =>
    activity.startsWith(prefix),
  );
}

/**
 * Selects the looping character animation clip for the current frame.
 * Walking (or running for a Rider with a `run` clip) takes priority over
 * stationary labor; missing optional clips fall back to `walk` or `idle`.
 * @param input - Unit locomotion, role, activity, and clip availability
 * @returns The looping clip name to play
 */
export function selectCharacterLoopClip(input: {
  activity?: string;
  hasMeditateClip?: boolean;
  hasRunClip?: boolean;
  hasWorkClip: boolean;
  locomoting: boolean;
  meditating?: boolean;
  role: string;
}): "idle" | "meditate" | "run" | "walk" | "work" {
  if (input.locomoting) {
    if (input.role === "rider" && input.hasRunClip) return "run";
    return "walk";
  }
  if (input.meditating && input.hasMeditateClip) {
    return "meditate";
  }
  if (
    input.role === "villager" &&
    input.hasWorkClip &&
    isVillagerWorkingActivity(input.activity)
  ) {
    return "work";
  }
  return "idle";
}

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
export const MAX_STEP_INTERVAL_MS = 1200;

/** Default glide duration in ms for units that step on combat ticks. */
export const DEFAULT_STEP_INTERVAL_MS = 100;

/** Default glide duration in ms for villagers, which step on economy ticks. */
export const VILLAGER_DEFAULT_STEP_INTERVAL_MS = 500;

/**
 * Initial step glide duration for a unit role so its very first step
 * matches its simulation cadence instead of dashing and pausing.
 * @param role - Unit asset role (e.g. "villager", "warden")
 * @returns Initial step interval in milliseconds
 */
export function defaultStepInterval(role: string): number {
  return role === "villager"
    ? VILLAGER_DEFAULT_STEP_INTERVAL_MS
    : DEFAULT_STEP_INTERVAL_MS;
}

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

/** Stationary villager jobs with distinct procedural presentation. */
export type VillagerWorkTask = "build" | "food" | "gold" | "stone" | "wood";

/** Presentation-only joint angles and offsets for one work-cycle frame. */
export interface VillagerWorkPose {
  /** Small vertical crouch on impact, layered over the gait bob. */
  bob: number;
  /** Left arm rotation around its local x-axis, in radians. */
  leftArmPitch: number;
  /** Small side-to-side weight shift, layered over the gait lean. */
  lean: number;
  /** Right/tool arm rotation around its local x-axis, in radians. */
  rightArmPitch: number;
  /** Forward torso rotation around its local x-axis, in radians. */
  torsoPitch: number;
}

interface StrikeProfile {
  leftArmScale: number;
  rightArmScale: number;
  supportArmPitch: number;
  torsoBase: number;
  torsoStrike: number;
}

const WORK_CYCLE_MS = 1_000;

const STRIKE_PROFILES: Record<
  Exclude<VillagerWorkTask, "food">,
  StrikeProfile
> = {
  build: {
    leftArmScale: 0.12,
    rightArmScale: 0.82,
    supportArmPitch: 0.3,
    torsoBase: 0.1,
    torsoStrike: 0.12,
  },
  gold: {
    leftArmScale: 0.82,
    rightArmScale: 1.0,
    supportArmPitch: 0.08,
    torsoBase: 0.09,
    torsoStrike: 0.24,
  },
  stone: {
    leftArmScale: 0.9,
    rightArmScale: 1.02,
    supportArmPitch: 0.06,
    torsoBase: 0.1,
    torsoStrike: 0.27,
  },
  wood: {
    leftArmScale: 0.86,
    rightArmScale: 1.12,
    supportArmPitch: 0.08,
    torsoBase: 0.08,
    torsoStrike: 0.22,
  },
};

/**
 * Resolves a published villager activity to its procedural work style.
 * Coin uses the gold/mining style; iron and essence use the stone style.
 * @param activity - Published task readout, such as "Gathering Wood"
 * @returns A work style, or null when the activity is not stationary labor
 */
export function villagerWorkTask(activity?: string): VillagerWorkTask | null {
  if (!isVillagerWorkingActivity(activity)) return null;
  const normalized = (activity ?? "").toLowerCase();
  if (
    normalized.startsWith("building") ||
    normalized.startsWith("repairing") ||
    normalized.startsWith("working")
  ) {
    return "build";
  }
  if (
    normalized.startsWith("harvesting") ||
    normalized.startsWith("tending") ||
    normalized.includes("food") ||
    normalized.includes("water") ||
    normalized.includes("herb")
  ) {
    return "food";
  }
  if (normalized.includes("coin") || normalized.includes("gold")) {
    return "gold";
  }
  if (
    normalized.includes("essence") ||
    normalized.includes("stone") ||
    normalized.includes("iron")
  ) {
    return "stone";
  }
  return "wood";
}

/**
 * Returns a repeatable 0..1 cycle, including for negative presentation times.
 * @param timeMs - Presentation time in milliseconds
 * @param phase - Stable per-unit phase offset in radians
 * @returns Position within the one-second work cycle
 */
function workCycle(timeMs: number, phase: number): number {
  const safeTime = Number.isFinite(timeMs) ? timeMs : 0;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const phaseMs = (safePhase / (Math.PI * 2)) * WORK_CYCLE_MS;
  const wrapped = (safeTime + phaseMs) % WORK_CYCLE_MS;
  return ((wrapped + WORK_CYCLE_MS) % WORK_CYCLE_MS) / WORK_CYCLE_MS;
}

/**
 * Shapes one blow into anticipation, a fast strike, and a smooth recovery.
 * @param cycle - Position within the work cycle from zero to one
 * @returns Normalized arm swing from raised (-1) to impact (1)
 */
function strikeCurve(cycle: number): number {
  if (cycle < 0.45) {
    const anticipation = cycle / 0.45;
    return -(anticipation * anticipation * (3 - 2 * anticipation));
  }
  if (cycle < 0.62) {
    const strike = (cycle - 0.45) / 0.17;
    return -1 + 2 * strike * strike;
  }
  const recovery = (cycle - 0.62) / 0.38;
  const eased = recovery * recovery * (3 - 2 * recovery);
  return 1 - eased;
}

/**
 * Produces a deterministic chop, mine, hammer, or harvest pose on a one-second
 * rhythm. It has no Babylon or scene dependencies and repeats exactly.
 * @param timeMs - Presentation time in milliseconds
 * @param task - Kind of stationary work being performed
 * @param phase - Optional stable per-unit phase offset in radians
 * @returns Joint pitches and small body offsets for the current frame
 */
export function villagerWorkPose(
  timeMs: number,
  task: VillagerWorkTask,
  phase = 0,
): VillagerWorkPose {
  const cycle = workCycle(timeMs, phase);
  const wave = Math.sin(cycle * Math.PI * 2);
  if (task === "food") {
    return {
      bob: -0.025 - Math.cos(cycle * Math.PI * 2) * 0.008,
      lean: wave * 0.025,
      leftArmPitch: -0.42 + wave * 0.38,
      rightArmPitch: -0.42 - wave * 0.38,
      torsoPitch: 0.18 + Math.cos(cycle * Math.PI * 2) * 0.045,
    };
  }
  const profile = STRIKE_PROFILES[task];
  const swing = strikeCurve(cycle);
  const impact = Math.max(0, swing);
  return {
    bob: wave * 0.008 - impact * 0.035,
    lean: wave * 0.022,
    leftArmPitch: swing * profile.leftArmScale - profile.supportArmPitch,
    rightArmPitch: swing * profile.rightArmScale,
    torsoPitch: profile.torsoBase + impact * profile.torsoStrike,
  };
}

/**
 * Selects the procedural labor fallback only for a stationary villager whose
 * generated model has no authored work clip.
 * @param input - Current unit state, presentation time, and clip availability
 * @returns A work pose, or null when normal clip/locomotion handling should win
 */
export function proceduralWorkPose(input: {
  activity?: string;
  hasWorkClip: boolean;
  locomoting: boolean;
  phase?: number;
  role: string;
  timeMs: number;
}): VillagerWorkPose | null {
  if (input.role !== "villager" || input.locomoting || input.hasWorkClip) {
    return null;
  }
  const task = villagerWorkTask(input.activity);
  if (task === null) return null;
  return villagerWorkPose(input.timeMs, task, input.phase);
}
