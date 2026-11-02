"use client";

import type {
  EnemyAsset,
  ListEnemiesResponse,
} from "@resync-game-framework/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { EnemyPatternDetail, EnemyPatternSummary } from "./EnemyPattern";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

interface EnemyListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListEnemiesResponse | null;
}

/**
 * Enemy workshop list: in-flight jobs, then one portrait per saved enemy.
 * @param isLoading - Shows a loading line while the enemy list is fetching
 * @param result - Saved enemies; null before the first response
 * @param error - List error, if any
 * @param pendingJobs - Enemy generations still running or failed
 * @param onDismissJob - Removes a failed job card
 * @param onStopJob - Stops a running generation
 */
export function EnemyList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: EnemyListProps) {
  const enemies = result?.enemies ?? [];
  const [selected, setSelected] = useState<EnemyAsset | null>(null);
  const hasPending = pendingJobs.length > 0;
  const hasEnemies = enemies.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Enemies</span>
        {enemies.length > 0 && (
          <span className={styles.assetCount}>{enemies.length}</span>
        )}
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading enemies…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading && !hasPending && result != null && enemies.length === 0 && (
        <Flex className={styles.emptyState}>
          <span>No enemies yet</span>
          <span className={styles.emptyStateHint}>
            describe a creature to paint it facing the player
          </span>
        </Flex>
      )}

      {(hasPending || hasEnemies) && (
        <div className={styles.enemyGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {enemies.map((enemy) => (
            <button
              className={styles.enemyCard}
              key={enemy.id}
              onClick={() => setSelected(enemy)}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img
                alt={enemy.title}
                className={styles.enemyPortrait}
                src={enemy.imageUrl}
              />
              <span className={styles.enemyHeader}>
                <span className={styles.enemyTitle}>{enemy.title}</span>
                <span className={styles.enemyHealth}>
                  {enemy.maxHitPoints} HP
                </span>
              </span>
              <span className={styles.enemyDescription}>
                {enemy.description}
              </span>
              {enemy.pattern.length > 0 && (
                <EnemyPatternSummary pattern={enemy.pattern} />
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog
        content={
          selected == null ? null : (
            <>
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img
                alt={selected.title}
                className={styles.enemyDetail}
                src={selected.imageUrl}
              />
              {selected.pattern.length > 0 && (
                <EnemyPatternDetail pattern={selected.pattern} />
              )}
            </>
          )
        }
        description={selected?.description}
        isOpen={selected != null}
        onToggleOpen={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        title={selected?.title ?? "Enemy"}
        width="min(96vw, 720px)"
      />
    </Flex>
  );
}
