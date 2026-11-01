"use client";

import {
  DUNGEON_SLOT_ASSET_CLASS_ID,
  type DungeonSlot,
  type DungeonSlotKind,
  isServiceError,
} from "@towers-of-coreborn/api";
import clsx from "clsx";
import { useEffect, useState } from "react";
import { Dialog, Flex } from "@/lib/radix";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import type { AvailableServiceCaller } from "@/services/helpers/types";
import styles from "./Assets.module.scss";
import { CopyableError } from "./CopyableError";
import type { PendingJob } from "./PendingJobCard";

const KIND_LABELS: Record<DungeonSlotKind, string> = {
  "battle-background": "Room",
  "card-character": "Character",
  enemy: "Enemy",
  "playable-card": "Card",
  "sprite-sheet": "Sprite",
};

interface AttachableAsset {
  id: string;
  imageUrl: string;
  subtitle: string;
  title: string;
}

interface DungeonSlotCardProps {
  dungeonId: string;
  onAssociate?: (
    dungeonId: string,
    slotId: string,
    assetId: string,
  ) => Promise<string | null>;
  onGenerate?: (dungeonId: string, slot: DungeonSlot) => void;
  onStop?: (generationId: string, assetClassId: string) => void;
  slot: DungeonSlot;
  slotJob: PendingJob | undefined;
  slots: readonly DungeonSlot[];
}

/**
 * One prompt in a dungeon package. Clicking it starts that agent.
 * A filled slot shows the linked asset, and can be replaced with another.
 * @param dungeonId - Package this slot belongs to
 * @param slot - The prompt and any linked asset
 * @param slots - The rest of the package, used to see if a card's previous level is ready
 * @param slotJob - The in-flight run for this slot, when one exists
 * @param onGenerate - Starts the slot's agent
 * @param onStop - Stops that run
 * @param onAssociate - Writes an existing asset id into the package
 */
