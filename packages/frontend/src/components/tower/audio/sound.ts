/**
 * Small synthesized sound effects: soft bell and plucked-string tones built
 * from Web Audio oscillators, so the game needs no audio files. Every call is
 * a no-op on the server, before the first user gesture unlocks audio, or
 * while muted.
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
  | "climb";

/** One tone inside an effect. */
interface Tone {
  /** Seconds after the effect starts */
  at: number;
  /** Seconds the tone rings */
  decay: number;
  frequency: number;
  /** Peak gain before the master volume */
  gain: number;
  /** Frequency to glide to by the end of the tone */
  glideTo?: number;
  wave: OscillatorType;
}

/** Pentatonic notes, in hertz, so stacked effects never clash. */
const NOTE = {
  a3: 220,
  a4: 440,
  a5: 880,
  c4: 261.63,
  c5: 523.25,
  d4: 293.66,
  d5: 587.33,
  e4: 329.63,
  e5: 659.25,
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
function bell(frequency: number, at: number, gain = 0.18, decay = 0.9): Tone[] {
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
 * @returns A short plucked string
 */
function pluck(frequency: number, at: number, gain = 0.14): Tone[] {
  return [{ at, decay: 0.28, frequency, gain, wave: "triangle" }];
}

const EFFECTS: Record<SoundName, Tone[]> = {
  back: pluck(NOTE.e4, 0, 0.1),
  block: [
    { at: 0, decay: 0.18, frequency: 520, gain: 0.08, wave: "square" },
    ...bell(NOTE.g4, 0.02, 0.08, 0.35),
  ],
  card: [
    {
      at: 0,
      decay: 0.12,
      frequency: 900,
      gain: 0.05,
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
  confirm: [...pluck(NOTE.g4, 0, 0.12), ...bell(NOTE.c5, 0.07, 0.1, 0.6)],
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
  ],
  "heavy-hit": [
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
  ],
  purchase: [...bell(NOTE.d5, 0, 0.12, 0.7), ...bell(NOTE.a5, 0.08, 0.1, 1)],
  reward: [...bell(NOTE.g4, 0, 0.12, 0.8), ...bell(NOTE.d5, 0.12, 0.12, 1)],
  select: pluck(NOTE.d5, 0, 0.08),
  turn: bell(NOTE.a4, 0, 0.07, 0.6),
  victory: [
    ...bell(NOTE.c5, 0, 0.14, 1),
    ...bell(NOTE.d5, 0.14, 0.14, 1),
    ...bell(NOTE.e5, 0.28, 0.14, 1),
    ...bell(NOTE.g5, 0.42, 0.14, 1.2),
    ...bell(NOTE.c4, 0.56, 0.12, 2),
    ...bell(NOTE.c5 * 2, 0.6, 0.1, 2),
  ],
};

let context: AudioContext | undefined;
let master: GainNode | undefined;
let volume = 0.6;
let muted = false;
let lastHoverAt = 0;

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
    master.gain.value = volume;
  }
}

/**
 * @returns The shared audio context, created on first use
 */
function audio(): AudioContext | undefined {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return undefined;
  }
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = volume;
    master.connect(context.destination);
  }
  if (context.state === "suspended") {
    void context.resume();
  }
  return context;
}

/**
 * Plays one effect. Hover sounds are rate-limited so sweeping the pointer
 * across a row of buttons does not chatter.
 * @param name - Effect to play
 */
export function playSound(name: SoundName): void {
  if (muted || volume <= 0) {
    return;
  }
  const now = typeof performance === "undefined" ? 0 : performance.now();
  if (name === "hover") {
    if (now - lastHoverAt < 70) {
      return;
    }
    lastHoverAt = now;
  }
  const ctx = audio();
  if (!ctx || !master || ctx.state !== "running") {
    return;
  }
  const start = ctx.currentTime + 0.005;
  for (const tone of EFFECTS[name]) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const begin = start + tone.at;
    const end = begin + tone.decay;
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequency, begin);
    if (tone.glideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(tone.glideTo, end);
    }
    envelope.gain.setValueAtTime(0.0001, begin);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, begin + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start(begin);
    oscillator.stop(end + 0.05);
  }
}
