/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import type {
  DescentCampaignState,
  DescentRoomPlayer,
} from "@resync-game-framework/api";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { unlockDescentAudio } from "@/components/descent/audio/descentAudioEngine";
import { useDescentAudio } from "@/components/descent/audio/useDescentAudio";
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
  type SimSpeed,
  type SimWorldState,
  saveSlotKey,
  startSimDriver,
  writeSaveSlot,
} from "@/components/descent/logic/sim";
import {
  evaluateTutorialProgress,
  shouldHoldWaveForTutorial,
} from "@/components/descent/logic/tutorial";
import {
  DescentCampaignDebrief,
  DescentCampaignProgress,
} from "@/components/descent/multiplayer/campaign/DescentCampaign";
import { DescentLobby } from "@/components/descent/multiplayer/DescentLobby";
import {
  buildDescentPlayer,
  loadOrCreateDescentPlayer,
  saveDescentPlayer,
} from "@/components/descent/multiplayer/playerIdentity";
import {
  readDescentRoomFromSearch,
  syncDescentRoomInUrl,
} from "@/components/descent/multiplayer/roomLocation";
import { useDescentMultiplayer } from "@/components/descent/multiplayer/useDescentMultiplayer";
import { DescentView } from "@/components/descent/views";
import { buildShellModel } from "@/components/descent/views/shellModel";
import { useFullscreen } from "@/components/descent/views/useFullscreen";
import styles from "./DescentGameExperience.module.scss";
import type { GameExperienceEntryProps } from "./gameExperienceTypes";

interface PlayableDescentSession {
  hasSavedRun: boolean;
  sim: DescentSim;
}

interface DescentStartScreenProps {
  /** Whether the page is fullscreen. */
  fullscreen: boolean;
  hasSavedRun: boolean;
  onContinue: () => void;
  onExit: () => void;
  onMultiplayer: () => void;
  onNewGame: () => void;
  /** Enters or leaves fullscreen; the button hides without it. */
  onToggleFullscreen?: () => void;
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

/** Local-storage key recording that the player completed or dismissed the solo tutorial. */
const SOLO_TUTORIAL_DONE_KEY = "descent.soloTutorialDone";

/**
 * Reads whether the first-run solo tutorial should start enabled.
 * @returns True on a player's first solo session before dismissal or completion
 */
function readSoloTutorialDefault(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SOLO_TUTORIAL_DONE_KEY) !== "1";
  } catch {
    return true;
  }
}

/**
 * Marks the first-run solo tutorial as completed or dismissed.
 */
function markSoloTutorialDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SOLO_TUTORIAL_DONE_KEY, "1");
  } catch {
    /* Storage can be blocked; dismissal still applies for this session. */
  }
}

/**
 * Creates a fresh slice or restores the current browser autosave.
 * @param shouldHoldWave - Optional wave-hold gate for first-run solo tutorial
 * @returns A playable Ashen Gate session and whether it restored a save
 */
function createPlayableSession(
  shouldHoldWave: (world: SimWorldState, nextWaveIndex: number) => boolean,
): PlayableDescentSession {
  const sim = createAshenGateSim({ seed: createRunSeed(), shouldHoldWave });
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
    sim: createAshenGateSim({ seed: createRunSeed(), shouldHoldWave }),
  };
}

/**
 * Owns one sim for the mounted experience. It only advances and autosaves
 * after the player leaves the title screen.
 * @param active - Whether gameplay is currently visible
 * @param tutorialActiveRef - Ref indicating whether solo tutorial wave-hold is active
 * @returns The sim, its latest snapshot, and a run id that changes on restart
 */
