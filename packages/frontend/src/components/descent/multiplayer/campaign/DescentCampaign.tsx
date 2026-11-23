/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentCampaignState,
  type DescentRoomPlayer,
} from "@resync-game-framework/api";
import { useRef, useState } from "react";
import styles from "./DescentCampaign.module.scss";

/** Describes the shared campaign rules and ordered scenarios without promising later layers.
 * @param props - Current mission and completed scenario ids
 * @returns An accessible three-mission briefing and progress list
 */
export function DescentCampaignBriefing({
  missionIndex = 0,
  completedMissionIds = [],
}: {
  missionIndex?: number;
  completedMissionIds?: readonly string[];
}) {
  return (
    <section aria-label="Campaign briefing" className={styles.briefing}>
      <p className={styles.eyebrow}>Co-op Campaign · Ashen Crucible</p>
      <h2>Three sieges. One squad.</h2>
      <p>
        Three increasingly intense Ashen Crucible scenarios using the existing
        siege content. Each mission begins with fresh forces and supplies;
        armies and resources do not carry over.
      </p>
      <ol className={styles.missions}>
        {DESCENT_CAMPAIGN_MISSIONS.map((mission, index) => {
          const completed = completedMissionIds.includes(mission.id);
          const current = index === missionIndex && !completed;
          return (
            <li
              aria-current={current ? "step" : undefined}
              data-current={current}
              key={mission.id}
            >
              <span className={styles.eyebrow}>
                Mission {index + 1} ·{" "}
                {completed ? "Complete" : "Ashen Crucible"}
              </span>
              <h3>{mission.title}</h3>
              <p>{mission.briefing}</p>
            </li>
          );
        })}
      </ol>
      <p className={styles.saveNote}>
        Progress is saved only in this room, not your solo save. The final
        player leaving deletes the room and its campaign progress.
      </p>
    </section>
  );
}

/** Compact expandable briefing in the existing co-op HUD.
 * @param props - Server-owned campaign progress
 * @returns A mission summary with an on-demand briefing
 */
export function DescentCampaignProgress({
  campaign,
}: {
  campaign: DescentCampaignState;
}) {
  const mission = DESCENT_CAMPAIGN_MISSIONS[campaign.missionIndex];
  return (
    <details className={styles.progress}>
      <summary>
        Campaign · Mission {campaign.missionIndex + 1}/
        {DESCENT_CAMPAIGN_MISSIONS.length} ·{" "}
        {mission?.title ?? "Campaign complete"}
      </summary>
      <DescentCampaignBriefing
        completedMissionIds={campaign.completedMissionIds}
        missionIndex={campaign.missionIndex}
      />
    </details>
  );
}

/** Campaign terminal content replacing, rather than stacking over, the default restart dialog.
 * @param props - Authoritative progress, locked roster and host-only transition callbacks
 * @returns A debrief, all-player confirmation state, or campaign completion screen
 */
export function DescentCampaignDebrief({
  campaign,
  error: roomError,
  isHost,
  onAction,
  onExit,
  roster,
}: {
  campaign: DescentCampaignState;
  error?: string | null;
  isHost: boolean;
  onAction: (action: "retry" | "advance") => Promise<void>;
  onExit: () => Promise<void>;
  roster: readonly DescentRoomPlayer[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const mission = DESCENT_CAMPAIGN_MISSIONS[campaign.missionIndex];
  const complete = campaign.status === "completed";
  const victory = campaign.status === "victory";
  const defeat = campaign.status === "defeat";
  const finalMission =
    campaign.missionIndex === DESCENT_CAMPAIGN_MISSIONS.length - 1;
  const advanceLabel = finalMission ? "Complete campaign" : "Next mission";
  let title = "Confirming mission results…";
  if (complete) title = "Campaign complete";
  else if (victory) title = "Mission secured";
  else if (defeat) title = "Mission lost";

  /** Runs one room action at a time and retains failures for a retry.
   * @param action - Awaitable room operation
   * @returns Completion after busy/error UI has settled
   */
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to update the campaign. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div aria-busy={busy} className={styles.debrief}>
      <p className={styles.eyebrow}>
        Ashen Crucible · Mission {campaign.missionIndex + 1} of{" "}
        {DESCENT_CAMPAIGN_MISSIONS.length}
      </p>
      <h2>{title}</h2>
      <p>
        {complete
          ? "Your squad has completed all three Ashen Crucible siege scenarios."
          : mission?.title}
      </p>
      <p>
        {campaign.completedMissionIds.length}/{DESCENT_CAMPAIGN_MISSIONS.length}{" "}
        missions completed
      </p>
      {!complete && !defeat && !victory ? (
        <p role="status">
          Waiting for every commander to report. Disconnected commanders must
          reconnect before the squad can advance.
        </p>
      ) : null}
      <ul className={styles.results}>
        {roster.map((player) => (
          <li key={player.id}>
            <span>{player.name}</span>
            <strong>{campaign.outcomes[player.id] ?? "Awaiting result"}</strong>
          </li>
        ))}
      </ul>
      {complete ? null : (
        <p>Next deployment starts with fresh forces and supplies.</p>
      )}
      {!isHost && !complete ? (
        <p role="status">
          Waiting for the host
          {defeat ? " to retry this mission." : " to continue the campaign."}
        </p>
      ) : null}
      {error == null && roomError == null ? null : (
        <p role="alert">{error ?? roomError}</p>
      )}
      <div className={styles.actions}>
        {isHost && defeat ? (
          <button
            disabled={busy}
            onClick={() => void run(() => onAction("retry"))}
            type="button"
          >
            {busy ? "Deploying…" : "Retry mission"}
          </button>
        ) : null}
        {isHost && victory ? (
          <button
            disabled={busy}
            onClick={() => void run(() => onAction("advance"))}
            type="button"
          >
            {busy ? "Updating…" : advanceLabel}
          </button>
        ) : null}
        <button disabled={busy} onClick={() => void run(onExit)} type="button">
          {complete ? "Exit campaign" : "Leave room"}
        </button>
      </div>
      <p className={styles.saveNote}>
        The final player leaving deletes this room and its campaign progress.
      </p>
    </div>
  );
}
