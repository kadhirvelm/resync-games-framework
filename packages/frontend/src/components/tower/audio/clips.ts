import { audioGraph, isSoundOn } from "./sound";

/** Level of a one-shot under the master volume. */
const CLIP_GAIN = 0.7;
/** Level of a room loop under the music. */
export const AMBIENCE_GAIN = 0.18;

const buffers = new Map<string, Promise<AudioBuffer>>();

/**
 * @param enemies - Enemies currently in the battle
 * @param sourceId - Unit that landed the blow
 * @returns That enemy's attack clip, when it has one
 */
export function attackSoundUrl(
  enemies: readonly { attackSoundUrl?: string; id: string }[],
  sourceId: string,
): string | undefined {
  return enemies.find((enemy) => enemy.id === sourceId)?.attackSoundUrl;
}

/**
 * Plays a generated clip through the shared master gain.
 * A missing file or a muted game plays nothing.
 * @param url - Absolute mp3 URL
 * @param gain - Peak gain before the master volume
 */
export async function playClip(url: string, gain = CLIP_GAIN): Promise<void> {
  const graph = audioGraph();
  if (!graph || !isSoundOn() || url === "") {
    return;
  }
  const buffer = await loadBuffer(graph.context, url);
  const source = graph.context.createBufferSource();
  source.buffer = buffer;
  const amp = graph.context.createGain();
  amp.gain.value = gain;
  source.connect(amp);
  amp.connect(graph.master);
  source.start();
}

/**
 * Starts a looping clip into a node and returns the way to stop it.
 * @param url - Absolute mp3 URL
 * @param destination - Node the loop connects to
 * @param gain - Gain before that node
 * @returns A stop function, or undefined when audio cannot start
 */
export async function connectLoop(
  url: string,
  destination: AudioNode,
  gain: number,
): Promise<(() => void) | undefined> {
  const graph = audioGraph();
  if (!graph || url === "") {
    return undefined;
  }
  const buffer = await loadBuffer(graph.context, url);
  const source = graph.context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const amp = graph.context.createGain();
  amp.gain.value = gain;
  source.connect(amp);
  amp.connect(destination);
  source.start();
  return () => {
    try {
      source.stop();
    } catch {
      // The source already ended.
    }
    source.disconnect();
    amp.disconnect();
  };
}

/**
 * Decodes a clip once and reuses the buffer.
 * @param context - Running audio context
 * @param url - Absolute mp3 URL
 * @returns The decoded buffer
 */
function loadBuffer(context: AudioContext, url: string): Promise<AudioBuffer> {
  const cached = buffers.get(url);
  if (cached) {
    return cached;
  }
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Audio ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then((bytes) => context.decodeAudioData(bytes));
  buffers.set(url, pending);
  pending.catch(() => {
    buffers.delete(url);
  });
  return pending;
}
