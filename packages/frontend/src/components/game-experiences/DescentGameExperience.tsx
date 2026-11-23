/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import type {
  DescentCampaignState,
  DescentMapId,
  DescentRoomPlayer,
} from "@resync-game-framework/api";
import {
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
  saveSlotKey,
  startSimDriver,
  writeSaveSlot,
} from "@/components/descent/logic/sim";
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
  onCampaign: () => void;
  onMultiplayerTutorial: () => void;
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
  fullscreen,
  hasSavedRun,
  onContinue,
  onExit,
  onMultiplayer,
  onCampaign,
  onMultiplayerTutorial,
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
          <button onClick={onCampaign} type="button">
            <span>Co-op Campaign</span>
          </button>
          <button onClick={onMultiplayer} type="button">
            <span>Co-op Multiplayer</span>
          </button>
          <button onClick={onMultiplayerTutorial} type="button">
            <span>Co-op Tutorial</span>
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
  const shellModel = useMemo(() => buildShellModel(snapshot), [snapshot]);
  useDescentAudio({
    active: true,
    enabled: soundEnabled,
    model: shellModel,
    sim,
    snapshot,
  });

  return (
    <DescentView
      fullscreen={fullscreen}
      key={matchKey}
      localPlayerId={localPlayerId}
      multiplayer={{
        campaignDebrief:
          campaign !== undefined &&
          (shellModel.outcome !== null || campaign.status !== "active") ? (
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
      }}
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
  defaultMapId,
  fullscreen,
  initialRoomCode,
  onBack,
  onSetSoundEnabled,
  onToggleFullscreen,
  soundEnabled,
}: {
  defaultMapId: DescentMapId;
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
        defaultMapId={defaultMapId}
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
  const [defaultMultiplayerMap, setDefaultMultiplayerMap] =
    useState<DescentMapId>("ashen_crucible");
  const [battlefieldReady, setBattlefieldReady] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const screen = useFullscreen();
  const toggleFullscreen = screen.available ? screen.toggle : undefined;
  const isSoloPlaying = mode === "solo";
  const { hasSavedRun, restart, runId, sim, snapshot } = useDescentSim(
    isSoloPlaying && battlefieldReady,
  );
  const shellModel = useMemo(() => buildShellModel(snapshot), [snapshot]);
  useDescentAudio({
    active: isSoloPlaying,
    enabled: soundEnabled,
    model: shellModel,
    sim,
    snapshot,
  });

  /** Starts a fresh run; its battlefield loads again before the clock runs. */
  const restartRun = () => {
    setBattlefieldReady(false);
    restart();
  };

  if (mode === "multiplayer") {
    return (
      <DescentMultiplayerExperience
        defaultMapId={defaultMultiplayerMap}
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
        onCampaign={() => {
          unlockDescentAudio();
          setDefaultMultiplayerMap("ashen_campaign_1");
          setMode("multiplayer");
        }}
        onContinue={() => {
          unlockDescentAudio();
          setMode("solo");
        }}
        onExit={onExit}
        onMultiplayer={() => {
          unlockDescentAudio();
          setDefaultMultiplayerMap("ashen_crucible");
          setMode("multiplayer");
        }}
        onMultiplayerTutorial={() => {
          unlockDescentAudio();
          setDefaultMultiplayerMap("ashen_crucible_tutorial");
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
      onCommand={(command) => {
        sim.enqueue(command);
      }}
      onLoaded={() => setBattlefieldReady(true)}
      onRestart={restartRun}
      onSetPaused={(paused) => sim.setPaused(paused)}
      onSetSoundEnabled={setSoundEnabled}
      onSetSpeed={(speed) => sim.setSpeed(speed)}
      onToggleFullscreen={toggleFullscreen}
      shellModel={shellModel}
      snapshot={snapshot}
      soundEnabled={soundEnabled}
    />
  );
};
