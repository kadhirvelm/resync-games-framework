"use client";

import type { DungeonBlueprint, DungeonSlot } from "@towers-of-coreborn/api";
import { Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { DungeonSlotCard } from "./DungeonSlotCard";
import {
  cardsForCharacter,
  slotsStartedWith,
  spriteForCharacter,
} from "./dungeonSlotGroups";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

interface DungeonListResult {
  dungeons: DungeonBlueprint[];
}

interface DungeonListProps {
  error: string | null;
  isLoading: boolean;
  onAssociateSlot?: (
    dungeonId: string,
    slotId: string,
    assetId: string,
  ) => Promise<string | null>;
  onDismissJob: (id: string) => void;
  onGenerateSlot?: (dungeonId: string, slot: DungeonSlot) => void;
  onStopJob: (id: string) => void;
  onStopSlot?: (generationId: string, assetClassId: string) => void;
  pendingJobs: PendingJob[];
  result: DungeonListResult | null;
  slotJobs: PendingJob[];
}

/**
 * Dungeon packages saved on the backend. Each prompt can start its agent
 * or take an asset that already exists.
 * @param pendingJobs - Package planning that is still running or failed
 * @param slotJobs - Slot runs, shown on the prompt they belong to
 * @param result - Saved packages from `list`
 * @param error - List error, if any
 * @param isLoading - Whether the package list is fetching
 * @param onDismissJob - Removes a failed planning card
 * @param onStopJob - Stops a planning run
 * @param onGenerateSlot - Starts one prompt's agent
 * @param onStopSlot - Stops that agent
 * @param onAssociateSlot - Writes an existing asset into a slot
 */
export function DungeonList({
  error,
  isLoading,
  onAssociateSlot,
  onDismissJob,
  onGenerateSlot,
  onStopJob,
  onStopSlot,
  pendingJobs,
  result,
  slotJobs,
}: DungeonListProps) {
  const dungeons = result?.dungeons ?? [];
  const hasContent = pendingJobs.length > 0 || dungeons.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Dungeons</span>
        {dungeons.length > 0 && (
          <span className={styles.assetCount}>{dungeons.length}</span>
        )}
      </Flex>

      {isLoading && result === null && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading dungeons…</span>
        </Flex>
      )}
      {error !== null && <CopyableError message={error} />}
      {!isLoading && !hasContent && result !== null && (
        <Flex className={styles.emptyState}>
          <span>No dungeons yet</span>
          <span className={styles.emptyStateHint}>
            describe a place to lay out its rooms, characters, cards, and
            enemies
          </span>
        </Flex>
      )}

      {hasContent && (
        <div className={styles.dungeonList}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {dungeons.map((dungeon) => (
            <DungeonPackage
              dungeon={dungeon}
              key={dungeon.id}
              onAssociateSlot={onAssociateSlot}
              onGenerateSlot={onGenerateSlot}
              onStopSlot={onStopSlot}
              slotJobs={slotJobs}
            />
          ))}
        </div>
      )}
    </Flex>
  );
}

interface DungeonPackageProps {
  dungeon: DungeonBlueprint;
  onAssociateSlot?: DungeonListProps["onAssociateSlot"];
  onGenerateSlot?: DungeonListProps["onGenerateSlot"];
  onStopSlot?: DungeonListProps["onStopSlot"];
  slotJobs: PendingJob[];
}

/**
 * One saved package: its JSON link, then rooms, enemies, and each character
 * with that character's card prompts and battle sprite. Generating a
 * character also starts its sprite.
 * @param dungeon - Package returned by the API
 * @param slotJobs - Runs that should show as generating on their prompt
 * @param onGenerateSlot - Starts one prompt's agent
 * @param onStopSlot - Stops that agent
 * @param onAssociateSlot - Writes an existing asset into a slot
 */
