"use client";

import type {
  ListPlayableCardsResponse,
  PlayableCardAsset,
  PlayableCardKind,
} from "@resync-game-framework/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

interface PlayableCardListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListPlayableCardsResponse | null;
}

const KIND_LABELS: Record<PlayableCardKind, string> = {
  aether: "Aether",
  attack: "Attack",
  combo: "Combo",
  defend: "Defend",
  draw: "Draw",
};

/**
 * Playable-card workshop list: in-flight jobs, then one card per saved asset.
 * @param isLoading - Shows a loading line while the card list is fetching
 * @param result - Saved cards; null before the first response
 * @param error - List error, if any
 * @param pendingJobs - Card generations still running or failed
 * @param onDismissJob - Removes a failed job card
 */
export function PlayableCardList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: PlayableCardListProps) {
  const cards = result?.cards ?? [];
  const [detailCard, setDetailCard] = useState<PlayableCardAsset | null>(null);
  const hasPending = pendingJobs.length > 0;
  const hasCards = cards.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Library</span>
        {cards.length > 0 && (
          <span className={styles.assetCount}>{cards.length}</span>
        )}
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading cards…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading && !hasPending && result != null && cards.length === 0 && (
        <Flex className={styles.emptyState}>
          <span>No playable cards yet</span>
          <span className={styles.emptyStateHint}>
            Describe a card and we'll pull its text from the Lore document.
          </span>
        </Flex>
      )}

      {(hasPending || hasCards) && (
        <div className={styles.playableCardGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {cards.map((card) => (
            <PlayableCardTile
              card={card}
              key={card.cardId}
              onOpen={setDetailCard}
            />
          ))}
        </div>
      )}

      <Dialog
        content={
          detailCard == null ? null : <PlayableCardDetail card={detailCard} />
        }
        description={detailCard == null ? undefined : formatCost(detailCard)}
        isOpen={detailCard != null}
        onToggleOpen={(open) => {
          if (!open) {
            setDetailCard(null);
          }
        }}
        title={detailCard?.name ?? "Playable card"}
        width="min(96vw, 720px)"
      />
    </Flex>
  );
}

interface PlayableCardTileProps {
  card: PlayableCardAsset;
  onOpen: (card: PlayableCardAsset) => void;
}

/**
 * One saved card: illustration, cost, rules, and flavor.
 * @param card - Card to display
 * @param onOpen - Opens the larger view, including Lore passages
 */
function PlayableCardTile({ card, onOpen }: PlayableCardTileProps) {
  return (
    <button
      className={styles.playableCard}
      onClick={() => {
        onOpen(card);
      }}
      type="button"
    >
      <PlayableCardArt card={card} />
      <span className={styles.playableCardBody}>
        <span className={styles.playableCardHeader}>
          <span className={styles.playableCardName}>{card.name}</span>
          <span className={styles.playableCardCost}>{formatCost(card)}</span>
        </span>
        <span className={styles.playableCardKind}>
          {KIND_LABELS[card.kind]}
        </span>
        {card.effects.map((effect) => (
          <span className={styles.playableCardEffect} key={effect.kind}>
            {effect.text}
          </span>
        ))}
        <span className={styles.playableCardDescription}>
          {card.description}
        </span>
      </span>
    </button>
  );
}

interface PlayableCardDetailProps {
  card: PlayableCardAsset;
}

/**
 * Large view of one card, including the Lore passages it was written from.
 * @param card - Card opened from the list
 */
function PlayableCardDetail({ card }: PlayableCardDetailProps) {
  return (
    <div className={styles.playableCardDetail}>
      <PlayableCardArt card={card} />
      <p className={styles.playableCardDescription}>{card.description}</p>
      {card.effects.map((effect) => (
        <p className={styles.playableCardEffect} key={effect.kind}>
          {effect.text}
        </p>
      ))}
      <div className={styles.playableCardLore}>
        <span className={styles.playableCardKind}>From the Lore</span>
        {card.loreSources.map((source) => (
          <p key={source.excerpt}>
            <a href={source.url} rel="noreferrer" target="_blank">
              {source.title}
            </a>
            {": "}
            {source.excerpt}
          </p>
        ))}
      </div>
    </div>
  );
}

interface PlayableCardArtProps {
  card: PlayableCardAsset;
}

/**
 * The card illustration.
 * @param card - Card whose image should be shown
 */
function PlayableCardArt({ card }: PlayableCardArtProps) {
  return (
    // biome-ignore lint/performance/noImgElement: remote card image URL from API
    <img
      alt={card.name}
      className={styles.playableCardArt}
      src={card.imageUrl}
    />
  );
}

/**
 * @param card - Card whose Aether cost is shown
 * @returns Cost label, singular when the card costs 1
 */
function formatCost(card: PlayableCardAsset): string {
  if (card.aetherCost === 1) {
    return "1 Aether";
  }
  return `${card.aetherCost} Aether`;
}
