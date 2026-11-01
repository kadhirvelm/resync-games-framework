"use client";

import type {
  ListSpriteSheetsResponse,
  SpriteSheetAsset,
} from "@towers-of-coreborn/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";
import { SpriteAnimationPlayer } from "./SpriteAnimationPlayer";

/** Frame height on gallery cards. */
const CARD_FRAME_HEIGHT = 168;

/** Frame height in the detail dialog. */
const DETAIL_FRAME_HEIGHT = 200;

interface SpriteSheetListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListSpriteSheetsResponse | null;
}

/**
 * Sprite-sheet workshop list: in-flight jobs, then one card per saved sheet
 * playing its idle loop. Opening a card plays every animation separately.
 * @param isLoading - Shows a loading line while the list is fetching
 * @param result - Saved sprite sheets; null before the first response
 * @param error - List error, if any
 * @param pendingJobs - Sprite-sheet generations still running or failed
 * @param onDismissJob - Removes a failed job card
 * @param onStopJob - Stops a running generation
 */
export function SpriteSheetList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: SpriteSheetListProps) {
  const spriteSheets = result?.spriteSheets ?? [];
  const [selected, setSelected] = useState<SpriteSheetAsset | null>(null);
  const hasPending = pendingJobs.length > 0;
  const hasSheets = spriteSheets.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Sprite sheets</span>
        {hasSheets && (
          <span className={styles.assetCount}>{spriteSheets.length}</span>
        )}
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading sprite sheets…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading && !hasPending && result != null && !hasSheets && (
        <Flex className={styles.emptyState}>
          <span>No sprite sheets yet</span>
          <span className={styles.emptyStateHint}>
            describe a character to animate its idle, attack, defend, and hurt
          </span>
        </Flex>
      )}

      {(hasPending || hasSheets) && (
        <div className={styles.spriteSheetGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {spriteSheets.map((sheet) => (
            <SpriteSheetCard
              key={sheet.id}
              onSelect={() => setSelected(sheet)}
              sheet={sheet}
            />
          ))}
        </div>
      )}

      <Dialog
        content={
          selected == null ? null : <SpriteSheetDetail sheet={selected} />
        }
        description={selected?.description}
        isOpen={selected != null}
        onToggleOpen={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        title={selected?.title ?? "Sprite sheet"}
        width="min(96vw, 960px)"
      />
    </Flex>
  );
}

interface SpriteSheetCardProps {
  onSelect: () => void;
  sheet: SpriteSheetAsset;
}

/**
 * Gallery card that plays the sheet's first animation, usually idle.
 * @param sheet - Saved sprite sheet
 * @param onSelect - Opens the detail dialog
 */
function SpriteSheetCard({ onSelect, sheet }: SpriteSheetCardProps) {
  const preview = sheet.animations[0];
  return (
    <button className={styles.spriteSheetCard} onClick={onSelect} type="button">
      <span className={styles.spriteStage}>
        {preview !== undefined && (
          <SpriteAnimationPlayer
            animation={preview}
            displayHeight={CARD_FRAME_HEIGHT}
            frameHeight={sheet.frameHeight}
            frameWidth={sheet.frameWidth}
          />
        )}
      </span>
      <span className={styles.spriteSheetHeader}>
        <span className={styles.spriteSheetTitle}>{sheet.title}</span>
        <span className={styles.spriteSheetMeta}>faces {sheet.facing}</span>
      </span>
      <span className={styles.spriteSheetMeta}>
        {sheet.animations.map((animation) => animation.label).join(" · ")}
      </span>
    </button>
  );
}

interface SpriteSheetDetailProps {
  sheet: SpriteSheetAsset;
}

/**
 * Plays every animation on its own stage, with its frame strip underneath,
 * followed by the anchor and the sheet as the model painted it.
 * @param sheet - Saved sprite sheet
 */
function SpriteSheetDetail({ sheet }: SpriteSheetDetailProps) {
  const [mirrored, setMirrored] = useState(false);
  const shownFacing = mirrored ? oppositeFacing(sheet.facing) : sheet.facing;

  return (
    <div className={styles.spriteSheetDetail}>
      <Flex align="center" gap="3" justify="between">
        <span className={styles.spriteSheetMeta}>
          {sheet.frameWidth}×{sheet.frameHeight}px frames · faces {shownFacing}
        </span>
        <button
          className={styles.spriteMirrorToggle}
          onClick={() => setMirrored((current) => !current)}
          type="button"
        >
          {mirrored ? "Show original facing" : "Mirror facing"}
        </button>
      </Flex>

      <div className={styles.spriteAnimationGrid}>
        {sheet.animations.map((animation) => (
          <div className={styles.spriteAnimationCell} key={animation.kind}>
            <span className={styles.spriteStage}>
              <SpriteAnimationPlayer
                animation={animation}
                displayHeight={DETAIL_FRAME_HEIGHT}
                frameHeight={sheet.frameHeight}
                frameWidth={sheet.frameWidth}
                mirrored={mirrored}
              />
            </span>
            <span className={styles.spriteSheetHeader}>
              <span className={styles.spriteSheetTitle}>{animation.label}</span>
              <span className={styles.spriteSheetMeta}>
                {animation.frameCount} frames · {animation.fps} fps ·{" "}
                {animation.loop ? "loops" : "plays once"}
              </span>
            </span>
            <span className={styles.spriteAnimationDescription}>
              {animation.description}
            </span>
            <a
              className={styles.spriteStripLink}
              href={animation.stripUrl}
              rel="noreferrer"
              target="_blank"
            >
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img
                alt={`${animation.label} frames`}
                className={styles.spriteStrip}
                src={animation.stripUrl}
              />
            </a>
          </div>
        ))}
      </div>

      <span className={styles.dungeonGroupLabel}>Source</span>
      <div className={styles.spriteSourceRow}>
        <a href={sheet.anchorUrl} rel="noreferrer" target="_blank">
          {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
          <img
            alt={`${sheet.title} identity anchor`}
            className={styles.spriteAnchor}
            src={sheet.anchorUrl}
          />
        </a>
        <a href={sheet.sheetUrl} rel="noreferrer" target="_blank">
          {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
          <img
            alt={`${sheet.title} painted sheet`}
            className={styles.spriteSource}
            src={sheet.sheetUrl}
          />
        </a>
      </div>
    </div>
  );
}

/**
 * @param facing - Direction the sheet was painted facing
 * @returns The mirrored direction
 */
function oppositeFacing(facing: SpriteSheetAsset["facing"]) {
  return facing === "left" ? "right" : "left";
}