function useDescentSim(
  active: boolean,
  tutorialActiveRef: { current: boolean },
) {
  const shouldHoldWave = (
    world: SimWorldState,
    nextWaveIndex: number,
  ): boolean =>
    tutorialActiveRef.current &&
    shouldHoldWaveForTutorial(world, nextWaveIndex);

  const [session, setSession] = useState<PlayableDescentSession>(() =>
    createPlayableSession(shouldHoldWave),
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
  const restart = useCallback(() => {
    try {
      window.localStorage.removeItem(saveSlotKey(AUTOSAVE_SLOT));
    } catch {
      /* Storage can be blocked; a fresh in-memory run still starts. */
    }
    setRunId((current) => current + 1);
    setSession({
      hasSavedRun: false,
      sim: createAshenGateSim({
        seed: createRunSeed(),
        shouldHoldWave: (world, nextWaveIndex) =>
          tutorialActiveRef.current &&
          shouldHoldWaveForTutorial(world, nextWaveIndex),
      }),
    });
  }, [tutorialActiveRef]);

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
  fullscreen,
  hasSavedRun,
  onContinue,
  onExit,
  onMultiplayer,
  onNewGame,
  onToggleFullscreen,
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
          <button onClick={onMultiplayer} type="button">
            <span>Co-op Multiplayer</span>
          </button>
        </nav>

        <div className={styles.startLinks}>
          <button className={styles.libraryLink} onClick={onExit} type="button">
            <span aria-hidden="true">←</span>
            All games
          </button>
          {onToggleFullscreen === undefined ? null : (
            <button
              aria-pressed={fullscreen}
              className={styles.libraryLink}
              onClick={onToggleFullscreen}
              type="button"
            >
              <span aria-hidden="true">{fullscreen ? "⤡" : "⤢"}</span>
              {fullscreen ? "Windowed" : "Fullscreen"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

/**
 * Active multiplayer match screen: wires audio and the Descent battlefield
 * once the lockstep simulation has been initialized.
 * @param props - Live sim, snapshot, room metadata, and command callbacks
 * @returns Mounted Descent RTS view for co-op play
 */
function DescentMultiplayerMatch({
  campaign,
  onCampaignAction,
  roster,
  fullscreen,
  isHost,
  isParticipant,
  localPlayerId,
  matchError,
  matchKey,
  onCommand,
  onLeaveRoom,
  onRestart,
  onSetPaused,
  onSetSoundEnabled,
  onSetSpeed,
  onToggleFullscreen,
  roomId,
  sim,
  snapshot,
  soundEnabled,
  tutorialMode,
}: {
  campaign?: DescentCampaignState;
  onCampaignAction: (action: "retry" | "advance") => Promise<void>;
  roster: readonly DescentRoomPlayer[];
  fullscreen: boolean;
  isHost: boolean;
  isParticipant: boolean;
  localPlayerId: string;
  matchError: string | null;
  matchKey: string;
  onCommand: (command: Parameters<DescentSim["enqueue"]>[0]) => void;
  onLeaveRoom: () => Promise<void>;
  onRestart: () => void;
  onSetPaused: (paused: boolean) => void;
  onSetSoundEnabled: (enabled: boolean) => void;
  onSetSpeed: (speed: SimSpeed) => void;
  onToggleFullscreen?: () => void;
  roomId: string;
  sim: DescentSim;
  snapshot: ReturnType<DescentSim["snapshot"]>;
  soundEnabled: boolean;
  tutorialMode: boolean;
}) {
  const shellModel = useMemo(
    () => buildShellModel(snapshot, localPlayerId),
    [localPlayerId, snapshot],
  );
  useDescentAudio({
    active: true,
    enabled: soundEnabled,
    model: shellModel,
    sim,
    snapshot,
  });

  const hasOutcome = shellModel.outcome !== null;
  const multiplayerBar = useMemo(
    () => ({
      campaignDebrief:
        campaign !== undefined &&
        (hasOutcome || campaign.status !== "active") ? (
          <DescentCampaignDebrief
            campaign={campaign}
            error={matchError}
            isHost={isHost}
            onAction={onCampaignAction}
            onExit={onLeaveRoom}
            roster={roster}
          />
        ) : undefined,
      campaignProgress:
        campaign === undefined ? undefined : (
          <DescentCampaignProgress campaign={campaign} />
        ),
      error: matchError,
      isSpectator: !isParticipant,
      onLeaveRoom,
      onRestart:
        isHost && campaign === undefined && matchError !== null
          ? () => void onRestart()
          : undefined,
      roomId,
    }),
    [
      campaign,
      hasOutcome,
      isHost,
      isParticipant,
      matchError,
      onCampaignAction,
      onLeaveRoom,
      onRestart,
      roomId,
      roster,
    ],
  );

  return (
    <DescentView
      fullscreen={fullscreen}
      key={matchKey}
      localPlayerId={localPlayerId}
      multiplayer={multiplayerBar}
      onCommand={onCommand}
      onRestart={isHost && campaign === undefined ? onRestart : undefined}
      onSetPaused={onSetPaused}
      onSetSoundEnabled={onSetSoundEnabled}
      onSetSpeed={onSetSpeed}
      onToggleFullscreen={onToggleFullscreen}
      shellModel={shellModel}
      snapshot={snapshot}
      soundEnabled={soundEnabled}
      tutorialMode={tutorialMode}
    />
  );
}

/**
 * Dedicated co-op multiplayer view that owns the Socket.IO room lifecycle
 * and lockstep simulation only while the player is in multiplayer mode.
 * @param props - Fullscreen/audio controls and callback to return to title
 * @returns The co-op lobby or live multiplayer Descent battlefield
 */
function DescentMultiplayerExperience({
  fullscreen,
  initialRoomCode,
  onBack,
  onSetSoundEnabled,
  onToggleFullscreen,
  soundEnabled,
}: {
  fullscreen: boolean;
  initialRoomCode: string | null;
  onBack: () => void;
  onSetSoundEnabled: (enabled: boolean) => void;
  onToggleFullscreen?: () => void;
  soundEnabled: boolean;
}) {
  const [player, setPlayer] = useState(loadOrCreateDescentPlayer);
  const {
    createRoom,
    error,
    isHost,
    isParticipant,
    joinRoom,
    leaveRoom,
    matchError,
    rejoiningRoomId,
    room,
    sendCommand,
    setPaused,
    setSpeed,
    sim,
    snapshot,
    startMatch,
    startCampaignAction,
    status,
  } = useDescentMultiplayer(player, { initialRoomCode });

  const handlePlayerNameChange = (name: string) => {
    const updated = buildDescentPlayer(name, player);
    setPlayer(updated);
    if (typeof window !== "undefined") {
      saveDescentPlayer(window.localStorage, updated);
    }
  };

  if (
    room === null ||
    room.gameState.phase !== "playing" ||
    sim === null ||
    snapshot === null
  ) {
    return (
      <DescentLobby
        error={matchError ?? error}
        isHost={isHost}
        onBack={async () => {
          if (await leaveRoom()) onBack();
        }}
        onCreateRoom={createRoom}
        onJoinRoom={joinRoom}
        onLeaveRoom={leaveRoom}
        onPlayerNameChange={handlePlayerNameChange}
        onStartMatch={async (selectedMapId) => {
          unlockDescentAudio();
          await startMatch(selectedMapId);
        }}
        player={player}
        rejoiningRoomId={rejoiningRoomId}
        room={room}
        status={status}
      />
    );
  }

  return (
    <DescentMultiplayerMatch
      campaign={room.gameState.campaign}
      fullscreen={fullscreen}
      isHost={isHost}
      isParticipant={isParticipant}
      localPlayerId={player.id}
      matchError={matchError ?? error}
      matchKey={room.gameState.matchId ?? room.id}
      onCampaignAction={startCampaignAction}
      onCommand={sendCommand}
      onLeaveRoom={async () => {
        if (await leaveRoom()) onBack();
      }}
      onRestart={() => void startMatch(room.gameState.mapId)}
      onSetPaused={setPaused}
      onSetSoundEnabled={onSetSoundEnabled}
      onSetSpeed={setSpeed}
      onToggleFullscreen={onToggleFullscreen}
      roomId={room.id}
      roster={room.gameState.roster}
      sim={sim}
      snapshot={snapshot}
      soundEnabled={soundEnabled}
      tutorialMode={room.gameState.mapId === "ashen_crucible_tutorial"}
    />
  );
}

/**
 * Mounts Descent behind a title screen. Real-time simulation starts only
 * after the player chooses Continue, New Game, or Co-op Multiplayer and the
 * battlefield has finished loading behind its loading screen.
 * @param props - Navigation supplied by the game library
 * @returns The title screen, co-op lobby, or mounted Descent RTS
 */
export const DescentGameExperience = ({ onExit }: GameExperienceEntryProps) => {
  const [initialRoomCode, setInitialRoomCode] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : readDescentRoomFromSearch(window.location.search),
  );
  const [mode, setMode] = useState<"multiplayer" | "solo" | "title">(() =>
    initialRoomCode === null ? "title" : "multiplayer",
  );
  const [battlefieldReady, setBattlefieldReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soloTutorialActive, setSoloTutorialActive] = useState(
    readSoloTutorialDefault,
  );
  const soloTutorialRef = useRef(soloTutorialActive);
  soloTutorialRef.current = soloTutorialActive;
  const soloTutorialMarkedDoneRef = useRef(!soloTutorialActive);
  const screen = useFullscreen();
  const toggleFullscreen = screen.available ? screen.toggle : undefined;
  const isSoloPlaying = mode === "solo";
  const { hasSavedRun, restart, runId, sim, snapshot } = useDescentSim(
    isSoloPlaying && battlefieldReady,
    soloTutorialRef,
  );
  const shellModel = useMemo(() => buildShellModel(snapshot), [snapshot]);

  useEffect(() => {
    if (
      !isSoloPlaying ||
      !soloTutorialActive ||
      soloTutorialMarkedDoneRef.current
    ) {
      return;
    }
    if (evaluateTutorialProgress(snapshot).allComplete) {
      soloTutorialMarkedDoneRef.current = true;
      markSoloTutorialDone();
    }
  }, [isSoloPlaying, soloTutorialActive, snapshot]);

  /** Dismisses the solo tutorial guide and releases any held tutorial waves. */
  const dismissSoloTutorial = useCallback(() => {
    soloTutorialRef.current = false;
    soloTutorialMarkedDoneRef.current = true;
    setSoloTutorialActive(false);
    markSoloTutorialDone();
  }, []);
  useDescentAudio({
    active: isSoloPlaying,
    enabled: soundEnabled,
    model: shellModel,
    sim,
    snapshot,
  });

  /** Starts a fresh run; its battlefield loads again before the clock runs. */
  const restartRun = useCallback(() => {
    setBattlefieldReady(false);
    restart();
  }, [restart]);

  /** Enqueues one player command against the active solo sim. */
  const handleSoloCommand = useCallback(
    (command: Parameters<DescentSim["enqueue"]>[0]) => {
      sim.enqueue(command);
    },
    [sim],
  );

  /** Marks the solo battlefield ready so the simulation clock can start. */
  const handleSoloLoaded = useCallback(() => {
    setBattlefieldReady(true);
  }, []);

  /** Pauses or resumes the active solo sim. */
  const handleSoloSetPaused = useCallback(
    (paused: boolean) => {
      sim.setPaused(paused);
    },
    [sim],
  );

  /** Updates the active solo sim speed multiplier. */
  const handleSoloSetSpeed = useCallback(
    (speed: SimSpeed) => {
      sim.setSpeed(speed);
    },
    [sim],
  );

  if (mode === "multiplayer") {
    return (
      <DescentMultiplayerExperience
        fullscreen={screen.fullscreen}
        initialRoomCode={initialRoomCode}
        onBack={() => {
          setInitialRoomCode(null);
          syncDescentRoomInUrl(null);
          setMode("title");
        }}
        onSetSoundEnabled={setSoundEnabled}
        onToggleFullscreen={toggleFullscreen}
        soundEnabled={soundEnabled}
      />
    );
  }

  if (!isSoloPlaying) {
    return (
      <DescentStartScreen
        fullscreen={screen.fullscreen}
        hasSavedRun={hasSavedRun}
        onContinue={() => {
          unlockDescentAudio();
          setMode("solo");
        }}
        onExit={onExit}
        onMultiplayer={() => {
          unlockDescentAudio();
          setMode("multiplayer");
        }}
        onNewGame={() => {
          unlockDescentAudio();
          restartRun();
          setMode("solo");
        }}
        onToggleFullscreen={toggleFullscreen}
      />
    );
  }

  return (
    <DescentView
      fullscreen={screen.fullscreen}
      key={runId}
      onCommand={handleSoloCommand}
      onDismissTutorial={dismissSoloTutorial}
      onLoaded={handleSoloLoaded}
      onRestart={restartRun}
      onSetPaused={handleSoloSetPaused}
      onSetSoundEnabled={setSoundEnabled}
      onSetSpeed={handleSoloSetSpeed}
      onToggleFullscreen={toggleFullscreen}
      shellModel={shellModel}
      snapshot={snapshot}
      soundEnabled={soundEnabled}
      tutorialMode={soloTutorialActive}
    />
  );
};
