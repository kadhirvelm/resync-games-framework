"use client";

import { useEffect } from "react";
import { currentRoom } from "../logic/run";
import type { RunState, TowerSoundtrack } from "../logic/towerTypes";
import { setMusic, unlockMusic } from "./music";
import { musicMoodFor, musicTrackUrl } from "./musicScore";

/**
 * Keeps the background music in step with the screen: calm on the menus,
 * warmer at camp, driving in battle, and heavier at the summit. Music waits
 * for the first click or key press, since browsers block audio until then.
 * @param run - Current climb's run, if a climb is open
 * @param enabled - Whether music is on in settings
 * @param soundtrack - Generated beds for this climb, when it has any
 */
export function useMusic(
  run: RunState | undefined,
  enabled: boolean,
  soundtrack?: TowerSoundtrack,
): void {
  const mood = musicMoodFor({
    inClimb: Boolean(run),
    isBossRoom: run ? (currentRoom(run)?.isBoss ?? false) : false,
    phase: run?.phase,
  });
  const trackUrl = musicTrackUrl(mood, soundtrack?.music);

  useEffect(() => {
    setMusic({ enabled, mood, trackUrl });
  }, [enabled, mood, trackUrl]);

  useEffect(() => {
    const unlock = () => unlockMusic();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => () => setMusic({ enabled: false, mood: "silent" }), []);
}
