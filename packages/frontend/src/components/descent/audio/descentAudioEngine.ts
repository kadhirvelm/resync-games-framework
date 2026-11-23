import type { AshenGateAudioId } from "../data/layers/ashen_gate/audio";
import type { DescentAudioCatalog } from "./descentAudioCatalog";

const EFFECT_GAIN = 0.72;
const MUSIC_GAIN = 0.38;
const AMBIENCE_GAIN = 0.16;

const EFFECT_RATE_LIMIT_MS: Partial<Record<AshenGateAudioId, number>> = {
  "boss-taunt": 500,
  "combat-impact": 90,
  "magic-attack": 130,
  "melee-attack": 110,
  "projectile-attack": 130,
  "soldier-born": 250,
  "unit-death": 180,
  "villager-born": 250,
};

interface LoopChannel {
  release: () => void;
  token: number;
  url: string;
}

interface DescentAudioScene {
  active: boolean;
  ambience: AshenGateAudioId;
  music: AshenGateAudioId;
}

let catalog: DescentAudioCatalog = {};
let context: AudioContext | undefined;
let master: GainNode | undefined;
let enabled = true;
let backgrounded = false;
let visibilityAttached = false;
let scene: DescentAudioScene = {
  active: false,
  ambience: "volcanic-ambience",
  music: "hold-music",
};
const buffers = new Map<string, Promise<AudioBuffer>>();
const lastPlayedAt = new Map<AshenGateAudioId, number>();
const stateListeners = new Set<(state: AudioContextState) => void>();
const musicChannel: LoopChannel = { release: () => {}, token: 0, url: "" };
const ambienceChannel: LoopChannel = {
  release: () => {},
  token: 0,
  url: "",
};

/**
 * Reports whether the browser audio context is currently running.
 * @returns True when an AudioContext exists and its state is `"running"`
 */
export function isDescentAudioRunning(): boolean {
  return context?.state === "running";
}

/**
 * Subscribes to AudioContext state transitions so gesture unlock listeners can
 * detach once running and re-arm if the browser later suspends audio.
 * @param listener - Invoked with the new AudioContext state
 * @returns Cleanup function that removes the listener
 */
export function subscribeDescentAudioStateChange(
  listener: (state: AudioContextState) => void,
): () => void {
  stateListeners.add(listener);
  return () => {
    stateListeners.delete(listener);
  };
}

/** Notifies subscribers of the current AudioContext state. */
function notifyStateChange(state: AudioContextState): void {
  for (const listener of stateListeners) listener(state);
}

/** Synchronizes master gain with the enabled and backgrounded flags. */
function syncMasterGain(): void {
  if (master === undefined) return;
  master.gain.value = enabled && !backgrounded ? 1 : 0;
}

/**
 * Resumes a suspended AudioContext and applies the active scene once running.
 * Autoplay rejections outside a valid user gesture are caught cleanly.
 * @param audioContext - Context to resume
 */
function resumeContext(audioContext: AudioContext): void {
  void audioContext
    .resume()
    .then(() => {
      if (context !== audioContext) return;
      notifyStateChange(audioContext.state);
      if (audioContext.state === "running") {
        applyScene();
      }
    })
    .catch(() => {
      // Autoplay policy may reject resume until a valid user gesture arrives.
    });
}

/** Handles browser tab visibility changes for the active Descent session. */
function handleVisibilityChange(): void {
  if (typeof document === "undefined") return;
  setDescentAudioBackgrounded(document.hidden);
}

/** Attaches the document visibility listener once per active session. */
function ensureVisibilityListener(): void {
  if (visibilityAttached || typeof document === "undefined") return;
  visibilityAttached = true;
  backgrounded = document.hidden;
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

/** Detaches the document visibility listener when Descent unmounts. */
function removeVisibilityListener(): void {
  if (!visibilityAttached || typeof document === "undefined") return;
  visibilityAttached = false;
  document.removeEventListener("visibilitychange", handleVisibilityChange);
}

/**
 * Suspends and mutes audio when the browser tab is hidden, and resumes when
 * visible again if audio is enabled and the session is active.
 * @param hidden - Whether the document is currently hidden
 */
export function setDescentAudioBackgrounded(hidden: boolean): void {
  backgrounded = hidden;
  syncMasterGain();
  if (hidden) {
    if (context !== undefined && context.state === "running") {
      void context.suspend().catch(() => {
        // Ignore suspend failures when the context is already closing.
      });
    }
    return;
  }
  if (!enabled || !scene.active || context === undefined) return;
  if (context.state === "suspended") {
    resumeContext(context);
    return;
  }
  applyScene();
}

/** Installs newly listed clips and retries the requested loops. */
export function installDescentAudioCatalog(next: DescentAudioCatalog): void {
  catalog = next;
  applyScene();
}

/**
 * Creates or resumes the browser audio graph after a user gesture.
 * @returns Whether Web Audio is available
 */
export function unlockDescentAudio(): boolean {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return false;
  }
  ensureVisibilityListener();
  if (context === undefined || master === undefined) {
    const nextContext = new window.AudioContext();
    context = nextContext;
    master = nextContext.createGain();
    syncMasterGain();
    master.connect(nextContext.destination);
    nextContext.addEventListener?.("statechange", () => {
      if (context === nextContext) {
        notifyStateChange(nextContext.state);
      }
    });
  }
  if (context.state === "suspended" && !backgrounded) {
    resumeContext(context);
  }
  applyScene();
  return true;
}

