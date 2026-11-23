import type { AttackAlert, AttackAlertSeverity } from "./attackAlert";
import type { MapPoint } from "./selection";

/** How long a minimap attack ring remains visible. */
export const MINIMAP_PING_DURATION_MS = 2_500;

/** One renderer-neutral attack ping in sim map coordinates. */
export interface MinimapPing extends MapPoint {
  /** Alert id; a coordinate/time key is used when omitted. */
  id?: string;
  severity: AttackAlertSeverity;
  /** `Date.now()` timestamp when the alert was emitted. */
  startedAt: number;
}

/** Computed SVG presentation for one live ping. */
export interface MinimapPingPresentation {
  opacity: number;
  radius: number;
}

/**
 * Converts pure attack alerts into minimap markers sharing one emission time.
 * @param alerts - Newly emitted local damage alerts
 * @param startedAt - `Date.now()` timestamp for this alert batch
 * @returns Minimap rings ready for the optional `pings` prop
 */
export function attackAlertsToMinimapPings(
  alerts: readonly AttackAlert[],
  startedAt: number,
): MinimapPing[] {
  return alerts.map((alert) => ({
    id: alert.id,
    severity: alert.severity,
    startedAt,
    x: alert.worldPosition.x,
    y: alert.worldPosition.y,
  }));
}

/**
 * Drops expired markers while retaining new and future-dated pings.
 * @param pings - Markers currently held by the shell
 * @param now - Current `Date.now()` timestamp
 * @returns Only pings younger than the display duration
 */
export function pruneMinimapPings(
  pings: readonly MinimapPing[],
  now: number,
): MinimapPing[] {
  return pings.filter(
    (ping) => now - ping.startedAt < MINIMAP_PING_DURATION_MS,
  );
}

/**
 * Computes expansion and fade for one ping. Reduced motion keeps a fixed ring
 * until expiry instead of animating its radius or opacity.
 * @param ping - Attack marker to present
 * @param now - Current `Date.now()` timestamp; zero renders the initial frame
 * @param reducedMotion - Whether the player requested reduced motion
 * @returns SVG radius/opacity, or null once the ping expires
 */
export function minimapPingPresentation(
  ping: MinimapPing,
  now: number,
  reducedMotion: boolean,
): MinimapPingPresentation | null {
  if (!Number.isFinite(ping.startedAt)) return null;
  if (now > 0 && now - ping.startedAt >= MINIMAP_PING_DURATION_MS) return null;
  if (reducedMotion) return { opacity: 0.9, radius: 2.4 };
  const age = now <= 0 ? 0 : Math.max(0, now - ping.startedAt);
  const progress = Math.min(1, age / MINIMAP_PING_DURATION_MS);
  return {
    opacity: 0.95 * (1 - progress),
    radius: 1.25 + progress * 5.75,
  };
}
