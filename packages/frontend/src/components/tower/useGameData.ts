"use client";

import { useCallback, useEffect } from "react";
import { configureSound } from "./audio/sound";
import { useMusic } from "./audio/useMusic";
import {
  createProfile,
  type PlayerProfile,
  parseProfile,
  recordDiscoveries,
  settleClimb,
} from "./logic/progression";
import { isClimbOver, SAVE_VERSION } from "./logic/saveGame";
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  parseSettings,
} from "./logic/settings";
import { STORAGE_KEYS, useStoredState } from "./persistence";
import { type PlayerData, usePlayer } from "./usePlayer";
import type { TowerRunActions, TowerSession } from "./useTowerRun";

/** Everything the game keeps between visits. */
export interface GameData {
  /** Clears the profile, settings, cultivators, and saved climbs */
  eraseAll: () => void;
  /** Cultivators and saved climbs, kept on the server */
  player: PlayerData;
  profile: PlayerProfile;
  setProfile: React.Dispatch<React.SetStateAction<PlayerProfile>>;
  settings: GameSettings;
  updateSettings: (change: Partial<GameSettings>) => void;
}

/**
 * Loads the profile and settings from this browser, and the cultivators and
 * saved climbs from the server, and keeps them in step with the current
 * climb: every change is saved to the climb's own slot, discoveries go into
 * the codex, and a finished climb is banked exactly once.
 * @param session - Current climb, if any
 * @param actions - Climb actions, used to mark a climb as settled
 * @returns Stored data and the ways to change it
 */
export function useGameData(
  session: TowerSession | null,
  actions: Pick<TowerRunActions, "settle">,
): GameData {
  const [profile, setProfile] = useStoredState(
    STORAGE_KEYS.profile,
    parseProfile,
  );
  const [settings, setSettings] = useStoredState(
    STORAGE_KEYS.settings,
    parseSettings,
  );
  const player = usePlayer();
  const { removeClimb, storeClimb } = player;

  useEffect(() => {
    configureSound({ muted: settings.muted, volume: settings.volume });
  }, [settings.muted, settings.volume]);
  useMusic(session?.run, settings.music, session?.content.soundtrack);

  useEffect(() => {
    if (!session || isClimbOver(session.run)) {
      return;
    }
    storeClimb({
      battleNumber: session.battleNumber,
      content: session.content,
      cultivatorId: session.cultivatorId,
      id: session.climbId,
      run: session.run,
      savedAt: Date.now(),
      version: SAVE_VERSION,
    });
    setProfile((current) =>
      recordDiscoveries(current, session.content, session.run),
    );
  }, [session, setProfile, storeClimb]);

  useEffect(() => {
    if (!session || session.summary || !isClimbOver(session.run)) {
      return;
    }
    const settled = settleClimb(
      profile,
      session.content,
      session.run,
      Date.now(),
    );
    setProfile(settled.profile);
    removeClimb(session.climbId);
    actions.settle(settled.summary);
  }, [actions, profile, removeClimb, session, setProfile]);

  const updateSettings = useCallback(
    (change: Partial<GameSettings>) =>
      setSettings((current) => ({ ...current, ...change })),
    [setSettings],
  );

  const { eraseAll: erasePlayer } = player;
  const eraseAll = useCallback(() => {
    setProfile(createProfile());
    setSettings(DEFAULT_SETTINGS);
    void erasePlayer();
  }, [erasePlayer, setProfile, setSettings]);

  return {
    eraseAll,
    player,
    profile,
    setProfile,
    settings,
    updateSettings,
  };
}
