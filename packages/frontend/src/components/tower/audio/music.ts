import { connectLoop } from "./clips";
import {
  MELODY_LADDER,
  MOOD_SCORES,
  type MusicMood,
  nextMelodyStep,
  tonesForBeat,
} from "./musicScore";
import { audioGraph, isSoundOn, scheduleTones } from "./sound";

/** Seconds of music scheduled ahead of the audio clock. */
const LOOKAHEAD_SECONDS = 0.35;
/** How often the scheduler wakes, in milliseconds. */
const TICK_MS = 100;
/** Music level under the effects, before the master volume. */
const MUSIC_LEVEL = 0.55;
const FADE_OUT_SECONDS = 0.6;
const FADE_IN_SECONDS = 1.6;
const MOOD_DIP_SECONDS = 0.3;

let bus: GainNode | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let mood: MusicMood = "silent";
let enabled = false;
let unlocked = false;
let nextBeatAt = 0;
let beatIndex = 0;
let melodyIndex = Math.floor(MELODY_LADDER.length / 2);
let requestedTrack = "";
let loadingTrack = "";
let releaseTrack = () => {};

/**
 * @returns The music bus, created on the shared graph after audio unlocks
 */
function musicBus(): { bus: GainNode; context: AudioContext } | undefined {
  if (!unlocked) {
    return undefined;
  }
  const graph = audioGraph();
  if (!graph) {
    return undefined;
  }
  if (!bus) {
    bus = graph.context.createGain();
    bus.gain.value = 0.0001;
    bus.connect(graph.master);
  }
  return { bus, context: graph.context };
}

/**
 * Schedules every beat that falls inside the lookahead window.
 */
function tick(): void {
  const graph = musicBus();
  if (!graph || mood === "silent") {
    return;
  }
  const { context } = graph;
  const hidden = typeof document !== "undefined" && document.hidden;
  if (context.state !== "running" || hidden || !isSoundOn()) {
    nextBeatAt = context.currentTime + 0.1;
    return;
  }
  if (nextBeatAt < context.currentTime) {
    nextBeatAt = context.currentTime + 0.05;
  }
  const score = MOOD_SCORES[mood];
  while (nextBeatAt < context.currentTime + LOOKAHEAD_SECONDS) {
    const roll = Math.random();
    if (roll < score.melodyChance) {
      melodyIndex = nextMelodyStep(melodyIndex, Math.random());
    }
    scheduleTones(
      context,
      tonesForBeat(mood, beatIndex, melodyIndex, roll),
      graph.bus,
      nextBeatAt,
    );
    nextBeatAt += score.beat;
    beatIndex += 1;
  }
}

/**
 * Ramps the music bus to a level, optionally dipping to silence first.
 * @param level - Target gain
 * @param seconds - Ramp length
 * @param dipSeconds - Seconds to fade out before rising, or 0 for none
 */
function fadeTo(level: number, seconds: number, dipSeconds = 0): void {
  const graph = musicBus();
  if (!graph) {
    return;
  }
  const { gain } = graph.bus;
  const now = graph.context.currentTime;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(Math.max(0.0001, gain.value), now);
  if (dipSeconds > 0) {
    gain.exponentialRampToValueAtTime(0.0001, now + dipSeconds);
  }
  gain.exponentialRampToValueAtTime(
    Math.max(0.0001, level),
    now + dipSeconds + seconds,
  );
}

/**
 * Starts the scheduler if music should be playing, or fades and stops it.
 * @param dip - Whether to dip to silence first, for a change of mood
 */
function apply(dip = false): void {
  const audible = enabled && mood !== "silent";
  if (!audible) {
    haltTrack();
    fadeTo(0.0001, FADE_OUT_SECONDS);
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    return;
  }
  fadeTo(MUSIC_LEVEL, FADE_IN_SECONDS, dip ? MOOD_DIP_SECONDS : 0);
  if (requestedTrack !== "") {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
    const graph = musicBus();
    if (graph) {
      playTrack(requestedTrack, graph.bus);
    }
    return;
  }
  haltTrack();
  if (!timer) {
    timer = setInterval(tick, TICK_MS);
  }
}

/**
 * Starts a generated bed on the music bus. A request for the bed already
 * playing does nothing. A later request stops the earlier file when it arrives.
 * @param url - Absolute mp3 URL
 * @param destination - Music bus
 */
function playTrack(url: string, destination: AudioNode): void {
  if (requestedTrack !== url || loadingTrack === url) {
    return;
  }
  loadingTrack = url;
  const playing = url;
  void connectLoop(url, destination, 1).then((stop) => {
    if (requestedTrack !== playing) {
      if (loadingTrack === playing) {
        loadingTrack = "";
      }
      stop?.();
      return;
    }
    releaseTrack();
    releaseTrack = () => {
      stop?.();
      loadingTrack = "";
    };
  });
}

/** Stops a generated bed so the synthesized score can take over. */
function haltTrack(): void {
  requestedTrack = "";
  loadingTrack = "";
  releaseTrack();
  releaseTrack = () => {};
}

/**
 * Marks audio as unlocked by a user gesture, so the music may start.
 */
export function unlockMusic(): void {
  if (unlocked) {
    return;
  }
  unlocked = true;
  apply();
}

/**
 * Sets what the music plays. A new mood or a new generated bed dips the
 * music, then starts the new score. A mood with a track URL plays that file
 * in a loop. A mood without one keeps the synthesized score.
 * @param next.enabled - Whether music is on in settings
 * @param next.mood - Mood to score
 * @param next.trackUrl - Generated bed for this mood, when the climb has one
 */
export function setMusic(next: {
  enabled: boolean;
  mood: MusicMood;
  trackUrl?: string;
}): void {
  const nextTrack = next.trackUrl ?? "";
  const moodChanged = next.mood !== mood;
  const trackChanged = nextTrack !== requestedTrack;
  enabled = next.enabled;
  if (moodChanged || trackChanged) {
    if (moodChanged) {
      mood = next.mood;
      beatIndex = 0;
    }
    requestedTrack = nextTrack;
    const graph = musicBus();
    if (graph) {
      nextBeatAt = graph.context.currentTime + MOOD_DIP_SECONDS;
    }
  }
  apply(moodChanged || trackChanged);
}