function DungeonPackage({
  dungeon,
  onAssociateSlot,
  onGenerateSlot,
  onStopSlot,
  slotJobs,
}: DungeonPackageProps) {
  const rooms = dungeon.slots.filter(
    (slot) => slot.kind === "battle-background",
  );
  const enemies = dungeon.slots.filter((slot) => slot.kind === "enemy");
  const characters = dungeon.slots.filter(
    (slot) => slot.kind === "card-character",
  );
  const readyCount = dungeon.slots.filter(
    (slot) => slot.status === "ready",
  ).length;
  const generateSlot =
    onGenerateSlot === undefined
      ? undefined
      : (dungeonId: string, slot: DungeonSlot) => {
          for (const started of slotsStartedWith(slot, dungeon.slots)) {
            onGenerateSlot(dungeonId, started);
          }
        };

  return (
    <section className={styles.dungeonSetup}>
      <div className={styles.dungeonPackageHeader}>
        <p className={styles.dungeonSummary}>{dungeon.summary}</p>
        <span className={styles.promptSlotHint}>
          {readyCount} of {dungeon.slots.length} ready
        </span>
        <a
          className={styles.dungeonJsonLink}
          href={dungeon.jsonUrl}
          rel="noreferrer"
          target="_blank"
        >
          View JSON
        </a>
      </div>
      <span className={styles.dungeonGroupLabel}>Rooms</span>
      <div className={styles.backgroundGrid}>
        {rooms.map((slot) => (
          <DungeonSlotCard
            dungeonId={dungeon.id}
            key={slot.id}
            onAssociate={onAssociateSlot}
            onGenerate={generateSlot}
            onStop={onStopSlot}
            slot={slot}
            slotJob={jobForSlot(slotJobs, slot.id)}
            slots={dungeon.slots}
          />
        ))}
      </div>
      <span className={styles.dungeonGroupLabel}>Enemies</span>
      <div className={styles.enemyGrid}>
        {enemies.map((slot) => (
          <DungeonSlotCard
            dungeonId={dungeon.id}
            key={slot.id}
            onAssociate={onAssociateSlot}
            onGenerate={generateSlot}
            onStop={onStopSlot}
            slot={slot}
            slotJob={jobForSlot(slotJobs, slot.id)}
            slots={dungeon.slots}
          />
        ))}
      </div>
      {characters.map((character) => {
        const sprite = spriteForCharacter(dungeon.slots, character.id);
        return (
          <article className={styles.dungeonCharacter} key={character.id}>
            <DungeonSlotCard
              dungeonId={dungeon.id}
              onAssociate={onAssociateSlot}
              onGenerate={generateSlot}
              onStop={onStopSlot}
              slot={character}
              slotJob={jobForSlot(slotJobs, character.id)}
              slots={dungeon.slots}
            />
            {sprite !== undefined && (
              <DungeonSlotCard
                dungeonId={dungeon.id}
                onAssociate={onAssociateSlot}
                onGenerate={generateSlot}
                onStop={onStopSlot}
                slot={sprite}
                slotJob={jobForSlot(slotJobs, sprite.id)}
                slots={dungeon.slots}
              />
            )}
            <div className={styles.playableCardGrid}>
              {cardsForCharacter(dungeon.slots, character.id).map((slot) => (
                <DungeonSlotCard
                  dungeonId={dungeon.id}
                  key={slot.id}
                  onAssociate={onAssociateSlot}
                  onGenerate={generateSlot}
                  onStop={onStopSlot}
                  slot={slot}
                  slotJob={jobForSlot(slotJobs, slot.id)}
                  slots={dungeon.slots}
                />
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}

/**
 * @param jobs - In-flight slot runs
 * @param slotId - Slot to match
 * @returns The run for that slot, preferring one that is still going
 */
function jobForSlot(
  jobs: readonly PendingJob[],
  slotId: string,
): PendingJob | undefined {
  const running = jobs.find(
    (job) => job.slotId === slotId && job.error === null,
  );
  if (running !== undefined) {
    return running;
  }
  return jobs.find((job) => job.slotId === slotId);
}
