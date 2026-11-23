"use client";

import { useEffect, useRef, useState } from "react";
import { emitDescentAttackAlerts } from "../audio/descentAttackAlert";
import type { SimSnapshot } from "../logic/types";
import {
  type AttackAlertState,
  createAttackAlertState,
  updateAttackAlerts,
} from "./attackAlert";
import {
  attackAlertsToMinimapPings,
  MINIMAP_PING_DURATION_MS,
  type MinimapPing,
  pruneMinimapPings,
} from "./minimapPings";

/** Cap retained markers if a busy battle produces many separate regions. */
const MAX_MINIMAP_PINGS = 32;

/** Inputs for the shell's snapshot-driven attack-alert lifecycle. */
export interface UseAttackAlertsInput {
  /** Local co-op owner id; omitted means the solo Hold. */
  localPlayerId?: string;
  snapshot: SimSnapshot;
}

interface AlertRunIdentity {
  layerId: string | null;
  localPlayerId?: string;
  tick: number;
}

/**
 * Converts sim snapshots into expiring minimap pings and one audio sting per
 * alert batch. The first snapshot of a run establishes history without
 * replaying attacks that happened before the view mounted.
 * @param input - Current immutable snapshot and local ownership
 * @returns Active attack pings for `DescentMinimap`
 */
export function useAttackAlerts({
  localPlayerId,
  snapshot,
}: UseAttackAlertsInput): readonly MinimapPing[] {
  const [pings, setPings] = useState<readonly MinimapPing[]>([]);
  const alertState = useRef<AttackAlertState | null>(null);
  const runIdentity = useRef<AlertRunIdentity | null>(null);

  useEffect(() => {
    const identity = runIdentity.current;
    const ownerChanged = identity?.localPlayerId !== localPlayerId;
    const runChanged =
      identity !== null &&
      (snapshot.tick < identity.tick || snapshot.layerId !== identity.layerId);
    if (ownerChanged || runChanged) {
      alertState.current = createAttackAlertState();
      setPings([]);
    }
    runIdentity.current = {
      layerId: snapshot.layerId,
      localPlayerId,
      tick: snapshot.tick,
    };

    const now = Date.now();
    const update = updateAttackAlerts(
      alertState.current ?? createAttackAlertState(),
      {
        localPlayerId,
        now,
        snapshot,
      },
    );
    alertState.current = update.state;
    if (update.alerts.length > 0) {
      emitDescentAttackAlerts(update.alerts);
      const incoming = attackAlertsToMinimapPings(update.alerts, now);
      setPings((current) =>
        pruneMinimapPings([...current, ...incoming], now).slice(
          -MAX_MINIMAP_PINGS,
        ),
      );
      return;
    }
    setPings((current) => {
      const active = pruneMinimapPings(current, now);
      return active.length === current.length ? current : active;
    });
  }, [localPlayerId, snapshot]);

  useEffect(() => {
    if (pings.length === 0) return;
    const nextExpiry = Math.min(
      ...pings.map((ping) => ping.startedAt + MINIMAP_PING_DURATION_MS),
    );
    const timer = window.setTimeout(
      () => {
        const now = Date.now();
        setPings((current) => pruneMinimapPings(current, now));
      },
      Math.max(0, nextExpiry - Date.now()) + 16,
    );
    return () => window.clearTimeout(timer);
  }, [pings]);

  return pings;
}
