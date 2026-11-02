"use client";

import {
  DUNGEON_ASSET_CLASS_ID,
  type DungeonBlueprint,
  isServiceError,
} from "@resync-game-framework/api";
import { Castle } from "lucide-react";
import { useEffect, useState } from "react";
import { convertErrorToString } from "@/lib/convertErrorToString";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { DungeonList } from "../DungeonList";
import type {
  AssetClassDefinition,
  AssetGalleryProps,
} from "./assetClassDefinition";

/**
 * Lists saved dungeon packages and the planning job for a new one.
 * A refresh keeps the packages already on screen, so filling a slot does not
 * blank the package.
 * @param props - Pending planning jobs, slot runs, and slot actions
 */
function DungeonGallery({
  onAssociateDungeonSlot,
  onDismissJob,
  onGenerateDungeonSlot,
  onStopDungeonSlot,
  onStopJob,
  pendingJobs,
  refreshKey,
  slotJobs,
}: AssetGalleryProps) {
  const { clientServiceCallers } = useClientServiceCallers();
  const [result, setResult] = useState<{ dungeons: DungeonBlueprint[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Captured so this request is tied to the refresh that started it.
    const listedAt = refreshKey;
    void clientServiceCallers.dungeon.list().then((response) => {
      if (cancelled || listedAt !== refreshKey) {
        return;
      }
      if (isServiceError(response)) {
        setError(convertErrorToString(response));
        setIsLoading(false);
        return;
      }
      setError(null);
      setResult(response);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clientServiceCallers, refreshKey]);

  return (
    <DungeonList
      error={error}
      isLoading={isLoading}
      onAssociateSlot={onAssociateDungeonSlot}
      onDismissJob={onDismissJob}
      onGenerateSlot={onGenerateDungeonSlot}
      onStopJob={onStopJob}
      onStopSlot={onStopDungeonSlot}
      pendingJobs={pendingJobs}
      result={result}
      slotJobs={slotJobs ?? []}
    />
  );
}

export const DUNGEON_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) => callers.dungeon.cancel({ generationId }),
  category: "Dungeons",
  dialogDescription:
    "Describe a dungeon. We'll write a prompt for each room, character, card, and enemy, and save them as a package you can fill in piece by piece.",
  dialogTitle: "New dungeon",
  form: {
    hint: "Needs ProductNow connected. A dungeon package holds 2 room prompts, 3 character prompts, 4 card prompts for each character, and 2 enemy prompts. Each room and enemy also gets a sound, and the package gets music and stingers.",
    placeholder: "e.g. a drowned bell tower held by clockwork wardens",
    promptLabel: "Describe the dungeon",
    submitLabel: "Lay out prompts",
  },
  Gallery: DungeonGallery,
  generate: (callers, prompt, generationId) =>
    callers.dungeon.generate({ generationId, prompt }),
  generateButtonLabel: "+ New dungeon",
  Icon: Castle,
  id: DUNGEON_ASSET_CLASS_ID,
  subtitle: "dungeon package",
  tabLabel: "Dungeons",
};
