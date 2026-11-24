import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentCampaignMissionId,
} from "@resync-game-framework/api";
import {
  createMultiplayerDescentSim,
  isAshenGateSliceSnapshot,
} from "../logic/ashenGateSlice";
import { readSaveSlot, type SaveStorage } from "../logic/sim";
import { isWaveClockState } from "../logic/waves/clock";

const PLAYER = {
  color: "#f2c14e",
  id: "solo",
  name: "Commander",
  slotIndex: 0,
};
export const SOLO_CAMPAIGN_PLAYER = PLAYER;

/** Returns a slot distinct from the ordinary solo save and other missions. */
export function missionSaveSlot(id: DescentCampaignMissionId): string {
  return `solo-campaign-${id}`;
}

/** Binds a save to its mission identity even if a storage value is misplaced. */
export function missionSaveStorage(
  storage: SaveStorage,
  id: DescentCampaignMissionId,
): SaveStorage {
  return {
    getItem(key) {
      const raw = storage.getItem(key);
      if (raw === null) return null;
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const record = value as Record<string, unknown>;
        return record.version === 1 &&
          record.missionId === id &&
          typeof record.save === "string"
          ? record.save
          : null;
      } catch {
        return null;
      }
    },
    setItem(key, save) {
      storage.setItem(key, JSON.stringify({ missionId: id, save, version: 1 }));
    },
  };
}

/** Creates the selected scenario and restores only a matching, valid save. */
export function createSoloMissionSim(
  id: DescentCampaignMissionId,
  seed: number,
  storage?: SaveStorage,
) {
  const create = () =>
    createMultiplayerDescentSim({ mapId: id, players: [PLAYER], seed });
  const sim = create();
  if (!storage) return sim;
  const saved = readSaveSlot(
    missionSaveStorage(storage, id),
    missionSaveSlot(id),
  );
  if (saved === null) return sim;
  try {
    sim.load(saved);
    const snapshot = sim.snapshot();
    const mission = DESCENT_CAMPAIGN_MISSIONS.find((entry) => entry.id === id);
    const waves = snapshot.meta.waves;
    if (
      mission &&
      isAshenGateSliceSnapshot(snapshot) &&
      isWaveClockState(waves) &&
      waves.waveStatScale === mission.waveStatScale &&
      waves.waveTimeScale === mission.waveTimeScale
    )
      return sim;
  } catch {
    // A stale or malformed mission save must never be credited to another mission.
  }
  return create();
}
