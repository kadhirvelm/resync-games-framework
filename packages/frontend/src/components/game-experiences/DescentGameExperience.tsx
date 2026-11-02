/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ASHEN_GATE_SLICE_MODULE_ID,
  createAshenGateSim,
  isAshenGateSliceSnapshot,
} from "@/components/descent/logic/ashenGateSlice";
import {
  AUTOSAVE_SLOT,
  attachLayerAutosave,
  attachPeriodicAutosave,
  type DescentSim,
  readSaveSlot,
  saveSlotKey,
  startSimDriver,
  writeSaveSlot,
} from "@/components/descent/logic/sim";
import { DescentView } from "@/components/descent/views";
import styles from "./DescentGameExperience.module.scss";
import type { GameExperienceEntryProps } from "./gameExperienceTypes";

interface PlayableDescentSession {
  hasSavedRun: boolean;
  sim: DescentSim;
}

interface DescentStartScreenProps {
  hasSavedRun: boolean;
  onContinue: () => void;
  onExit: () => void;
  onNewGame: () => void;
}

/**
 * Picks a fresh run seed. Wall-clock and crypto reads are fine here because
 * they happen outside the sim; the sim only ever sees the resulting number.
 * @returns A 32-bit seed
 */
function createRunSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 0;
}

/**
 * Creates a fresh slice or restores the current browser autosave.
 * @returns A playable Ashen Gate session and whether it restored a save
 */
function createPlayableSession(): PlayableDescentSession {
  const sim = createAshenGateSim({ seed: createRunSeed() });
  if (typeof window === "undefined") return { hasSavedRun: false, sim };
  const saved = readSaveSlot(window.localStorage, AUTOSAVE_SLOT);
  if (saved === null) return { hasSavedRun: false, sim };
  try {
    sim.load(saved);
    if (isAshenGateSliceSnapshot(sim.snapshot())) {
      return { hasSavedRun: true, sim };
    }
  } catch {
    /* A stale or malformed save starts a new slice. */
  }
  return {
    hasSavedRun: false,
    sim: createAshenGateSim({ seed: createRunSeed() }),
  };
}

/**
 * Owns one sim for the mounted experience. It only advances and autosaves
 * after the player leaves the title screen.
 * @param active - Whether gameplay is currently visible
 * @returns The sim, its latest snapshot, and a run id that changes on restart
 */
function useDescentSim(active: boolean) {
  const [session, setSession] = useState<PlayableDescentSession>(
    createPlayableSession,
  );
  const [runId, setRunId] = useState(0);
  const { sim } = session;
  const snapshot = useSyncExternalStore(
    sim.subscribe,
    sim.snapshot,
    sim.snapshot,
  );

  useEffect(() => {
    if (!active) return;
    let stopAutosave = () => {};
    let stopPeriodicAutosave = () => {};
    let stopTerminalAutosave = () => {};
    try {
      stopAutosave = attachLayerAutosave(sim, window.localStorage);
      stopPeriodicAutosave = attachPeriodicAutosave(sim, window.localStorage);
      stopTerminalAutosave = sim.onEvent((event) => {
        if (event.type !== "module") return;
        if (event.moduleId !== ASHEN_GATE_SLICE_MODULE_ID) return;
        if (event.name !== "slice_completed") return;
        writeSaveSlot(window.localStorage, AUTOSAVE_SLOT, sim);
      });
    } catch {
      /* Storage can be blocked; the sim still runs without autosave. */
    }
    const stopDriver = startSimDriver(sim);
    return () => {
      stopDriver();
      stopAutosave();
      stopPeriodicAutosave();
      stopTerminalAutosave();
    };
  }, [active, sim]);

  /** Clears the saved run and replaces the mounted sim. */
  const restart = () => {
    try {
      window.localStorage.removeItem(saveSlotKey(AUTOSAVE_SLOT));
    } catch {
      /* Storage can be blocked; a fresh in-memory run still starts. */
    }
    setRunId((current) => current + 1);
    setSession({
      hasSavedRun: false,
      sim: createAshenGateSim({ seed: createRunSeed() }),
    });
  };

  return {
    hasSavedRun: session.hasSavedRun,
    restart,
    runId,
    sim,
    snapshot,
  };
}

/**
 * Cinematic title and start menu shown before the real-time sim begins.
 * @param props - Save availability and menu actions
 * @returns The Descent title screen
 */
function DescentStartScreen({
  hasSavedRun,
  onContinue,
  onExit,
  onNewGame,
}: DescentStartScreenProps) {
  const firstAction = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstAction.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className={styles.startScreen}>
      <div
        aria-hidden="true"
        className={styles.heroArtwork}
        data-testid="descent-title-artwork"
      />
      <div aria-hidden="true" className={styles.cavernGlow} />
      <div aria-hidden="true" className={styles.embers} />

      <section className={styles.startContent}>
        <div className={styles.titleBlock}>
          <h1>Descent</h1>
          <p className={styles.tagline}>Build. Cultivate. Survive.</p>
        </div>

        <nav aria-label="Descent main menu" className={styles.startMenu}>
          {hasSavedRun ? (
            <button
              className={styles.primaryAction}
              onClick={onContinue}
              ref={firstAction}
              type="button"
            >
              <span>Continue</span>
            </button>
          ) : null}
          <button
            className={hasSavedRun ? undefined : styles.primaryAction}
            onClick={onNewGame}
            ref={hasSavedRun ? undefined : firstAction}
            type="button"
          >
            <span>{hasSavedRun ? "New game" : "Start"}</span>
          </button>
        </nav>

        <button className={styles.libraryLink} onClick={onExit} type="button">
          <span aria-hidden="true">←</span>
          All games
        </button>
      </section>
    </main>
  );
}

/**
 * Mounts Descent behind a title screen and starts real-time simulation only
 * after the player chooses Continue or New Game.
 * @param props - Navigation supplied by the game library
 * @returns The title screen or mounted Descent RTS
 */
export const DescentGameExperience = ({ onExit }: GameExperienceEntryProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const { hasSavedRun, restart, runId, sim, snapshot } =
    useDescentSim(isPlaying);

  if (!isPlaying) {
    return (
      <DescentStartScreen
        hasSavedRun={hasSavedRun}
        onContinue={() => setIsPlaying(true)}
        onExit={onExit}
        onNewGame={() => {
          restart();
          setIsPlaying(true);
        }}
      />
    );
  }

  return (
    <DescentView
      key={runId}
      onCommand={(command) => {
        sim.enqueue(command);
      }}
      onRestart={restart}
      onSetPaused={(paused) => sim.setPaused(paused)}
      onSetSpeed={(speed) => sim.setSpeed(speed)}
      snapshot={snapshot}
    />
  );
};
