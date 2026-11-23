import type { ClassId } from "../logic/types";

/** The player gesture answered by a unit's generated acknowledgement. */
export type DescentUnitAcknowledgementKind = "select" | "command";

/** One renderer-neutral request for a unit acknowledgement. */
export interface DescentUnitAcknowledgement {
  classId: ClassId;
  kind: DescentUnitAcknowledgementKind;
}

/** Listener notified when a battlefield selection or order needs audio. */
export type DescentUnitAcknowledgementListener = (
  acknowledgement: DescentUnitAcknowledgement,
) => void;

const listeners = new Set<DescentUnitAcknowledgementListener>();

/**
 * Publishes a unit acknowledgement without coupling the viewport to audio.
 * Missing audio subscribers and ungenerated clips both result in silence.
 * @param classId - Class whose short response should play
 * @param kind - Whether the unit was selected or ordered
 */
export function emitDescentUnitAcknowledgement(
  classId: ClassId,
  kind: DescentUnitAcknowledgementKind,
): void {
  const acknowledgement = { classId, kind };
  for (const listener of listeners) listener(acknowledgement);
}

/**
 * Subscribes the audio hook to battlefield unit acknowledgements.
 * @param listener - Playback callback invoked for each selection or order
 * @returns Cleanup that removes this listener
 */
export function subscribeDescentUnitAcknowledgement(
  listener: DescentUnitAcknowledgementListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
