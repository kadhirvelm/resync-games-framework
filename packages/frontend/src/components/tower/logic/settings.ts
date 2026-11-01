/** How quickly battles animate. */
export type BattleSpeed = "relaxed" | "normal" | "swift";

/** Player preferences, saved in the browser. */
export interface GameSettings {
  battleSpeed: BattleSpeed;
  /** Plays the generative background music */
  music: boolean;
  muted: boolean;
  /** Turns off ambient motion and shortens transitions */
  reducedMotion: boolean;
  /** Sound volume from 0 to 1 */
  volume: number;
}

/** Settings for a first visit. */
export const DEFAULT_SETTINGS: GameSettings = {
  battleSpeed: "normal",
  music: true,
  muted: false,
  reducedMotion: false,
  volume: 0.6,
};

/** Multiplier on battle delays and tween durations for each speed. */
export const BATTLE_PACE: Record<BattleSpeed, number> = {
  normal: 1,
  relaxed: 1.35,
  swift: 0.55,
};

/**
 * Reads stored settings, keeping valid fields and defaulting the rest.
 * @param raw - Parsed JSON from storage
 * @returns Usable settings
 */
export function parseSettings(raw: unknown): GameSettings {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_SETTINGS;
  }
  const stored = raw as Partial<Record<keyof GameSettings, unknown>>;
  const speed = stored.battleSpeed;
  return {
    battleSpeed:
      typeof speed === "string" && speed in BATTLE_PACE
        ? (speed as BattleSpeed)
        : DEFAULT_SETTINGS.battleSpeed,
    music:
      typeof stored.music === "boolean" ? stored.music : DEFAULT_SETTINGS.music,
    muted:
      typeof stored.muted === "boolean" ? stored.muted : DEFAULT_SETTINGS.muted,
    reducedMotion:
      typeof stored.reducedMotion === "boolean"
        ? stored.reducedMotion
        : DEFAULT_SETTINGS.reducedMotion,
    volume:
      typeof stored.volume === "number" && Number.isFinite(stored.volume)
        ? Math.min(1, Math.max(0, stored.volume))
        : DEFAULT_SETTINGS.volume,
  };
}
