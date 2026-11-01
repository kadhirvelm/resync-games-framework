import { bell, NOTE, pluck, type Tone } from "./sound";

/** What the background music is scoring. */
export type MusicMood = "menu" | "camp" | "battle" | "boss" | "silent";

/** How one mood plays: tempo, harmony, and how busy each voice is. */
export interface MoodScore {
  /** Seconds per beat */
  beat: number;
  /** Bass pattern as offsets into [root, fifth, octave]; `-1` rests */
  bass: number[];
  /** Chance per beat that the melody plays a note */
  melodyChance: number;
  /** Beats between pad chords */
  padEvery: number;
  /** Chord roots, one per bar of `padEvery` beats */
  roots: number[];
  /** Beats between low drum thumps; 0 for none */
  thumpEvery: number;
}

/** Scores for each audible mood. Every pitch is pentatonic, so voices never clash. */
export const MOOD_SCORES: Record<Exclude<MusicMood, "silent">, MoodScore> = {
  battle: {
    bass: [0, -1, 0, 1, 0, -1, 2, 1],
    beat: 0.3,
    melodyChance: 0.22,
    padEvery: 16,
    roots: [NOTE.a2, NOTE.a2, NOTE.g2, NOTE.e3 / 2],
    thumpEvery: 4,
  },
  boss: {
    bass: [0, 0, 1, 0, 2, 0, 1, 0],
    beat: 0.26,
    melodyChance: 0.18,
    padEvery: 16,
    roots: [NOTE.d3 / 2, NOTE.d3 / 2, NOTE.c3 / 2, NOTE.a2 / 2],
    thumpEvery: 2,
  },
  camp: {
    bass: [0, -1, -1, -1, 1, -1, -1, -1],
    beat: 0.48,
    melodyChance: 0.4,
    padEvery: 8,
    roots: [NOTE.c3, NOTE.a2, NOTE.d3, NOTE.g2],
    thumpEvery: 0,
  },
  menu: {
    bass: [-1],
    beat: 0.62,
    melodyChance: 0.32,
    padEvery: 8,
    roots: [NOTE.c3, NOTE.a2, NOTE.e3, NOTE.g2],
    thumpEvery: 0,
  },
};

/** Melody notes, low to high. The melody walks along this ladder. */
export const MELODY_LADDER = [
  NOTE.c4,
  NOTE.d4,
  NOTE.e4,
  NOTE.g4,
  NOTE.a4,
  NOTE.c5,
  NOTE.d5,
  NOTE.e5,
  NOTE.g5,
  NOTE.a5,
];

/**
 * Moves the melody one small step along the ladder, staying inside it.
 * @param current - Current ladder index
 * @param roll - Random number in [0, 1)
 * @returns The next ladder index
 */
export function nextMelodyStep(current: number, roll: number): number {
  const steps = [-2, -1, -1, 1, 1, 2];
  const step = steps[Math.floor(roll * steps.length)] ?? 1;
  const next = current + step;
  if (next < 0 || next >= MELODY_LADDER.length) {
    return current - step;
  }
  return next;
}

/**
 * @param mood - Mood being played
 * @param beatIndex - Beats since the mood started
 * @param melodyIndex - Current melody ladder index
 * @param roll - Random number in [0, 1), used for melody chance
 * @returns The tones for this beat, timed from the beat's start
 */
export function tonesForBeat(
  mood: Exclude<MusicMood, "silent">,
  beatIndex: number,
  melodyIndex: number,
  roll: number,
): Tone[] {
  const score = MOOD_SCORES[mood];
  const bar = Math.floor(beatIndex / score.padEvery);
  const root = score.roots[bar % score.roots.length] ?? NOTE.c3;
  const tones: Tone[] = [];
  if (beatIndex % score.padEvery === 0) {
    const sustain = score.beat * score.padEvery * 1.25;
    for (const ratio of [1, 1.5, 2, 3]) {
      tones.push({
        at: 0,
        attack: Math.min(1.4, sustain * 0.3),
        decay: sustain,
        frequency: root * ratio,
        gain: ratio === 1 ? 0.03 : 0.018,
        wave: "sine",
      });
    }
  }
  const bassStep = score.bass[beatIndex % score.bass.length] ?? -1;
  if (bassStep >= 0) {
    const ratio = [1, 1.5, 2][bassStep] ?? 1;
    tones.push(...pluck(root * ratio, 0, 0.055, score.beat * 0.9));
  }
  if (score.thumpEvery > 0 && beatIndex % score.thumpEvery === 0) {
    tones.push({
      at: 0,
      decay: 0.28,
      frequency: 110,
      gain: mood === "boss" ? 0.12 : 0.08,
      glideTo: 42,
      wave: "sine",
    });
  }
  if (score.thumpEvery > 0 && beatIndex % 2 === 1) {
    tones.push({
      at: 0,
      decay: 0.05,
      frequency: 7000,
      gain: 0.012,
      wave: "noise",
    });
  }
  if (roll < score.melodyChance) {
    const note = MELODY_LADDER[melodyIndex] ?? NOTE.c5;
    tones.push(...bell(note, 0, 0.032, score.beat * 3));
  }
  return tones;
}

/**
 * Picks the music for what the player is looking at.
 * @param view.inClimb - Whether a climb is open
 * @param view.phase - Current run phase, during a climb
 * @param view.isBossRoom - Whether the current room is the summit
 * @returns The mood to play
 */
export function musicMoodFor(view: {
  inClimb: boolean;
  isBossRoom: boolean;
  phase?: string;
}): MusicMood {
  if (!view.inClimb) {
    return "menu";
  }
  if (view.phase === "defeat") {
    return "silent";
  }
  if (view.phase === "battle") {
    return view.isBossRoom ? "boss" : "battle";
  }
  return "camp";
}

/**
 * Picks a generated bed for a mood. The menu and a silent screen stay on
 * the synthesized score.
 * @param mood - Mood being played
 * @param music - Generated beds, when the climb has any
 * @returns The bed URL, or undefined when this mood stays synthesized
 */
export function musicTrackUrl(
  mood: MusicMood,
  music: Partial<Record<"camp" | "battle" | "boss", string>> | undefined,
): string | undefined {
  if (mood === "menu" || mood === "silent" || music === undefined) {
    return undefined;
  }
  return music[mood];
}
