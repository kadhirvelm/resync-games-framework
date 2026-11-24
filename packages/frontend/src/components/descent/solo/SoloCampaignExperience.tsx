/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  DESCENT_CAMPAIGN_MISSIONS,
  type DescentCampaignMissionId,
} from "@resync-game-framework/api";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { unlockDescentAudio } from "../audio/descentAudioEngine";
import { useDescentAudio } from "../audio/useDescentAudio";
import {
  attachLayerAutosave,
  attachPeriodicAutosave,
  type DescentSim,
  type SimSpeed,
  startSimDriver,
  writeSaveSlot,
} from "../logic/sim";
import {
  createSoloCampaignProgress,
  isSoloCampaignMissionUnlocked,
  readSoloCampaignProgress,
  recordSoloCampaignOutcome,
  type SoloCampaignProgress,
  writeSoloCampaignProgress,
} from "../logic/soloCampaign";
import { readDescentCampaignOutcome } from "../multiplayer/campaignOutcome";
import { DescentView } from "../views";
import { buildShellModel } from "../views/shellModel";
import {
  createSoloMissionSim,
  missionSaveSlot,
  missionSaveStorage,
  SOLO_CAMPAIGN_PLAYER,
} from "./missionSave";
import styles from "./soloCampaign.module.scss";

/** Runs one fresh campaign mission; only completed mission progress is saved.
 * @param props - Mission and shell controls
 * @returns A playable battlefield with a solo debrief
 */
function SoloMission({
  missionId,
  fresh,
  onExit,
  onRetry,
  onOutcome,
  fullscreen,
  onToggleFullscreen,
  soundEnabled,
  onSetSoundEnabled,
}: {
  missionId: DescentCampaignMissionId;
  fresh: boolean;
  onExit: () => void;
  onRetry: () => void;
  onOutcome: (
    missionId: DescentCampaignMissionId,
    outcome: "victory" | "defeat",
  ) => void;
  fullscreen: boolean;
  onToggleFullscreen?: () => void;
  soundEnabled: boolean;
  onSetSoundEnabled: (enabled: boolean) => void;
}) {
  const [sim] = useState(() => {
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);
    try {
      return createSoloMissionSim(
        missionId,
        seed[0] ?? 0,
        fresh ? undefined : window.localStorage,
      );
    } catch {
      return createSoloMissionSim(missionId, seed[0] ?? 0);
    }
  });
  const [ready, setReady] = useState(false);
  const snapshot = useSyncExternalStore(
    sim.subscribe,
    sim.snapshot,
    sim.snapshot,
  );
  const model = useMemo(
    () => buildShellModel(snapshot, SOLO_CAMPAIGN_PLAYER.id),
    [snapshot],
  );
  const outcome = readDescentCampaignOutcome(snapshot, missionId, missionId);
  const mission = DESCENT_CAMPAIGN_MISSIONS.find(
    (entry) => entry.id === missionId,
  );
  useEffect(() => {
    if (!ready) return;
    let cleanup = () => {};
    try {
      const storage = missionSaveStorage(window.localStorage, missionId);
      const slot = missionSaveSlot(missionId);
      writeSaveSlot(storage, slot, sim);
      const stopLayer = attachLayerAutosave(sim, storage, slot);
      const stopPeriodic = attachPeriodicAutosave(sim, storage, 5, slot);
      cleanup = () => {
        stopLayer();
        stopPeriodic();
        writeSaveSlot(storage, slot, sim);
      };
    } catch {
      // Storage may be unavailable; the mission remains playable.
    }
    const stop = startSimDriver(sim);
    return () => {
      stop();
      cleanup();
    };
  }, [missionId, ready, sim]);
  useEffect(() => {
    if (outcome === null) return;
    try {
      writeSaveSlot(
        missionSaveStorage(window.localStorage, missionId),
        missionSaveSlot(missionId),
        sim,
      );
    } catch {
      // Progress can still be recorded if the mission snapshot cannot be saved.
    }
    onOutcome(missionId, outcome);
  }, [missionId, onOutcome, outcome, sim]);
  useDescentAudio({
    active: true,
    enabled: soundEnabled,
    model,
    sim,
    snapshot,
  });
  return (
    <DescentView
      campaignDebrief={
        outcome === null ? undefined : (
          <div>
            <h2>
              {outcome === "victory" ? "Mission victory" : "Mission defeated"}
            </h2>
            <p>
              {outcome === "victory"
                ? "Return to select your next mission."
                : "Your progress is unchanged. Return to retry."}
            </p>
            {outcome === "defeat" ? (
              <button onClick={onRetry} type="button">
                Retry mission
              </button>
            ) : null}
            <button onClick={onExit} type="button">
              Mission select
            </button>
          </div>
        )
      }
      campaignProgress={<p>Solo campaign · {mission?.title}</p>}
      fullscreen={fullscreen}
      localPlayerId={SOLO_CAMPAIGN_PLAYER.id}
      onCommand={(command: Parameters<DescentSim["enqueue"]>[0]) =>
        sim.enqueue(command)
      }
      onExit={onExit}
      onLoaded={() => setReady(true)}
      onSetPaused={(paused: boolean) => sim.setPaused(paused)}
      onSetSoundEnabled={onSetSoundEnabled}
      onSetSpeed={(speed: SimSpeed) => sim.setSpeed(speed)}
      onToggleFullscreen={onToggleFullscreen}
      shellModel={model}
      snapshot={snapshot}
      soundEnabled={soundEnabled}
    />
  );
}

