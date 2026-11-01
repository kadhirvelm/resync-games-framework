/**
 * Small synthesized sound effects: soft bells, plucked strings, and filtered
 * noise built from Web Audio nodes, so the game needs no audio files. Every
 * call is a no-op on the server, before the first user gesture unlocks audio,
 * or while muted.
 */

/** Every effect the game can play. */
export type SoundName =
  | "hover"
  | "select"
  | "confirm"
  | "back"
  | "reward"
  | "merge"
  | "purchase"
  | "victory"
  | "defeat"
  | "card"
  | "hit"
  | "heavy-hit"
  | "block"
  | "turn"
  | "denied"
  | "climb"
  | "draw"
  | "whoosh"
  | "slash"
  | "crit"
  | "death"
  | "combo"
  | "aether"
  | "coin"
  | "sparkle"
  | "pop"
  | "tick"
  | "flip";

/** One tone inside an effect. */
export interface Tone {
  /** Seconds after the effect starts */
  at: number;
  /** Seconds to reach full volume. Defaults to a near-instant strike. */
  attack?: number;
  /** Seconds the tone rings */
  decay: number;
  /** Pitch in hertz, or the band-pass center for noise */
  frequency: number;
  /** Peak gain before the master volume */
  gain: number;
  /** Frequency to glide to by the end of the tone */
  glideTo?: number;
  wave: OscillatorType | "noise";
}

/** Pentatonic notes, in hertz, so stacked effects never clash. */
export const NOTE = {
  a2: 110,
  a3: 220,
  a4: 440,
  a5: 880,
  c3: 130.81,
  c4: 261.63,
  c5: 523.25,
  c6: 1046.5,
  d3: 146.83,
  d4: 293.66,
  d5: 587.33,
  e3: 164.81,
  e4: 329.63,
  e5: 659.25,
  e6: 1318.5,
  g2: 98,
  g3: 196,
  g4: 392,
  g5: 783.99,
} as const;

/**
 * @param frequency - Pitch in hertz
 * @param at - Start offset in seconds
 * @param gain - Peak gain
 * @param decay - Ring time in seconds
 * @returns A bell: a sine with a quiet octave partial
 */
export function bell(
  frequency: number,
  at: number,
  gain = 0.18,
  decay = 0.9,
): Tone[] {
  return [
    { at, decay, frequency, gain, wave: "sine" },
    {
      at,
      decay: decay * 0.45,
      frequency: frequency * 2,
      gain: gain * 0.3,
      wave: "sine",
    },
  ];
}

/**
 * @param frequency - Pitch in hertz
 * @param at - Start offset in seconds
 * @param gain - Peak gain
 * @param decay - Ring time in seconds
 * @returns A short plucked string
 */
export function pluck(
  frequency: number,
  at: number,
  gain = 0.14,
  decay = 0.28,
): Tone[] {
  return [{ at, decay, frequency, gain, wave: "triangle" }];
}

/**
 * @param from - Band center at the start, in hertz
 * @param to - Band center at the end, in hertz
 * @param at - Start offset in seconds
 * @param gain - Peak gain
 * @param decay - Length in seconds
 * @returns A filtered noise sweep, for whooshes, paper, and impacts
 */
function hiss(
  from: number,
  to: number,
  at: number,
  gain: number,
  decay: number,
): Tone {
  return { at, decay, frequency: from, gain, glideTo: to, wave: "noise" };
}

