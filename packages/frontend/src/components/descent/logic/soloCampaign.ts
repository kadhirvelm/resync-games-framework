import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentCampaignMissionId,
  type DescentOutcome,
} from "@resync-game-framework/api";
import type { SaveStorage } from "./sim/autosave";

/** Separate from sim autosaves and multiplayer room progress. */
export const SOLO_CAMPAIGN_STORAGE_KEY = "descent.solo-campaign";

/** Completed missions are always a contiguous prefix of the shared catalog. */
export interface SoloCampaignProgress {
  version: 1;
  completedMissionIds: DescentCampaignMissionId[];
}

/** Returns a new, empty campaign. */
export function createSoloCampaignProgress(): SoloCampaignProgress {
  return { completedMissionIds: [], version: 1 };
}

/**
 * Validates persisted progress against the current ordered mission catalog.
 * @param value - Untrusted parsed data
 * @returns Whether the value is a supported, contiguous campaign record
 */
export function isSoloCampaignProgress(
  value: unknown,
): value is SoloCampaignProgress {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.completedMissionIds))
    return false;
  const ids = record.completedMissionIds;
  return (
    ids.length <= DESCENT_CAMPAIGN_MISSIONS.length &&
    ids.every((id, index) => id === DESCENT_CAMPAIGN_MISSIONS[index]?.id)
  );
}

/**
 * Checks whether a mission can be played, including previously completed missions.
 * @param progress - Valid campaign progress
 * @param missionId - Mission to check
 * @returns Whether the mission is unlocked
 */
export function isSoloCampaignMissionUnlocked(
  progress: SoloCampaignProgress,
  missionId: DescentCampaignMissionId,
): boolean {
  const index = DESCENT_CAMPAIGN_MISSIONS.findIndex(
    (mission) => mission.id === missionId,
  );
  return (
    isSoloCampaignProgress(progress) &&
    index >= 0 &&
    index <= progress.completedMissionIds.length
  );
}

/**
 * Records a terminal result without mutating progress. Only a victory on the
 * next incomplete mission advances; defeats and replays leave progress intact.
 * @param progress - Valid campaign progress
 * @param missionId - Mission whose run ended
 * @param outcome - Terminal outcome
 * @returns Updated progress, or the original when no advancement is possible
 */
export function recordSoloCampaignOutcome(
  progress: SoloCampaignProgress,
  missionId: DescentCampaignMissionId,
  outcome: DescentOutcome,
): SoloCampaignProgress {
  if (!isSoloCampaignProgress(progress) || outcome !== "victory")
    return progress;
  const next = DESCENT_CAMPAIGN_MISSIONS[progress.completedMissionIds.length];
  if (!next || next.id !== missionId) return progress;
  return {
    completedMissionIds: [...progress.completedMissionIds, missionId],
    version: 1,
  };
}

/**
 * Reads a valid campaign record without accessing browser globals.
 * @param storage - Browser-compatible storage
 * @returns Progress, or null for missing, invalid, unsupported or inaccessible data
 */
export function readSoloCampaignProgress(
  storage: SaveStorage,
): SoloCampaignProgress | null {
  try {
    const raw = storage.getItem(SOLO_CAMPAIGN_STORAGE_KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    return isSoloCampaignProgress(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Persists valid progress, reporting blocked storage or quota errors.
 * @param storage - Browser-compatible storage
 * @param progress - Campaign record to save
 * @returns Whether the write succeeded
 */
export function writeSoloCampaignProgress(
  storage: SaveStorage,
  progress: SoloCampaignProgress,
): boolean {
  if (!isSoloCampaignProgress(progress)) return false;
  try {
    storage.setItem(SOLO_CAMPAIGN_STORAGE_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}
