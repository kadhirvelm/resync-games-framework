import type { SaveClimbPayload } from "@towers-of-coreborn/api";

/** One change to a saved climb on the server. */
export type ClimbSyncOperation =
  | { kind: "save"; payload: SaveClimbPayload }
  | { climbId: string; kind: "delete" };

/** Sends one operation; resolves to an error message, or `undefined` on success. */
export type ClimbSyncSender = (
  operation: ClimbSyncOperation,
) => Promise<string | undefined>;

/** Pushes saved-climb changes to the server one at a time. */
export interface ClimbSyncQueue {
  /** Queues a change. A newer change to the same climb replaces a waiting one. */
  push: (operation: ClimbSyncOperation) => void;
  /** Resolves once nothing is waiting or in flight */
  settled: () => Promise<void>;
}

/**
 * @param operation - Queued change
 * @returns The climb it changes
 */
function climbIdOf(operation: ClimbSyncOperation): string {
  return operation.kind === "save" ? operation.payload.id : operation.climbId;
}

/**
 * Builds a queue that sends saved-climb changes in order, one at a time.
 * Only the latest waiting change per climb is sent, so a burst of saves
 * becomes one request, and a delete never races an earlier save of the
 * same climb.
 * @param send - Sends one operation
 * @param onResult - Told the error message after each send, or `undefined` when it succeeded
 * @returns The queue
 */
export function createClimbSyncQueue(
  send: ClimbSyncSender,
  onResult: (error: string | undefined) => void,
): ClimbSyncQueue {
  const waiting = new Map<string, ClimbSyncOperation>();
  let running: Promise<void> | undefined;

  /**
   * Sends waiting operations until none are left.
   */
  const drain = async () => {
    for (const [climbId, operation] of waiting) {
      waiting.delete(climbId);
      try {
        onResult(await send(operation));
      } catch (error) {
        onResult(error instanceof Error ? error.message : String(error));
      }
    }
    running = undefined;
  };

  return {
    push: (operation) => {
      const climbId = climbIdOf(operation);
      waiting.delete(climbId);
      waiting.set(climbId, operation);
      running ??= drain();
    },
    settled: async () => {
      while (running) {
        await running;
      }
    },
  };
}