const EFFECTS: Record<SoundName, Tone[]> = {
  aether: [
    {
      at: 0,
      decay: 0.35,
      frequency: NOTE.a4,
      gain: 0.08,
      glideTo: NOTE.a5,
      wave: "sine",
    },
    ...bell(NOTE.e5, 0.08, 0.08, 0.7),
    ...bell(NOTE.a5, 0.16, 0.06, 0.8),
  ],
  back: pluck(NOTE.e4, 0, 0.1),
  block: [
    { at: 0, decay: 0.18, frequency: 520, gain: 0.08, wave: "square" },
    hiss(4200, 2200, 0, 0.06, 0.12),
    ...bell(NOTE.g4, 0.02, 0.08, 0.35),
  ],
  card: [
    hiss(1800, 4200, 0, 0.07, 0.14),
    {
      at: 0,
      decay: 0.12,
      frequency: 900,
      gain: 0.04,
      glideTo: 1500,
      wave: "triangle",
    },
  ],
  climb: [
    ...pluck(NOTE.c4, 0, 0.12),
    ...pluck(NOTE.e4, 0.09, 0.12),
    ...pluck(NOTE.g4, 0.18, 0.12),
    ...bell(NOTE.c5, 0.3, 0.14, 1.2),
  ],
  coin: [
    ...bell(NOTE.e6, 0, 0.06, 0.25),
    ...bell(NOTE.c6 * 1.5, 0.05, 0.05, 0.4),
  ],
  combo: [
    ...pluck(NOTE.c5, 0, 0.1, 0.2),
    ...pluck(NOTE.e5, 0.06, 0.1, 0.2),
    ...pluck(NOTE.g5, 0.12, 0.1, 0.2),
    ...pluck(NOTE.a5, 0.18, 0.1, 0.25),
    ...bell(NOTE.c6, 0.24, 0.12, 1.1),
    hiss(2000, 8000, 0.2, 0.04, 0.5),
  ],
  confirm: [...pluck(NOTE.g4, 0, 0.12), ...bell(NOTE.c5, 0.07, 0.1, 0.6)],
  crit: [
    hiss(2600, 300, 0, 0.16, 0.22),
    {
      at: 0,
      decay: 0.5,
      frequency: 160,
      gain: 0.34,
      glideTo: 40,
      wave: "sine",
    },
    {
      at: 0.01,
      decay: 0.16,
      frequency: 420,
      gain: 0.08,
      glideTo: 110,
      wave: "square",
    },
  ],
  death: [
    hiss(900, 120, 0, 0.12, 0.6),
    {
      at: 0,
      decay: 0.7,
      frequency: 120,
      gain: 0.22,
      glideTo: 35,
      wave: "sine",
    },
    ...bell(NOTE.a3, 0.12, 0.06, 1.2),
  ],
  defeat: [
    ...bell(NOTE.a3, 0, 0.18, 1.6),
    ...bell(NOTE.e4, 0.35, 0.12, 1.4),
    ...bell(NOTE.g3, 0.8, 0.16, 2.2),
  ],
  denied: [
    {
      at: 0,
      decay: 0.18,
      frequency: 180,
      gain: 0.1,
      glideTo: 140,
      wave: "triangle",
    },
    {
      at: 0.09,
      decay: 0.16,
      frequency: 160,
      gain: 0.08,
      glideTo: 120,
      wave: "triangle",
    },
  ],
  draw: [hiss(2600, 5200, 0, 0.05, 0.09)],
  flip: [hiss(1400, 3600, 0, 0.06, 0.1), ...pluck(NOTE.g5, 0.05, 0.05, 0.15)],
  "heavy-hit": [
    hiss(1600, 200, 0, 0.12, 0.2),
    {
      at: 0,
      decay: 0.35,
      frequency: 140,
      gain: 0.3,
      glideTo: 50,
      wave: "sine",
    },
    {
      at: 0,
      decay: 0.12,
      frequency: 300,
      gain: 0.1,
      glideTo: 120,
      wave: "square",
    },
  ],
  hit: [
    hiss(1800, 400, 0, 0.08, 0.1),
    {
      at: 0,
      decay: 0.2,
      frequency: 220,
      gain: 0.2,
      glideTo: 80,
      wave: "sine",
    },
  ],
  hover: [{ at: 0, decay: 0.06, frequency: 1200, gain: 0.02, wave: "sine" }],
  merge: [
    ...bell(NOTE.c5, 0, 0.12, 0.8),
    ...bell(NOTE.e5, 0.1, 0.12, 0.8),
    ...bell(NOTE.g5, 0.2, 0.12, 0.9),
    ...bell(NOTE.c5 * 2, 0.32, 0.1, 1.4),
    hiss(1500, 9000, 0.3, 0.05, 0.9),
  ],
  pop: [
    {
      at: 0,
      decay: 0.09,
      frequency: 420,
      gain: 0.1,
      glideTo: 980,
      wave: "sine",
    },
  ],
  purchase: [
    ...bell(NOTE.d5, 0, 0.12, 0.7),
    ...bell(NOTE.a5, 0.08, 0.1, 1),
    ...bell(NOTE.e6, 0.16, 0.05, 0.6),
  ],
  reward: [...bell(NOTE.g4, 0, 0.12, 0.8), ...bell(NOTE.d5, 0.12, 0.12, 1)],
  select: pluck(NOTE.d5, 0, 0.08),
  slash: [hiss(5200, 900, 0, 0.1, 0.13)],
  sparkle: [
    ...bell(NOTE.c6, 0, 0.04, 0.4),
    ...bell(NOTE.e6, 0.05, 0.04, 0.4),
    ...bell(NOTE.g5 * 2, 0.1, 0.035, 0.5),
    ...bell(NOTE.c6 * 2, 0.15, 0.03, 0.6),
  ],
  tick: [{ at: 0, decay: 0.03, frequency: 1800, gain: 0.025, wave: "sine" }],
  turn: [...bell(NOTE.a4, 0, 0.07, 0.6), ...bell(NOTE.e5, 0.08, 0.05, 0.6)],
  victory: [
    ...bell(NOTE.c5, 0, 0.14, 1),
    ...bell(NOTE.d5, 0.14, 0.14, 1),
    ...bell(NOTE.e5, 0.28, 0.14, 1),
    ...bell(NOTE.g5, 0.42, 0.14, 1.2),
    ...bell(NOTE.c4, 0.56, 0.12, 2),
    ...bell(NOTE.c5 * 2, 0.6, 0.1, 2),
    hiss(2000, 10000, 0.55, 0.04, 1.2),
  ],
  whoosh: [hiss(500, 2600, 0, 0.08, 0.26)],
};

