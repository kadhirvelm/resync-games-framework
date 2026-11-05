import type { AshenGateAudioId } from "../data/layers/ashen_gate/audio";
import type { DescentAudioCatalog } from "./descentAudioCatalog";

const EFFECT_GAIN = 0.72;
const MUSIC_GAIN = 0.38;
const AMBIENCE_GAIN = 0.16;

const EFFECT_RATE_LIMIT_MS: Partial<Record<AshenGateAudioId, number>> = {
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
let scene: DescentAudioScene = {
  active: false,
  ambience: "volcanic-ambience",
  music: "hold-music",
};
const buffers = new Map<string, Promise<AudioBuffer>>();
const lastPlayedAt = new Map<AshenGateAudioId, number>();
const musicChannel: LoopChannel = { release: () => {}, token: 0, url: "" };
const ambienceChannel: LoopChannel = {
  release: () => {},
  token: 0,
  url: "",
};

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
  if (context === undefined || master === undefined) {
    context = new window.AudioContext();
    master = context.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  applyScene();
  return true;
}

/** Enables or mutes the complete Descent mix. */
export function setDescentAudioEnabled(next: boolean): void {
  enabled = next;
  if (master !== undefined) master.gain.value = next ? 1 : 0;
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
  if (!enabled || context === undefined || master === undefined) return;
  const url = catalog[id]?.audioUrl;
  if (url === undefined) return;
  const now = typeof performance === "undefined" ? 0 : performance.now();
  const limit = EFFECT_RATE_LIMIT_MS[id];
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
      source.start();
    })
    .catch(() => {
      // A missing generated file should not interrupt the simulation.
    });
}

/** Stops Descent's long-running loops when the game experience unmounts. */
export function stopDescentAudio(): void {
  scene = { ...scene, active: false };
  stopLoop(musicChannel);
  stopLoop(ambienceChannel);
}

/** Applies the latest requested scene to both loop channels. */
function applyScene(): void {
  if (
    !scene.active ||
    !enabled ||
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
