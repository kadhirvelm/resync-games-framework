"use client";

import type { ListBattleBackgroundsResponse } from "@resync-game-framework/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

type BattleBackground = ListBattleBackgroundsResponse["backgrounds"][number];

interface BattleBackgroundListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListBattleBackgroundsResponse | null;
}

/**
 * Displays pending and stored battle-room backgrounds.
 * @param props - Gallery request state and generation jobs
 */
export function BattleBackgroundList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: BattleBackgroundListProps) {
  const backgrounds = result?.backgrounds ?? [];
  const [selected, setSelected] = useState<BattleBackground | null>(null);

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Library</span>
        {backgrounds.length > 0 && (
          <span className={styles.assetCount}>{backgrounds.length}</span>
        )}
      </Flex>
      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading backgrounds…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading &&
        pendingJobs.length === 0 &&
        result != null &&
        backgrounds.length === 0 && (
          <Flex className={styles.emptyState}>
            <span>No battle backgrounds yet</span>
            <span className={styles.emptyStateHint}>
              Describe a tower room to paint its battle backdrop.
            </span>
          </Flex>
        )}
      {(pendingJobs.length > 0 || backgrounds.length > 0) && (
        <div className={styles.backgroundGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {backgrounds.map((background) => (
            <button
              className={styles.backgroundCard}
              key={background.id}
              onClick={() => setSelected(background)}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img
                alt={background.title}
                className={styles.backgroundImage}
                src={background.imageUrl}
              />
              <span className={styles.backgroundTitle}>{background.title}</span>
              <span className={styles.backgroundDescription}>
                {background.description}
              </span>
            </button>
          ))}
        </div>
      )}
      <Dialog
        content={
          selected == null ? null : (
            // biome-ignore lint/performance/noImgElement: generated backend asset
            <img
              alt={selected.title}
              className={styles.backgroundDetailImage}
              src={selected.imageUrl}
            />
          )
        }
        description={selected?.description}
        isOpen={selected != null}
        onToggleOpen={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        title={selected?.title ?? "Battle background"}
        width="min(96vw, 1200px)"
      />
    </Flex>
  );
}
