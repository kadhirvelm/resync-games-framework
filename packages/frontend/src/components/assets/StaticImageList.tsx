"use client";

import type {
  ListStaticImagesResponse,
  StaticImageAsset,
} from "@resync-game-framework/api";
import { useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import { type PendingJob, PendingJobCard } from "./PendingJobCard";

interface StaticImageListProps {
  error: string | null;
  isLoading: boolean;
  onDismissJob: (id: string) => void;
  onStopJob: (id: string) => void;
  pendingJobs: PendingJob[];
  result: ListStaticImagesResponse | null;
}

/** Generated Descent resource art bundled with the game and shown in the gallery. */
const BUNDLED_DESCENT_RESOURCE_IMAGES: readonly StaticImageAsset[] = [
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A tied golden wheat sheaf for the Descent food stockpile.",
    id: "descent-resource-food",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/food.png",
    prompt: "A hand-painted golden wheat resource icon on transparent alpha.",
    title: "Food",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A blue ceramic water jug for the Descent water stockpile.",
    id: "descent-resource-water",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/water.png",
    prompt: "A hand-painted blue water jug resource icon on transparent alpha.",
    title: "Water",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "Two cut timber logs for the Descent wood stockpile.",
    id: "descent-resource-wood",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/wood.png",
    prompt: "A hand-painted cut timber resource icon on transparent alpha.",
    title: "Wood",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description:
      "A cluster of quarried blocks for the Descent stone stockpile.",
    id: "descent-resource-stone",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/stone.png",
    prompt: "A hand-painted quarried stone resource icon on transparent alpha.",
    title: "Stone",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A dark forged ingot for the Descent iron stockpile.",
    id: "descent-resource-iron",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/iron.png",
    prompt: "A hand-painted forged iron resource icon on transparent alpha.",
    title: "Iron",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A stack of worn bronze currency for the Descent treasury.",
    id: "descent-resource-coin",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/coin.png",
    prompt: "A hand-painted bronze coin resource icon on transparent alpha.",
    title: "Coin",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A luminous medicinal sprig for the spirit-herb stockpile.",
    id: "descent-resource-spirit-herbs",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/spirit_herbs.png",
    prompt: "A hand-painted luminous herb resource icon on transparent alpha.",
    title: "Spirit Herbs",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A flame-filled crystal for the Descent essence stockpile.",
    id: "descent-resource-essence",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/essence.png",
    prompt: "A hand-painted spirit crystal resource icon on transparent alpha.",
    title: "Essence",
  },
  {
    aspectRatio: "1:1",
    createdAt: "2026-11-01T00:00:00.000Z",
    description: "A paired villager portrait for the Descent population cap.",
    id: "descent-resource-population",
    imageSize: "1K",
    imageUrl: "/descent/resource-icons/population.png",
    prompt: "A hand-painted paired villager icon on transparent alpha.",
    title: "Population",
  },
];

/**
 * Displays pending and stored standalone 2D images in the workshop.
 * @param props - List response, loading state, and job actions
 * @returns Static-image gallery and detail dialog
 */
export function StaticImageList({
  error,
  isLoading,
  onDismissJob,
  onStopJob,
  pendingJobs,
  result,
}: StaticImageListProps) {
  const images = [
    ...(result?.staticImages ?? []),
    ...BUNDLED_DESCENT_RESOURCE_IMAGES,
  ];
  const [selected, setSelected] = useState<StaticImageAsset | null>(null);
  const hasContent = pendingJobs.length > 0 || images.length > 0;

  return (
    <Flex direction="column" gap="3" width="100%">
      <Flex className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Library</span>
        {images.length > 0 && (
          <span className={styles.assetCount}>{images.length}</span>
        )}
      </Flex>

      {isLoading && (
        <Flex align="center" gap="2">
          <div className={styles.loadingSpinner} />
          <span className={styles.loadingText}>Loading images…</span>
        </Flex>
      )}
      {error != null && <CopyableError message={error} />}
      {!isLoading && !hasContent && result != null && (
        <Flex className={styles.emptyState}>
          <span>No static images yet</span>
          <span className={styles.emptyStateHint}>
            Describe an icon, cutout, illustration, texture, or backdrop.
          </span>
        </Flex>
      )}

      {hasContent && (
        <div className={styles.staticImageGrid}>
          {pendingJobs.map((job) => (
            <PendingJobCard
              job={job}
              key={job.id}
              onDismiss={() => onDismissJob(job.id)}
              onStop={() => onStopJob(job.id)}
            />
          ))}
          {images.map((image) => (
            <button
              className={styles.staticImageCard}
              key={image.id}
              onClick={() => setSelected(image)}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img
                alt={image.title}
                className={styles.staticImagePreview}
                src={image.imageUrl}
              />
              <span className={styles.staticImageHeader}>
                <span className={styles.staticImageTitle}>{image.title}</span>
                <span className={styles.staticImageRatio}>
                  {image.aspectRatio}
                </span>
              </span>
              <span className={styles.staticImageDescription}>
                {image.description}
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
              className={styles.staticImageDetail}
              src={selected.imageUrl}
            />
          )
        }
        description={selected?.description}
        isOpen={selected != null}
        onToggleOpen={(open) => {
          if (!open) setSelected(null);
        }}
        title={selected?.title ?? "Static image"}
        width="min(96vw, 840px)"
      />
    </Flex>
  );
}
