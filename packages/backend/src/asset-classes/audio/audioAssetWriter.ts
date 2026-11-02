import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type { AudioCue, AudioRole } from "@resync-game-framework/api";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import {
  AUDIO_FILE_NAME,
  AUDIO_MANIFEST_FILE_NAME,
  AUDIO_STORAGE,
} from "./audioStorage";

/** One rendered clip waiting to be published. */
export interface GeneratedAudioFile {
  cue: AudioCue;
  design: string;
  durationSeconds: number;
  filePath: string;
  loop: boolean;
  role: AudioRole;
  title: string;
}

/**
 * Stores the mp3 returned by the generate-audio tool.
 */
@Injectable()
export class AudioAssetWriter {
  /**
   * Copies a generate-audio result into the audio folder and writes its manifest.
   * The temp file is removed after the copy, including when saving fails.
   * @param params - The rendered clip and the original request
   * @returns The saved clip id
   */
  public async save(params: {
    audio: GeneratedAudioFile;
    id: string;
    sourcePrompt: string;
  }): Promise<{ id: string }> {
    const { id } = params;
    const directory = AUDIO_STORAGE.filePath(id);
    try {
      await writeAssetDirectoryAtomically(directory, async (pending) => {
        const bytes = await readFile(params.audio.filePath);
        await writeFile(join(pending, AUDIO_FILE_NAME), bytes);
        await writeFile(
          join(pending, AUDIO_MANIFEST_FILE_NAME),
          JSON.stringify(
            {
              createdAt: new Date().toISOString(),
              cue: params.audio.cue,
              design: params.audio.design,
              durationSeconds: params.audio.durationSeconds,
              id,
              loop: params.audio.loop,
              prompt: params.sourcePrompt,
              role: params.audio.role,
              title: params.audio.title,
              vendor: "elevenlabs",
            },
            null,
            2,
          ),
        );
      });
      return { id };
    } finally {
      await deleteAudioFile(params.audio.filePath);
    }
  }
}

/**
 * Removes a temp audio file. A missing file is ignored.
 * @param filePath - Temp mp3 from the generate-audio tool
 */
export async function deleteAudioFile(filePath: string): Promise<void> {
  if (filePath === "") {
    return;
  }
  await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") {
      throw error;
    }
  });
}
