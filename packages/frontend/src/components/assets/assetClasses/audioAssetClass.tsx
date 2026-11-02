"use client";

import type { ListAudioResponse } from "@resync-game-framework/api";
import { AudioLines } from "lucide-react";
import { Flex } from "@/lib/radix";
import styles from "../Assets.module.scss";
import { CopyableError } from "../CopyableError";
import { type PendingJob, PendingJobCard } from "../PendingJobCard";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

type AudioClip = ListAudioResponse["clips"][number];

/**
 * Displays pending and stored audio clips, with a player on each one.
 * @param props - Gallery request state and generation jobs
 */
function AudioList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListAudioResponse | null;
}) {
  const clips = result?.clips ?? [];
  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Audio</span>
        {clips.length > 0 && (
          <span className={styles.assetCount}>{clips.length}</span>
        )}
      </Flex>
      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading audio…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading &&
        pendingJobs.length === 0 &&
        result != null &&
        clips.length === 0 && (
          <Flex className={styles.emptyState}>
            <span>No audio yet</span>
            <span className={styles.emptyStateHint}>
              describe a room tone, an attack, a stinger, or an instrumental bed
            </span>
          </Flex>
        )}
      {(pendingJobs.length > 0 || clips.length > 0) && (
        <div className={styles.backgroundGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {clips.map((clip) => (
            <AudioCard clip={clip} key={clip.id} />
          ))}
        </div>
      )}
    </Flex>
  );
}

/**
 * One stored clip and the words that produced it.
 * @param props.clip - Stored audio asset
 */
function AudioCard({ clip }: { clip: AudioClip }) {
  return (
    <article className={styles.backgroundCard}>
      <span className={styles.backgroundTitle}>{clip.title}</span>
      <span className={styles.backgroundDescription}>
        {clip.role} · {clip.cue}
      </span>
      {/* biome-ignore lint/a11y/useMediaCaption: generated game audio has no speech track */}
      <audio
        className={styles.promptSlotAudio}
        controls={true}
        preload="none"
        src={clip.audioUrl}
      />
    </article>
  );
}

const AudioGallery = createAssetClassGallery({
  list: (callers) => callers.audio.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <AudioList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

export const AUDIO_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) => callers.audio.cancel({ generationId }),
  category: "Sound",
  dialogDescription:
    "Describe a sound. We'll render one clip: a short effect, a looping room tone, or an instrumental bed.",
  dialogTitle: "Generate audio",
  form: {
    hint: "Needs ELEVENLABS_API_KEY on the backend. Name the gesture, the space, and whether it loops. Interface clicks stay synthesized.",
    placeholder:
      "e.g. a one-shot iron bell struck underwater, no music and no voice",
    promptLabel: "Describe the sound",
    submitLabel: "Generate audio",
  },
  Gallery: AudioGallery,
  generate: (callers, prompt, generationId) =>
    callers.audio.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate audio",
  Icon: AudioLines,
  id: "audio",
  subtitle: "effects, ambience, and music",
  tabLabel: "Audio",
};
