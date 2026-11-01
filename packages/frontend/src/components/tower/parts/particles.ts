/**
 * Deterministic scatter so decorative scenes look hand-placed and never
 * jump between renders.
 * @param index - Item index
 * @param salt - Varies the sequence per property
 * @returns A value in [0, 1)
 */
export function scatter(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/** One particle thrown outward from a burst's center. */
export interface BurstParticle {
  /** Direction of travel in degrees, 0 pointing right */
  angle: number;
  /** Index into the burst's palette */
  colorIndex: number;
  /** Milliseconds before it leaves the center */
  delay: number;
  /** Pixels it travels */
  distance: number;
  /** Width in pixels; leaves are taller than wide */
  size: number;
  /** Degrees it turns while flying */
  spin: number;
}

/**
 * Particles spread evenly around a circle with a little jitter, so a burst
 * reads as a ring without looking mechanical.
 * @param count - How many particles
 * @param options.minDistance - Shortest flight in pixels
 * @param options.maxDistance - Longest flight in pixels
 * @param options.palette - Number of colors to cycle through
 * @param options.seed - Varies the layout between bursts
 * @returns One description per particle
 */
export function burstParticles(
  count: number,
  options: {
    maxDistance: number;
    minDistance: number;
    palette: number;
    seed?: number;
  },
): BurstParticle[] {
  const seed = options.seed ?? 0;
  const span = Math.max(0, options.maxDistance - options.minDistance);
  return Array.from({ length: Math.max(0, count) }, (_, index) => {
    const jitter =
      (scatter(index + seed, 1) - 0.5) * (360 / Math.max(count, 1));
    return {
      angle: Math.round((index / Math.max(count, 1)) * 360 + jitter),
      colorIndex: index % Math.max(1, options.palette),
      delay: Math.round(scatter(index + seed, 2) * 90),
      distance: Math.round(
        options.minDistance + scatter(index + seed, 3) * span,
      ),
      size: Math.round(6 + scatter(index + seed, 4) * 8),
      spin: Math.round(scatter(index + seed, 5) * 720 - 360),
    };
  });
}

/** One leaf falling across the whole screen. */
export interface RainParticle {
  colorIndex: number;
  /** Seconds before it starts; negative starts it mid-fall */
  delay: number;
  /** Sideways drift over the fall, in viewport widths */
  drift: number;
  /** Seconds one fall takes */
  duration: number;
  size: number;
  spin: number;
  /** Starting column, in viewport widths */
  x: number;
}

/**
 * Leaves for a celebratory rain, spread across the width of the screen.
 * @param count - How many leaves
 * @param palette - Number of colors to cycle through
 * @returns One description per leaf
 */
export function rainParticles(count: number, palette: number): RainParticle[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    colorIndex: index % Math.max(1, palette),
    delay: Number((scatter(index, 11) * 2.4).toFixed(2)),
    drift: Number((scatter(index, 12) * 24 - 12).toFixed(1)),
    duration: Number((3.2 + scatter(index, 13) * 2.6).toFixed(2)),
    size: Math.round(10 + scatter(index, 14) * 12),
    spin: Math.round(scatter(index, 15) * 900 - 450),
    x: Number((scatter(index, 16) * 100).toFixed(1)),
  }));
}

/** One scheduled sound in a staggered sequence. */
export interface StaggerBeat {
  /** Milliseconds after the sequence starts */
  atMs: number;
  /** Pitch multiplier for this beat */
  pitch: number;
}

/**
 * Times for a run of sounds, such as one chime per dealt card, rising in
 * pitch so the run feels like it builds.
 * @param count - How many beats
 * @param startMs - Delay before the first beat
 * @param stepMs - Gap between beats
 * @param pitchStep - Added to the pitch on each beat
 * @returns One beat per item
 */
export function staggerSchedule(
  count: number,
  startMs: number,
  stepMs: number,
  pitchStep = 0,
): StaggerBeat[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    atMs: startMs + index * stepMs,
    pitch: 1 + index * pitchStep,
  }));
}
