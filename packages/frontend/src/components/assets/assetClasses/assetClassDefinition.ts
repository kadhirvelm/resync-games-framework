import type { DungeonSlot, ServiceError } from "@resync-game-framework/api";
import type { ComponentType } from "react";
import type { AvailableServiceCaller } from "@/services/helpers/types";
import type { PendingJob } from "../PendingJobCard";

/**
 * Icon shown for an asset class in the sidebar nav and its content header.
 * Matches the shape of a `lucide-react` icon component.
 */
export type AssetClassIcon = ComponentType<{
  className?: string;
  size?: number;
}>;

/**
 * Which games a generator feeds.
 * `2d` is flat art for the card climb, `3d` is models, and `both` is shared
 * by either kind of game.
 */
export const ASSET_MEDIUMS = ["2d", "3d", "both"] as const;

/** Picture space a workshop generator belongs to. */
export type AssetMedium = (typeof ASSET_MEDIUMS)[number];

/** Sidebar section titles, in the order the workshop lists them. */
export const ASSET_MEDIUM_LABELS: Record<AssetMedium, string> = {
  "2d": "2D",
  "3d": "3D",
  both: "Both",
};

/** Sidebar section titles, written for someone scanning for a generator. */
export const ASSET_MEDIUM_SECTION_TITLES: Record<AssetMedium, string> = {
  "2d": "2D art",
  "3d": "3D models",
  both: "Any game",
};

/** Text for a generator's prompt box. */
export interface AssetClassFormCopy {
  hint?: string;
  placeholder: string;
  promptLabel: string;
  submitLabel: string;
}

/**
 * Props every asset-class gallery receives from the workshop page.
 * @property pendingJobs - This class's generations still running or failed
 * @property onDismissJob - Removes a failed job card
 * @property onStopJob - Asks the backend to stop a running generation
 * @property refreshKey - Changes after each successful generation; galleries refetch when it changes
 */
export interface AssetGalleryProps {
  /** Links an existing asset into a dungeon slot. Returns an error message, or null. */
  onAssociateDungeonSlot?: (
    dungeonId: string,
    slotId: string,
    assetId: string,
  ) => Promise<string | null>;
  onDismissJob: (id: string) => void;
  /** Starts the agent for one saved dungeon prompt. */
  onGenerateDungeonSlot?: (dungeonId: string, slot: DungeonSlot) => void;
  onStopJob: (id: string) => void;
  /** Stops the agent run for one dungeon slot. */
  onStopDungeonSlot?: (generationId: string, assetClassId: string) => void;
  pendingJobs: PendingJob[];
  refreshKey: number;
  /** Successful generate payloads kept for this session, newest first. */
  results: readonly unknown[];
  /** Slot runs, including ones whose pending card is on another tab. */
  slotJobs?: PendingJob[];
}

/**
 * Everything the workshop page needs to show one asset class: its tab, its
 * generate dialog, how to call its `generate` endpoint, and its gallery.
 */
export interface AssetClassDefinition {
  /**
   * Sidebar group this class is listed under inside its medium (e.g.
   * "Characters", "Environments"). Classes sharing a category are grouped
   * together, in first-seen order.
   */
  category: string;
  /**
   * Workshop section this class is listed under. `2d` and `3d` stay apart
   * from generators that either kind of game can use.
   */
  medium: AssetMedium;
  /** The gallery owns structured generation controls instead of the generic dialog. */
  customGeneration?: boolean;
  dialogDescription: string;
  dialogTitle: string;
  form: AssetClassFormCopy;
  /** Shown beside this class's name in the sidebar and content header. */
  Icon: AssetClassIcon;
  /**
   * Asks the backend to stop one in-flight generation.
   * @param callers - Generated service callers
   * @param generationId - Id passed to {@link AssetClassDefinition.generate}
   * @returns Whether the stop was recorded, or a service error
   */
  cancel: (
    callers: AvailableServiceCaller,
    generationId: string,
  ) => Promise<{ stopped: boolean } | ServiceError>;
  /**
   * Calls this class's `generate` endpoint.
   * @param callers - Generated service callers
   * @param prompt - Trimmed user prompt
   * @param generationId - Client id used to stop this run
   * @returns The stored asset, or a service error
   */
  generate: (
    callers: AvailableServiceCaller,
    prompt: string,
    generationId: string,
  ) => Promise<unknown | ServiceError>;
  generateButtonLabel: string;
  /** Lists stored assets for this class and renders them with pending jobs. */
  Gallery: ComponentType<AssetGalleryProps>;
  id: string;
  /**
   * Asset classes whose stored galleries should refetch after this class
   * generates successfully. Used when one generation writes another class's assets.
   */
  refreshClassIds?: readonly string[];
  /**
   * Keeps successful generate payloads in the workshop session.
   * Set this when the class has no stored list of its own.
   */
  remembersResults?: boolean;
  subtitle: string;
  tabLabel: string;
}