/** Effects that repeat quickly and are spaced out so they do not chatter. */
const RATE_LIMIT_MS: Partial<Record<SoundName, number>> = {
  draw: 35,
  hover: 70,
  tick: 45,
};

let context: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let volume = 0.6;
let muted = false;
const lastPlayedAt = new Map<SoundName, number>();

/**
 * Updates volume and mute. Takes effect on the next effect played.
 * @param options - Volume from 0 to 1, and whether sound is muted
 */
export function configureSound(options: {
  muted: boolean;
  volume: number;
}): void {
  volume = options.volume;
  muted = options.muted;
  if (master) {
    master.gain.value = muted ? 0 : volume;
  }
}

/**
 * @returns Whether effects and music may play at all
 */
export function isSoundOn(): boolean {
  return !muted && volume > 0;
}

/**
 * Returns the shared audio context and master gain, creating them on first
 * use and resuming a suspended context.
 * @returns The context and master gain, or `undefined` without Web Audio
 */
export function audioGraph():
  | { context: AudioContext; master: GainNode }
  | undefined {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return undefined;
  }
  if (!context || !master) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(context.destination);
  }
  if (context.state === "suspended") {
    void context.resume();
  }
  return { context, master };
}

/**
 * @param ctx - Audio context
 * @returns One second of white noise, made once and shared
 */
function noise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) {
    return noiseBuffer;
  }
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Schedules tones on a destination node.
 * @param ctx - Running audio context
 * @param tones - Tones to play
 * @param destination - Node the tones feed
 * @param start - Context time the first tone is measured from
 * @param pitch - Multiplier on every frequency
 */
export function scheduleTones(
  ctx: AudioContext,
  tones: Tone[],
  destination: AudioNode,
  start: number,
  pitch = 1,
): void {
  for (const tone of tones) {
    const envelope = ctx.createGain();
    const begin = start + tone.at;
    const end = begin + tone.decay;
    const peak = begin + (tone.attack ?? 0.012);
    envelope.gain.setValueAtTime(0.0001, begin);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, peak);
    envelope.gain.exponentialRampToValueAtTime(
      0.0001,
      Math.max(end, peak + 0.01),
    );
    envelope.connect(destination);
    const frequency = tone.frequency * pitch;
    const glide = tone.glideTo ? tone.glideTo * pitch : undefined;
    if (tone.wave === "noise") {
      const source = ctx.createBufferSource();
      source.buffer = noise(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(frequency, begin);
      if (glide) {
        filter.frequency.exponentialRampToValueAtTime(glide, end);
      }
      source.connect(filter);
      filter.connect(envelope);
      source.start(begin, Math.random() * 0.5);
      source.stop(end + 0.05);
      continue;
    }
    const oscillator = ctx.createOscillator();
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(frequency, begin);
    if (glide) {
      oscillator.frequency.exponentialRampToValueAtTime(glide, end);
    }
    oscillator.connect(envelope);
    oscillator.start(begin);
    oscillator.stop(end + 0.05);
  }
}

/**
 * Plays one effect. Quick, repeating effects such as hover are rate-limited
 * so sweeping the pointer across a row of buttons does not chatter.
 * @param name - Effect to play
 * @param options.pitch - Multiplier on every frequency, for variety between
 * repeats. Defaults to 1.
 */
export function playSound(name: SoundName, options?: { pitch?: number }): void {
  if (!isSoundOn()) {
    return;
  }
  const now = typeof performance === "undefined" ? 0 : performance.now();
  const limit = RATE_LIMIT_MS[name];
  if (limit !== undefined) {
    if (now - (lastPlayedAt.get(name) ?? -Infinity) < limit) {
      return;
    }
    lastPlayedAt.set(name, now);
  }
  const graph = audioGraph();
  if (graph?.context.state !== "running") {
    return;
  }
  scheduleTones(
    graph.context,
    EFFECTS[name],
    graph.master,
    graph.context.currentTime + 0.005,
    options?.pitch ?? 1,
  );
}
