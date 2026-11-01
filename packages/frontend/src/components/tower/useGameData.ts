"use client";

import { useCallback, useEffect } from "react";
import { configureSound } from "./audio/sound";
import {
  createProfile,
  type PlayerProfile,
  parseProfile,
  recordDiscoveries,
  settleClimb,
} from "./logic/progression";
import {
  isClimbOver,
  parseSaveSlots,
  removeClimb,
  type SaveSlots,
  storeClimb,
} from "./logic/saveGame";
import {
  DEFAULT_SETTINGS,
  type GameSettings,
  parseSettings,
} from "./logic/settings";
import { STORAGE_KEYS, useStoredState } from "./persistence";
import type { TowerRunActions, TowerSession } from "./useTowerRun";

/** Everything the game keeps between visits. */
export interface GameData {
  /** Clears the profile, saves, and settings */
  eraseAll: () => void;
  profile: PlayerProfile;
  /** Drops one tower's saved climb */
  removeSave: (towerId: string) => void;
  saves: SaveSlots;
  setProfile: React.Dispatch<React.SetStateAction<PlayerProfile>>;
  settings: GameSettings;
  updateSettings: (change: Partial<GameSettings>) => void;
}

/**
 * Loads the profile, saved climbs, and settings, and keeps them in step with
 * the current climb: every change is saved to its tower's slot, discoveries
 * go into the codex, and a finished climb is banked exactly once.
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
  const [saves, setSaves] = useStoredState(STORAGE_KEYS.saves, parseSaveSlots);
  const [settings, setSettings] = useStoredState(
    STORAGE_KEYS.settings,
    parseSettings,
  );

  useEffect(() => {
    configureSound({ muted: settings.muted, volume: settings.volume });
  }, [settings.muted, settings.volume]);

  useEffect(() => {
    if (!session || isClimbOver(session.run)) {
      return;
    }
    setSaves((current) =>
      storeClimb(current, {
        battleNumber: session.battleNumber,
        content: session.content,
        run: session.run,
        savedAt: Date.now(),
        version: 1,
      }),
    );
    setProfile((current) =>
      recordDiscoveries(current, session.content, session.run),
    );
  }, [session, setProfile, setSaves]);

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
    setSaves((current) => removeClimb(current, session.content.id));
    actions.settle(settled.summary);
  }, [actions, profile, session, setProfile, setSaves]);

  const updateSettings = useCallback(
    (change: Partial<GameSettings>) =>
      setSettings((current) => ({ ...current, ...change })),
    [setSettings],
  );

  const removeSave = useCallback(
    (towerId: string) => setSaves((current) => removeClimb(current, towerId)),
    [setSaves],
  );

  const eraseAll = useCallback(() => {
    setProfile(createProfile());
    setSaves({});
    setSettings(DEFAULT_SETTINGS);
  }, [setProfile, setSaves, setSettings]);

  return {
    eraseAll,
    profile,
    removeSave,
    saves,
    setProfile,
    settings,
    updateSettings,
  };
}
