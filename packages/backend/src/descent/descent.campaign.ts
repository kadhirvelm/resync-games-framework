import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentCampaignState,
  type DescentMapId,
  type DescentRoomState,
  type DescentStartMatchPayload,
} from "@resync-game-framework/api";

/**
 * Validates a host's campaign transition against the locked room snapshot.
 * @param current - Current room state
 * @param payload - Requested host transition
 * @returns Selected map and campaign state, or a rejection message
 */
export function resolveDescentStart(
  current: DescentRoomState,
  payload: DescentStartMatchPayload,
): { mapId: DescentMapId; campaign?: DescentCampaignState } | string {
  const action = payload.campaignAction;
  if (action !== undefined && !["start", "retry", "advance"].includes(action)) {
    return "Unsupported campaign action.";
  }
  if (payload.matchId !== undefined && payload.matchId !== current.matchId) {
    return "This request belongs to a stale match.";
  }
  if (!action) {
    if (current.campaign) return "Use an explicit campaign transition.";
    if (
      DESCENT_CAMPAIGN_MISSIONS.some((mission) => mission.id === payload.mapId)
    ) {
      return "Campaign maps require an explicit campaign start.";
    }
    return { mapId: payload.mapId ?? "ashen_crucible" };
  }
  if (current.matchId && payload.matchId !== current.matchId) {
    return "The current match id is required for a campaign transition.";
  }
  const previous = current.campaign;
  if (action === "start" && previous)
    return "This room already has a campaign.";
  if (action !== "start" && !previous)
    return "No campaign exists in this room.";
  if (action === "retry" && previous?.status !== "defeat") {
    return "Only a defeated campaign mission can be retried.";
  }
  if (action === "advance" && previous?.status !== "victory") {
    return "Every locked participant must report victory before advancing.";
  }
  let missionIndex = 0;
  if (previous)
    missionIndex = previous.missionIndex + (action === "advance" ? 1 : 0);
  const mission = DESCENT_CAMPAIGN_MISSIONS[missionIndex];
  if (!mission) return "The campaign has no further missions.";
  if (payload.mapId !== undefined && payload.mapId !== mission.id) {
    return "The selected map does not match the campaign mission.";
  }
  return {
    campaign: {
      completedMissionIds: [...(previous?.completedMissionIds ?? [])],
      missionIndex,
      outcomes: {},
      status: "active",
    },
    mapId: mission.id,
  };
}
