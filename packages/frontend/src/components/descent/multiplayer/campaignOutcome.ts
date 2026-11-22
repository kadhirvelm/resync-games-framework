import type { DescentOutcome } from "@resync-game-framework/api";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  isAshenGateSliceState,
} from "../logic/slice/sliceState";
import type { SimSnapshot } from "../logic/types";

/**
 * Reads a terminal replay result only when its rendered session matches the room.
 * A room transition renders before React replaces the old sim; reporting that
 * old snapshot against the new match would permanently poison its attestations.
 * @param snapshot - Snapshot belonging to the rendered replay session
 * @param sessionMatchId - Match that produced this snapshot, not a mutable ref
 * @param roomMatchId - Current authoritative room match
 * @returns Terminal outcome for this match, or null while playing/transitioning
 */
export function readDescentCampaignOutcome(
  snapshot: SimSnapshot | null,
  sessionMatchId: string | null,
  roomMatchId: string | null,
): DescentOutcome | null {
  if (!roomMatchId || sessionMatchId !== roomMatchId) return null;
  const state = snapshot?.meta[ASHEN_GATE_SLICE_MODULE_ID];
  if (!isAshenGateSliceState(state) || state.outcome === "playing") return null;
  return state.outcome;
}
