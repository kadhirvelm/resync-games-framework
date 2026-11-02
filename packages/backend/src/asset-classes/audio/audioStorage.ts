import { createAssetClassStorage } from "../shared/assetClassStorage";

/** Generated clips live under `public/audio/<id>/`. */
export const AUDIO_STORAGE = createAssetClassStorage("audio");

/** Mp3 written for one clip. */
export const AUDIO_FILE_NAME = "audio.mp3";

/** Manifest written beside the mp3. */
export const AUDIO_MANIFEST_FILE_NAME = "manifest.json";
