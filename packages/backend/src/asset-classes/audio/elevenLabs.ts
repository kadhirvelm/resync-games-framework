import {
  AUDIO_CUE_SECONDS,
  type AudioCue,
  type AudioRole,
} from "@resync-game-framework/api";

const ELEVENLABS_ORIGIN = "https://api.elevenlabs.io";
/** mp3 at 128kbps, available without a higher ElevenLabs tier. */
const OUTPUT_FORMAT = "mp3_44100_128";
const MIN_BYTES = 1000;

/** One render request for the ElevenLabs client. */
export interface ElevenLabsRequest {
  cue: AudioCue;
  /** Sound-design text. Music uses it as the song prompt. */
  prompt: string;
  role: AudioRole;
}

/** The HTTP call the client will make. */
export interface ElevenLabsCall {
  body: Record<string, unknown>;
  url: string;
}

/** Bytes returned by a successful render. */
export interface ElevenLabsAudio {
  bytes: Uint8Array;
  contentType: string;
}

/**
 * Builds the ElevenLabs request for one cue.
 * Music is instrumental. Ambience asks for a seamless loop. Effects are one shots.
 * @param request - Role, cue, and sound-design prompt
 * @returns The URL and JSON body
 */
export function elevenLabsCall(request: ElevenLabsRequest): ElevenLabsCall {
  const seconds = AUDIO_CUE_SECONDS[request.cue];
  if (request.role === "music") {
    return {
      body: {
        force_instrumental: true,
        model_id: "music_v1",
        music_length_ms: clamp(Math.round(seconds * 1000), 3000, 600_000),
        prompt: request.prompt,
      },
      url: `${ELEVENLABS_ORIGIN}/v1/music?output_format=${OUTPUT_FORMAT}`,
    };
  }
  return {
    body: {
      duration_seconds: clamp(seconds, 0.5, 30),
      loop: request.role === "ambience",
      model_id: "eleven_text_to_sound_v2",
      prompt_influence: 0.5,
      text: request.prompt,
    },
    url: `${ELEVENLABS_ORIGIN}/v1/sound-generation?output_format=${OUTPUT_FORMAT}`,
  };
}

/**
 * Renders one clip.
 * @param apiKey - ElevenLabs API key
 * @param request - Role, cue, and sound-design prompt
 * @param fetchImpl - Fetch implementation, replaced in tests
 * @param signal - Cancels the provider call
 * @returns The mp3 bytes
 * @throws Error when the key is missing, the provider rejects the call, or the body is not audio
 */
export async function requestElevenLabsAudio(
  apiKey: string,
  request: ElevenLabsRequest,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ElevenLabsAudio> {
  const key = apiKey.trim();
  if (key === "") {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it to the backend environment to generate audio.",
    );
  }
  const call = elevenLabsCall(request);
  const response = await fetchImpl(call.url, {
    body: JSON.stringify(call.body),
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
    },
    method: "POST",
    signal,
  });
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || type.includes("json") || type.startsWith("text/")) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(
      `ElevenLabs returned ${response.status}${detail === "" ? "" : `: ${detail}`}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < MIN_BYTES) {
    throw new Error("ElevenLabs returned an empty audio file.");
  }
  return { bytes, contentType: type === "" ? "audio/mpeg" : type };
}

/**
 * @param value - Number to keep inside a range
 * @param min - Lowest allowed value
 * @param max - Highest allowed value
 * @returns The value limited to that range
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
