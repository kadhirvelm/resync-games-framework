"use client";

import { useEffect } from "react";
import { AMBIENCE_GAIN, connectLoop } from "./clips";
import { audioGraph } from "./sound";

/**
 * Loops a room tone while the caller is mounted, and stops it on the way out.
 * Mute is handled by the shared master gain.
 * @param url - Ambience mp3, when this room has one
 */
export function useAmbience(url: string | undefined): void {
  useEffect(() => {
    if (!url) {
      return;
    }
    const graph = audioGraph();
    if (!graph) {
      return;
    }
    let stop = () => {};
    let cancelled = false;
    void connectLoop(url, graph.master, AMBIENCE_GAIN).then((stopLoop) => {
      if (cancelled || stopLoop === undefined) {
        stopLoop?.();
        return;
      }
      stop = stopLoop;
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [url]);
}
