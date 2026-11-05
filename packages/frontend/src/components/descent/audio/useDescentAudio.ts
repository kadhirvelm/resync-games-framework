"use client";

import { isServiceError } from "@resync-game-framework/api";
import { useEffect, useMemo, useRef } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import type { DescentSim } from "../logic/sim";
import type { SimSnapshot } from "../logic/types";
import { buildShellModel } from "../views/shellModel";
import {
  audioIdForFx,
  audioIdForNotice,
  musicIdForEncounter,
  resolveDescentAudioCatalog,
} from "./descentAudioCatalog";
import {
  installDescentAudioCatalog,
  playDescentAudio,
  setDescentAudioEnabled,
  setDescentAudioScene,
  stopDescentAudio,
  unlockDescentAudio,
} from "./descentAudioEngine";

/** Inputs that keep generated audio synchronized with one Descent session. */
export interface UseDescentAudioInput {
  active: boolean;
  enabled: boolean;
  sim: DescentSim;
  snapshot: SimSnapshot;
}

/**
 * Loads the generated pack and turns sim presentation/events into playback.
 * Missing clips and service failures intentionally degrade to silence.
 * @param input - Mounted sim, snapshot, and player audio preference
 */
export function useDescentAudio(input: UseDescentAudioInput): void {
  const { clientServiceCallers } = useClientServiceCallers();
  const model = useMemo(
    () => buildShellModel(input.snapshot),
    [input.snapshot],
  );
  const seenFx = useRef(new Set<number>());
  const seenNotices = useRef(new Set<number>());
  const previousBuildings = useRef(new Map<string, boolean>());
  const ready = useRef(false);
  const sessionSim = useRef(input.sim);
  if (sessionSim.current !== input.sim) {
    sessionSim.current = input.sim;
    seenFx.current.clear();
    seenNotices.current.clear();
    previousBuildings.current.clear();
    ready.current = false;
  }

  useEffect(() => {
    if ((process.env.NEXT_PUBLIC_API_CLIENT_URL ?? "").trim() === "") return;
    let cancelled = false;
    void clientServiceCallers.audio
      .list()
      .then((result) => {
        if (cancelled || isServiceError(result)) return;
        installDescentAudioCatalog(resolveDescentAudioCatalog(result.clips));
      })
      .catch(() => {
        // Descent remains playable when the asset service is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [clientServiceCallers]);

  useEffect(() => {
    setDescentAudioEnabled(input.enabled);
  }, [input.enabled]);

  useEffect(() => {
    setDescentAudioScene({
      active: input.active,
      ambience: "volcanic-ambience",
      music: musicIdForEncounter({
        boss: model.boss !== null,
        liveEnemies: model.wave?.live ?? 0,
      }),
    });
  }, [input.active, model.boss, model.wave]);

  useEffect(() => {
    if (!input.active || !ready.current) {
      for (const effect of model.fx) seenFx.current.add(effect.id);
      for (const notice of model.notices) seenNotices.current.add(notice.id);
      previousBuildings.current = new Map(
        model.buildings.map((building) => [building.id, building.constructing]),
      );
      ready.current = input.active;
      return;
    }
    for (const effect of model.fx) {
      if (seenFx.current.has(effect.id)) continue;
      seenFx.current.add(effect.id);
      const id = audioIdForFx(effect);
      if (id !== null) playDescentAudio(id);
    }
    for (const notice of model.notices) {
      if (seenNotices.current.has(notice.id)) continue;
      seenNotices.current.add(notice.id);
      const id = audioIdForNotice(notice);
      if (id !== null) playDescentAudio(id);
    }
    const nextBuildings = new Map<string, boolean>();
    for (const building of model.buildings) {
      nextBuildings.set(building.id, building.constructing);
      if (
        previousBuildings.current.get(building.id) === true &&
        !building.constructing
      ) {
        playDescentAudio("building-complete");
      }
    }
    previousBuildings.current = nextBuildings;
  }, [input.active, model.buildings, model.fx, model.notices]);

  useEffect(() => {
    if (!input.active) return;
    return input.sim.onEvent((event) => {
      if (event.type !== "module") return;
      if (event.moduleId === "waves" && event.name === "horn") {
        playDescentAudio("wave-horn");
        return;
      }
      if (event.name !== "slice_completed") return;
      if (completionOutcome(event.data) === "victory") {
        playDescentAudio("victory");
        return;
      }
      if (completionOutcome(event.data) === "defeat") {
        playDescentAudio("defeat");
      }
    });
  }, [input.active, input.sim]);

  useEffect(() => {
    const unlock = () => unlockDescentAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => () => stopDescentAudio(), []);
}

/** Reads the terminal outcome from a JSON-safe module-event payload. */
function completionOutcome(data: unknown): "defeat" | "victory" | null {
  if (typeof data !== "object" || data === null) return null;
  const outcome = (data as { outcome?: unknown }).outcome;
  if (outcome === "victory" || outcome === "defeat") return outcome;
  return null;
}
