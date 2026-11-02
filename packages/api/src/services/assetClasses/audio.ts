import type { ServiceDefinition } from "../../genericTypes/service";
import {
  ASSET_CLASS_ENDPOINTS,
  type AssetClassServiceApi,
} from "./assetClassService";

/** What kind of clip ElevenLabs should render. */
export const AUDIO_ROLES = ["effect", "ambience", "music"] as const;

/** One role an audio clip can take. */
export type AudioRole = (typeof AUDIO_ROLES)[number];

/**
 * Where a clip is used in a climb.
 * Effects and ambience stay short. Music cues are instrumental beds.
 */
export const AUDIO_CUES = [
  "attack",
  "room",
  "camp",
  "battle",
  "boss",
  "victory",
  "defeat",
  "reward",
] as const;

/** One place a clip is played during a climb. */
export type AudioCue = (typeof AUDIO_CUES)[number];

/** Seconds ElevenLabs is asked to render for each cue. */
export const AUDIO_CUE_SECONDS: Record<AudioCue, number> = {
  attack: 1.5,
  battle: 30,
  boss: 30,
  camp: 30,
  defeat: 4,
  reward: 2.5,
  room: 12,
  victory: 4,
};

/** One generated clip ready for a climb. */
export interface AudioAsset {
  /** Absolute URL of the mp3. */
  audioUrl: string;
  /** When this clip was generated. */
  createdAt: string;
  /** Where the climb plays it. */
  cue: AudioCue;
  /** Sound-design prompt sent to ElevenLabs. */
  design: string;
  /** Rendered length in seconds. */
  durationSeconds: number;
  /** Stable folder id under `/static/audio`. */
  id: string;
  /** Whether playback should repeat the file. */
  loop: boolean;
  /** Original request from the workshop or dungeon slot. */
  prompt: string;
  role: AudioRole;
  /** Short display name. */
  title: string;
  /** Vendor that rendered the file. */
  vendor: "elevenlabs";
}

export interface ListAudioResponse {
  /** Newest clips first. */
  clips: AudioAsset[];
}

/** Audio clips: one prompt becomes one ElevenLabs mp3. */
export type AudioServiceApi = AssetClassServiceApi<
  AudioAsset,
  ListAudioResponse
>;

export const AudioServiceDefinition: ServiceDefinition<AudioServiceApi> = {
  controller: "audio",
  endpoints: ASSET_CLASS_ENDPOINTS,
};
