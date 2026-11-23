import type {
  AshenGateAudioId,
  AshenGateAudioSpec,
} from "../data/layers/ashen_gate/audio";
import type { AttackAlert, AttackAlertSeverity } from "../views/attackAlert";
import { playDescentAudio } from "./descentAudioEngine";

/** Canonical spec for the under-attack clip registered in `ASHEN_GATE_AUDIO`. */
export const DESCENT_ATTACK_ALERT_AUDIO_SPEC: AshenGateAudioSpec = {
  cue: "wave",
  direction:
    "Very short under-attack warning for a dark-fantasy RTS: one dry low war-drum strike immediately answered by a restrained rough bronze horn pulse, urgent and readable without being louder than battle. Complete in under 1.2 seconds, no voice, no melody, no music bed, no long echo.",
  id: "under-attack",
  loop: false,
  role: "effect",
};

/** Stable generated-audio id used by the alert runtime. */
export const DESCENT_ATTACK_ALERT_AUDIO_ID: AshenGateAudioId = "under-attack";

/** Listener notified after a rate-limited attack alert reaches the shell. */
export type DescentAttackAlertListener = (alert: AttackAlert) => void;

const listeners = new Set<DescentAttackAlertListener>();

/**
 * Plays the generated warning through Descent's existing unlocked audio graph.
 * The engine intentionally does nothing when the clip is absent, locked, or
 * muted.
 * @param severity - Critical alerts receive a slightly higher effect gain
 */
export function playDescentAttackAlert(
  severity: AttackAlertSeverity = "warning",
): void {
  const gain = severity === "critical" ? 0.82 : 0.72;
  playDescentAudio(DESCENT_ATTACK_ALERT_AUDIO_ID, gain);
}

/**
 * Emits one sound per alert batch and publishes each regional alert. Batching
 * prevents simultaneous attacks in different regions from stacking stings.
 * @param alerts - New rate-limited alerts from `updateAttackAlerts`
 */
export function emitDescentAttackAlerts(alerts: readonly AttackAlert[]): void {
  if (alerts.length === 0) return;
  const critical = alerts.some((alert) => alert.severity === "critical");
  playDescentAttackAlert(critical ? "critical" : "warning");
  for (const alert of alerts) {
    for (const listener of listeners) listener(alert);
  }
}

/**
 * Emits one alert and its generated warning.
 * @param alert - New rate-limited attack alert
 */
export function emitDescentAttackAlert(alert: AttackAlert): void {
  emitDescentAttackAlerts([alert]);
}

/**
 * Subscribes to shell attack alerts without coupling detection to React.
 * Playback does not require a subscriber; this hook is for extra UI/audio
 * integrations such as accessible announcements.
 * @param listener - Callback invoked once per emitted regional alert
 * @returns Cleanup that removes the listener
 */
export function subscribeDescentAttackAlerts(
  listener: DescentAttackAlertListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
