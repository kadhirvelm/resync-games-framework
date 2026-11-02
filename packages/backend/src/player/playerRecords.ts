import {
  type CardCharacterSetAsset,
  type ClimbRecord,
  CULTIVATOR_ART_STATUSES,
  type CultivatorArtState,
  type CultivatorArtStatus,
  type CultivatorRecord,
  type SpriteSheetAsset,
} from "@resync-game-framework/api";
import type { Climb, Cultivator } from "@resync-game-framework/database";
import { ASSET_CLASS_GENERATION_TIMEOUT_MS } from "src/asset-classes/shared/createAssetClassController";

/**
 * A painting run older than this has outlived any agent timeout, so the
 * process running it must have stopped.
 */
export const PAINTING_STALE_AFTER_MS =
  ASSET_CLASS_GENERATION_TIMEOUT_MS + 5 * 60 * 1000;

/** Shown when a painting run was dropped, such as by a restart. */
export const INTERRUPTED_PAINTING_ERROR =
  "Painting was interrupted. Paint again to retry.";

/** Shown when a finished part's files can no longer be read. */
export const MISSING_ART_ERROR =
  "The painted art could not be found. Paint again to retry.";

/** Stored columns for one generated part. */
export interface ArtColumns {
  error: string | null;
  status: string;
}

/**
 * @param value - Stored status text
 * @returns The status, or `none` for anything unknown
 */
function readStatus(value: string): CultivatorArtStatus {
  return (CULTIVATOR_ART_STATUSES as readonly string[]).includes(value)
    ? (value as CultivatorArtStatus)
    : "none";
}

/**
 * Turns one part's stored columns into what the game shows. A painting run
 * that has gone stale reads as failed, and a ready part whose files are gone
 * reads as failed, so the player can paint again.
 * @param columns - Stored status and error
 * @param asset - The stored asset, when it can be read
 * @param paintingStartedAt - When the current painting run began
 * @param now - Current time in milliseconds
 * @returns The part's state
 */
export function readArtState<Asset>(
  columns: ArtColumns,
  asset: Asset | undefined,
  paintingStartedAt: Date | null,
  now: number,
): CultivatorArtState<Asset> {
  const status = readStatus(columns.status);
  if (status === "painting") {
    const startedAt = paintingStartedAt?.getTime() ?? 0;
    if (now - startedAt > PAINTING_STALE_AFTER_MS) {
      return { asset, error: INTERRUPTED_PAINTING_ERROR, status: "failed" };
    }
    return { asset, status };
  }
  if (status === "ready") {
    return asset === undefined
      ? { error: MISSING_ART_ERROR, status: "failed" }
      : { asset, status };
  }
  if (status === "failed") {
    return { asset, error: columns.error ?? undefined, status };
  }
  return { asset, status };
}

/**
 * @param row - Stored cultivator
 * @param art - Portrait set and sprite sheet, when they can be read
 * @param now - Current time in milliseconds
 * @returns The cultivator as the API returns it
 */
export function toCultivatorRecord(
  row: Cultivator,
  art: { portraitSet?: CardCharacterSetAsset; spriteSheet?: SpriteSheetAsset },
  now: number,
): CultivatorRecord {
  return {
    appearance: row.appearance,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    name: row.name,
    portrait: readArtState(
      { error: row.portraitError, status: row.portraitStatus },
      art.portraitSet,
      row.paintingStartedAt,
      now,
    ),
    sprite: readArtState(
      { error: row.spriteError, status: row.spriteStatus },
      art.spriteSheet,
      row.paintingStartedAt,
      now,
    ),
    title: row.title,
  };
}

/**
 * @param row - Stored climb
 * @returns The climb as the API returns it
 */
export function toClimbRecord(row: Climb): ClimbRecord {
  return {
    ascension: row.ascension,
    cultivatorId: row.cultivatorId,
    floorCount: row.floorCount,
    floorIndex: row.floorIndex,
    id: row.id,
    snapshot: row.snapshot,
    towerId: row.towerId,
    towerTitle: row.towerTitle,
    updatedAt: row.updatedAt.toISOString(),
  };
}