/** Presents saved solo progress and starts unlocked, fresh-force missions.
 * @param props - Navigation and display controls
 * @returns Solo mission selection or an active mission
 */
export function SoloCampaignExperience({
  onBack,
  fullscreen,
  onToggleFullscreen,
  soundEnabled,
  onSetSoundEnabled,
}: {
  onBack: () => void;
  fullscreen: boolean;
  onToggleFullscreen?: () => void;
  soundEnabled: boolean;
  onSetSoundEnabled: (enabled: boolean) => void;
}) {
  const [progress, setProgress] = useState<SoloCampaignProgress>(() => {
    if (typeof window === "undefined") return createSoloCampaignProgress();
    try {
      return (
        readSoloCampaignProgress(window.localStorage) ??
        createSoloCampaignProgress()
      );
    } catch {
      return createSoloCampaignProgress();
    }
  });
  const progressRef = useRef(progress);
  const [missionId, setMissionId] = useState<DescentCampaignMissionId | null>(
    null,
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [run, setRun] = useState({ fresh: false, number: 0 });
  const recordOutcome = useCallback(
    (id: DescentCampaignMissionId, outcome: "victory" | "defeat") => {
      const next = recordSoloCampaignOutcome(progressRef.current, id, outcome);
      if (next === progressRef.current) return;
      progressRef.current = next;
      setProgress(next);
      try {
        setSaveFailed(!writeSoloCampaignProgress(window.localStorage, next));
      } catch {
        setSaveFailed(true);
      }
    },
    [],
  );
  if (missionId !== null)
    return (
      <SoloMission
        fresh={run.fresh}
        fullscreen={fullscreen}
        key={`${missionId}-${run.number}`}
        missionId={missionId}
        onExit={() => setMissionId(null)}
        onOutcome={recordOutcome}
        onRetry={() =>
          setRun((current) => ({ fresh: true, number: current.number + 1 }))
        }
        onSetSoundEnabled={onSetSoundEnabled}
        onToggleFullscreen={onToggleFullscreen}
        soundEnabled={soundEnabled}
      />
    );
  return (
    <main className={styles.screen}>
      <section className={styles.content}>
        <p>ASHEN CRUCIBLE</p>
        <h1>Solo Campaign</h1>
        <p>
          Three increasingly difficult sieges. Each mission starts with fresh
          forces and supplies; only campaign progress carries over between
          missions. Progress and in-progress missions are saved locally in this
          browser, separately from your standard solo save.
        </p>
        {saveFailed ? (
          <p role="alert">Progress could not be saved in this browser.</p>
        ) : null}
        <ol className={styles.missions}>
          {DESCENT_CAMPAIGN_MISSIONS.map((mission, index) => {
            const unlocked = isSoloCampaignMissionUnlocked(
              progress,
              mission.id,
            );
            const complete = progress.completedMissionIds.includes(mission.id);
            return (
              <li key={mission.id}>
                <h2>
                  Mission {index + 1}: {mission.title}
                </h2>
                <p>{mission.briefing}</p>
                <button
                  disabled={!unlocked}
                  onClick={() => {
                    unlockDescentAudio();
                    setRun((current) => ({
                      fresh: complete,
                      number: current.number + 1,
                    }));
                    setMissionId(mission.id);
                  }}
                  type="button"
                >
                  {complete
                    ? "Replay mission"
                    : unlocked
                      ? "Launch mission"
                      : "Locked"}
                </button>
              </li>
            );
          })}
        </ol>
        <button onClick={onBack} type="button">
          Back to title
        </button>
      </section>
    </main>
  );
}