export function DungeonSlotCard({
  dungeonId,
  onAssociate,
  onGenerate,
  onStop,
  slot,
  slotJob,
  slots,
}: DungeonSlotCardProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [associateError, setAssociateError] = useState<string | null>(null);
  const level = slot.kind === "playable-card" ? slot.level : undefined;
  const generating =
    slot.status === "generating" ||
    (slotJob !== undefined && slotJob.error === null);
  const previousReady = isPreviousLevelReady(slot, slots);
  const canGenerate =
    !generating &&
    slot.status !== "ready" &&
    previousReady &&
    onGenerate !== undefined;
  const canAttach = !generating && onAssociate !== undefined;
  const error = slot.error ?? slotJob?.error ?? associateError;
  const generationId = slotJob?.id ?? slot.generationId;

  const generate = () => {
    if (!canGenerate) {
      return;
    }
    setAssociateError(null);
    onGenerate(dungeonId, slot);
  };

  const stop = () => {
    if (generationId === undefined || onStop === undefined) {
      return;
    }
    onStop(generationId, DUNGEON_SLOT_ASSET_CLASS_ID[slot.kind]);
  };

  return (
    <article
      className={clsx(
        styles.promptSlot,
        generating && styles.promptSlotRunning,
        error !== null && !generating && styles.promptSlotFailed,
      )}
    >
      <span className={styles.promptSlotKind}>
        {KIND_LABELS[slot.kind]}
        {level !== undefined ? ` · level ${level}` : ""}
      </span>
      <span className={styles.promptSlotTitle}>{slot.title}</span>
      {slot.preview !== undefined && (
        <>
          {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
          <img
            alt={slot.preview.title}
            className={styles.promptSlotImage}
            src={slot.preview.imageUrl}
          />
          <span className={styles.promptSlotSubtitle}>
            {slot.preview.subtitle}
          </span>
        </>
      )}
      {canGenerate ? (
        <button
          className={styles.promptSlotPrompt}
          onClick={generate}
          type="button"
        >
          {slot.prompt}
        </button>
      ) : (
        <p className={styles.promptSlotPromptStatic}>{slot.prompt}</p>
      )}
      {generating && (
        <span className={styles.promptSlotStatus}>
          {slotJob?.stopping === true ? "Stopping…" : "Generating…"}
        </span>
      )}
      {!previousReady && level !== undefined && (
        <span className={styles.promptSlotHint}>
          Attach or generate level {level - 1} first
        </span>
      )}
      {error !== null && !generating && <CopyableError message={error} />}
      <div className={styles.promptSlotActions}>
        {canGenerate && (
          <button
            className={styles.promptSlotAction}
            onClick={generate}
            type="button"
          >
            Generate
          </button>
        )}
        {canAttach && (
          <button
            className={styles.promptSlotAction}
            onClick={() => setIsPickerOpen(true)}
            type="button"
          >
            {slot.status === "ready" ? "Replace" : "Attach existing"}
          </button>
        )}
        {generating && (
          <button
            className={styles.promptSlotAction}
            disabled={slotJob?.stopping === true || generationId === undefined}
            onClick={stop}
            type="button"
          >
            {slotJob?.stopping === true ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>
      <AttachAssetDialog
        isOpen={isPickerOpen}
        kind={slot.kind}
        onClose={() => setIsPickerOpen(false)}
        onSelect={async (assetId) => {
          if (onAssociate === undefined) {
            return;
          }
          const message = await onAssociate(dungeonId, slot.id, assetId);
          if (message !== null) {
            setAssociateError(message);
            return;
          }
          setAssociateError(null);
          setIsPickerOpen(false);
        }}
      />
    </article>
  );
}

interface AttachAssetDialogProps {
  isOpen: boolean;
  kind: DungeonSlotKind;
  onClose: () => void;
  onSelect: (assetId: string) => Promise<void>;
}

/**
 * Lists stored assets of one kind so one can be written into a dungeon slot.
 * @param isOpen - Whether the picker is visible
 * @param kind - Asset class to list
 * @param onClose - Closes the picker
 * @param onSelect - Called with the chosen asset id
 */
function AttachAssetDialog({
  isOpen,
  kind,
  onClose,
  onSelect,
}: AttachAssetDialogProps) {
  const { clientServiceCallers } = useClientServiceCallers();
  const [assets, setAssets] = useState<AttachableAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    setAssets(null);
    setError(null);
    void loadAttachableAssets(kind, clientServiceCallers).then((loaded) => {
      if (cancelled) {
        return;
      }
      if (typeof loaded === "string") {
        setError(loaded);
        setAssets([]);
        return;
      }
      setAssets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [clientServiceCallers, isOpen, kind]);

  return (
    <Dialog
      content={
        <div className={styles.attachList}>
          {assets === null && (
            <span className={styles.promptSlotHint}>Loading…</span>
          )}
          {error !== null && <CopyableError message={error} />}
          {assets?.length === 0 && error === null && (
            <span className={styles.promptSlotHint}>
              No saved {KIND_LABELS[kind].toLowerCase()}s yet.
            </span>
          )}
          {assets?.map((asset) => (
            <button
              className={styles.attachOption}
              disabled={isAttaching}
              key={asset.id}
              onClick={() => {
                setIsAttaching(true);
                void onSelect(asset.id).finally(() => setIsAttaching(false));
              }}
              type="button"
            >
              {/* biome-ignore lint/performance/noImgElement: generated backend asset */}
              <img alt="" className={styles.attachThumb} src={asset.imageUrl} />
              <Flex direction="column" gap="1">
                <span className={styles.attachTitle}>{asset.title}</span>
                <span className={styles.attachSubtitle}>{asset.subtitle}</span>
              </Flex>
            </button>
          ))}
        </div>
      }
      description={`Choose a saved ${KIND_LABELS[kind].toLowerCase()} to put in this slot.`}
      isOpen={isOpen}
      onToggleOpen={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={`Attach ${KIND_LABELS[kind].toLowerCase()}`}
      width="520px"
    />
  );
}

/**
 * @param slot - Card slot, or another kind of slot
 * @param slots - Every slot in the package
 * @returns Whether this slot's agent can run. Later cards wait for the previous level.
 */
function isPreviousLevelReady(
  slot: DungeonSlot,
  slots: readonly DungeonSlot[],
): boolean {
  if (slot.kind !== "playable-card" || slot.level <= 1) {
    return true;
  }
  const level = slot.level;
  return slots.some(
    (entry) =>
      entry.kind === "playable-card" &&
      entry.characterSlotId === slot.characterSlotId &&
      entry.level === level - 1 &&
      entry.status === "ready",
  );
}

/**
 * @param kind - Asset class to list
 * @param callers - Workshop service callers
 * @returns Assets that can be attached, or an error message
 */
async function loadAttachableAssets(
  kind: DungeonSlotKind,
  callers: AvailableServiceCaller,
): Promise<AttachableAsset[] | string> {
  if (kind === "battle-background") {
    const result = await callers.battleBackground.list();
    if (isServiceError(result)) {
      return result.message;
    }
    return result.backgrounds.map((background) => ({
      id: background.id,
      imageUrl: background.imageUrl,
      subtitle: background.title,
      title: background.title,
    }));
  }
  if (kind === "card-character") {
    const result = await callers.cardCharacter.list();
    if (isServiceError(result)) {
      return result.message;
    }
    return result.sets.flatMap((set) => {
      const portrait = set.levels[0];
      if (portrait === undefined) {
        return [];
      }
      return [
        {
          id: set.setId,
          imageUrl: portrait.url,
          subtitle: set.theme,
          title: portrait.title,
        },
      ];
    });
  }
  if (kind === "enemy") {
    const result = await callers.enemy.list();
    if (isServiceError(result)) {
      return result.message;
    }
    return result.enemies.map((enemy) => ({
      id: enemy.id,
      imageUrl: enemy.imageUrl,
      subtitle: `${enemy.maxHitPoints} HP`,
      title: enemy.title,
    }));
  }

  if (kind === "sprite-sheet") {
    const result = await callers.spriteSheet.list();
    if (isServiceError(result)) {
      return result.message;
    }
    return result.spriteSheets.map((sheet) => ({
      id: sheet.id,
      imageUrl: sheet.anchorUrl,
      subtitle: sheet.animations
        .map((animation) => animation.label)
        .join(" · "),
      title: sheet.title,
    }));
  }

  const result = await callers.playableCard.list();
  if (isServiceError(result)) {
    return result.message;
  }
  return result.cards.map((card) => ({
    id: card.cardId,
    imageUrl: card.imageUrl,
    subtitle: card.aetherCost === 1 ? "1 Aether" : `${card.aetherCost} Aether`,
    title: card.name,
  }));
}
