"use client";

import type { ListAudioResponse } from "@resync-game-framework/api";
import { AudioLines } from "lucide-react";
import { useMemo, useState } from "react";
import { Flex } from "@/lib/radix";
import styles from "../Assets.module.scss";
import {
  type AssetGameId,
  type AssetGameTag,
  audioGameTags,
} from "../assetGameTags";
import { CopyableError } from "../CopyableError";
import { GameFilterBar } from "../GameFilterBar";
import { GameTagList } from "../GameTagList";
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
  const [gameFilter, setGameFilter] = useState<AssetGameId | "all">("all");

  const taggedClips = useMemo(
    () =>
      clips.map((clip) => ({
        clip,
        tags: audioGameTags(clip),
      })),
    [clips],
  );

  const availableTags = useMemo(() => {
    const seen = new Map<AssetGameId, AssetGameTag>();
    for (const entry of taggedClips) {
      for (const tag of entry.tags) {
        seen.set(tag.id, tag);
      }
    }
    return [...seen.values()];
  }, [taggedClips]);

  const filteredClips = useMemo(
    () =>
      gameFilter === "all"
        ? taggedClips
        : taggedClips.filter((entry) =>
            entry.tags.some((tag) => tag.id === gameFilter),
          ),
    [gameFilter, taggedClips],
  );

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Library</span>
        {clips.length > 0 && (
          <span className={styles.assetCount}>
            {gameFilter === "all"
              ? clips.length
              : `${filteredClips.length}/${clips.length}`}
          </span>
        )}
      </Flex>
      <GameFilterBar
        activeGameId={gameFilter}
        availableTags={availableTags}
        onChange={setGameFilter}
      />
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
              Describe a room tone, an attack, a stinger, or an instrumental
              bed.
            </span>
          </Flex>
        )}
      {(pendingJobs.length > 0 || filteredClips.length > 0) && (
        <div className={styles.backgroundGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {filteredClips.map(({ clip, tags }) => (
            <AudioCard clip={clip} key={clip.id} tags={tags} />
          ))}
        </div>
      )}
    </Flex>
  );
}

/**
 * One stored clip and the words that produced it.
 * @param props.clip - Stored audio asset
 * @param props.tags - Games using this clip
 */
function AudioCard({
  clip,
  tags,
}: {
  clip: AudioClip;
  tags: readonly AssetGameTag[];
}) {
  return (
    <article className={styles.backgroundCard}>
      <span className={styles.backgroundTitle}>{clip.title}</span>
      <span className={styles.backgroundDescription}>
        {clip.role} · {clip.cue}
      </span>
      <GameTagList fallbackLabel="General" tags={tags} />
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
  medium: "both",
  subtitle: "effects, ambience, and music",
  tabLabel: "Audio",
};