/** Enables or mutes the complete Descent mix. */
export function setDescentAudioEnabled(next: boolean): void {
  enabled = next;
  if (next) {
    unlockDescentAudio();
  }
  syncMasterGain();
  applyScene();
}

/** Requests the music and ambience appropriate for the current encounter. */
export function setDescentAudioScene(next: DescentAudioScene): void {
  scene = next;
  applyScene();
}

/**
 * Plays one generated Descent effect when audio is unlocked and enabled.
 * @param id - Stable clip id from the Ashen Gate manifest
 * @param gain - Optional per-call level before the master mix
 */
export function playDescentAudio(
  id: AshenGateAudioId,
  gain = EFFECT_GAIN,
): void {
  if (
    !enabled ||
    backgrounded ||
    context === undefined ||
    master === undefined
  ) {
    return;
  }
  const url = catalog[id]?.audioUrl;
  if (url === undefined) return;
  const now = typeof performance === "undefined" ? 0 : performance.now();
  const limit = playbackRateLimit(id);
  if (
    limit !== undefined &&
    now - (lastPlayedAt.get(id) ?? -Infinity) < limit
  ) {
    return;
  }
  lastPlayedAt.set(id, now);
  const audioContext = context;
  const destination = master;
  void loadBuffer(audioContext, url)
    .then((buffer) => {
      if (!enabled) return;
      const source = audioContext.createBufferSource();
      const amplifier = audioContext.createGain();
      source.buffer = buffer;
      amplifier.gain.value = gain;
      source.connect(amplifier);
      amplifier.connect(destination);
      source.onended = () => {
        source.disconnect();
        amplifier.disconnect();
      };
      source.start();
    })
    .catch(() => {
      // A missing generated file should not interrupt the simulation.
    });
}

/**
 * Limits duplicate acknowledgements from double-click selection gestures while
 * retaining the combat mix's existing per-effect limits.
 * @param id - Stable clip id from the Ashen Gate manifest
 * @returns Minimum milliseconds between plays, or undefined when unrestricted
 */
function playbackRateLimit(id: AshenGateAudioId): number | undefined {
  const configured = EFFECT_RATE_LIMIT_MS[id];
  if (configured !== undefined) return configured;
  if (id.endsWith("-select")) return 350;
  if (id.endsWith("-command")) return 120;
  return undefined;
}

/** Stops Descent's long-running loops when the game experience unmounts. */
export function stopDescentAudio(): void {
  scene = { ...scene, active: false };
  backgrounded = false;
  removeVisibilityListener();
  stopLoop(musicChannel);
  stopLoop(ambienceChannel);
}

/** Applies the latest requested scene to both loop channels. */
function applyScene(): void {
  if (
    !scene.active ||
    !enabled ||
    backgrounded ||
    context === undefined ||
    master === undefined
  ) {
    stopLoop(musicChannel);
    stopLoop(ambienceChannel);
    return;
  }
  startLoop(musicChannel, scene.music, MUSIC_GAIN);
  startLoop(ambienceChannel, scene.ambience, AMBIENCE_GAIN);
}

/**
 * Starts one decoded loop unless that URL is already requested.
 * @param channel - Music or ambience channel state
 * @param id - Generated clip id
 * @param gain - Channel level
 */
function startLoop(
  channel: LoopChannel,
  id: AshenGateAudioId,
  gain: number,
): void {
  const url = catalog[id]?.audioUrl ?? "";
  if (channel.url === url) return;
  stopLoop(channel);
  if (url === "" || context === undefined || master === undefined) return;
  channel.url = url;
  channel.token += 1;
  const token = channel.token;
  const audioContext = context;
  const destination = master;
  void loadBuffer(audioContext, url)
    .then((buffer) => {
      if (channel.token !== token || channel.url !== url) return;
      const source = audioContext.createBufferSource();
      const amplifier = audioContext.createGain();
      source.buffer = buffer;
      source.loop = true;
      amplifier.gain.value = gain;
      source.connect(amplifier);
      amplifier.connect(destination);
      source.start();
      channel.release = () => {
        try {
          source.stop();
        } catch {
          // The source already ended.
        }
        source.disconnect();
        amplifier.disconnect();
      };
    })
    .catch(() => {
      if (channel.token === token) channel.url = "";
    });
}

/** Stops and invalidates one requested loop. */
function stopLoop(channel: LoopChannel): void {
  channel.token += 1;
  channel.url = "";
  channel.release();
  channel.release = () => {};
}

/** Fetches and decodes a generated clip once per browser session. */
function loadBuffer(
  audioContext: AudioContext,
  url: string,
): Promise<AudioBuffer> {
  const cached = buffers.get(url);
  if (cached !== undefined) return cached;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Audio ${response.status}`);
      return response.arrayBuffer();
    })
    .then((bytes) => audioContext.decodeAudioData(bytes));
  buffers.set(url, pending);
  pending.catch(() => buffers.delete(url));
  return pending;
}
