/** Minimal room fields needed to order authoritative snapshots. */
export interface GameRoomRevision {
  id: string;
  revision: number;
}

/**
 * Decides whether a room snapshot or command result is current enough to apply.
 * Different rooms are independent, equal revisions are idempotent duplicates,
 * and older revisions from delayed broadcasts/acknowledgements must not win.
 * @param current - Latest applied room, or null before joining
 * @param next - Candidate room snapshot
 * @returns `true` when the candidate cannot roll back applied state
 */
export function shouldApplyGameRoomSnapshot(
  current: GameRoomRevision | null,
  next: GameRoomRevision,
): boolean {
  if (current === null || current.id !== next.id) return true;
  return next.revision >= current.revision;
}
