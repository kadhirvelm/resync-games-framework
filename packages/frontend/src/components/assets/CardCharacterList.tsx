"use client";

import type { ListCardCharactersResponse } from "@resync-game-framework/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

type CardCharacterSet = ListCardCharactersResponse["sets"][number];

interface CardCharacterListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListCardCharactersResponse | null;
}

/**
 * Card-character workshop list: in-flight jobs, then one row of four portraits
 * per saved character.
 * @param isLoading - Shows a loading line while the set list is fetching
 * @param result - Saved sets; null before the first response
 * @param error - List error, if any
 * @param pendingJobs - Card-character generations still running or failed
 * @param onDismissJob - Removes a failed job card
 * @param onStopJob - Stops a running generation
 */
export function CardCharacterList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: CardCharacterListProps) {
  const sets = result?.sets ?? [];
  const [detailSet, setDetailSet] = useState<CardCharacterSet | null>(null);
  const hasPending = pendingJobs.length > 0;
  const hasSets = sets.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Library</span>
        {sets.length > 0 && (
          <span className={styles.assetCount}>{sets.length}</span>
        )}
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading characters…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading && !hasPending && result != null && sets.length === 0 && (
        <Flex className={styles.emptyState}>
          <span>No card characters yet</span>
          <span className={styles.emptyStateHint}>
            Describe a character to generate four power levels.
          </span>
        </Flex>
      )}

      {(hasPending || hasSets) && (
        <div className={styles.cardSetList}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {sets.map((set) => (
            <CardCharacterSetCard
              key={set.setId}
              onOpen={setDetailSet}
              set={set}
            />
          ))}
        </div>
      )}

      <Dialog
        content={
          detailSet == null ? null : <CardCharacterSetDetail set={detailSet} />
        }
        description={detailSet?.theme}
        isOpen={detailSet != null}
        onToggleOpen={(open) => {
          if (!open) {
            setDetailSet(null);
          }
        }}
        title={detailSet?.prompt ?? "Card character"}
        width="min(96vw, 1080px)"
      />
    </Flex>
  );
}

interface CardCharacterSetCardProps {
  onOpen: (set: CardCharacterSet) => void;
  set: CardCharacterSet;
}

/**
 * One saved character: the original prompt and four level thumbnails.
 * @param set - Character set to display
 * @param onOpen - Opens the larger four-portrait view
 */
function CardCharacterSetCard({ onOpen, set }: CardCharacterSetCardProps) {
  return (
    <button
      className={styles.cardSet}
      onClick={() => {
        onOpen(set);
      }}
      type="button"
    >
      <span className={styles.cardSetPrompt} title={set.prompt}>
        {set.prompt}
      </span>
      <span className={styles.cardSetTheme}>{set.theme}</span>
      <CardCharacterLevelRow levels={set.levels} />
    </button>
  );
}

interface CardCharacterSetDetailProps {
  set: CardCharacterSet;
}

/**
 * Large view of the four power stages for one character.
 * @param set - Character set opened from the list
 */
function CardCharacterSetDetail({ set }: CardCharacterSetDetailProps) {
  return (
    <div className={styles.cardSetDetail}>
      <CardCharacterLevelRow detailed={true} levels={set.levels} />
    </div>
  );
}

interface CardCharacterLevelRowProps {
  detailed?: boolean;
  levels: CardCharacterSet["levels"];
}

/**
 * Four portraits in level order.
 * @param levels - Stages 1 through 4
 * @param detailed - Shows each stage description under the title
 */
function CardCharacterLevelRow({
  detailed = false,
  levels,
}: CardCharacterLevelRowProps) {
  return (
    <div className={styles.cardLevelRow}>
      {levels.map((level) => (
        <div className={styles.cardLevel} key={level.level}>
          <div className={styles.cardPortraitFrame}>
            {/* biome-ignore lint/performance/noImgElement: remote card portrait URL from API */}
            <img
              alt={`${level.title}, level ${level.level}`}
              className={styles.cardPortrait}
              src={level.url}
            />
          </div>
          <span className={styles.cardLevelIndex}>Level {level.level}</span>
          <span className={styles.cardLevelTitle}>{level.title}</span>
          {detailed && (
            <span className={styles.cardLevelDescription}>
              {level.description}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
