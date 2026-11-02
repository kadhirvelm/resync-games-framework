import type { CombatCommand, StampedCombatCommand } from "./types";

/** Deterministic FIFO queue for player combat orders. */
export class CombatCommandQueue {
  private readonly commands: StampedCombatCommand[] = [];
  private nextSequence = 0;

  /**
   * Stamps an input command for a future simulation tick.
   * @param command - Order requested by input code
   * @param issuedBy - Stable player or controller id
   * @param currentTick - Tick at which input was received
   * @param delayTicks - Number of ticks before execution
   * @returns The immutable queue entry
   */
  enqueue(
    command: CombatCommand,
    issuedBy: string,
    currentTick: number,
    delayTicks = 1,
  ): StampedCombatCommand {
    const stamped: StampedCombatCommand = {
      command: structuredClone(command),
      issuedBy,
      seq: this.nextSequence,
      tick: currentTick + Math.max(1, Math.floor(delayTicks)),
    };
    this.nextSequence += 1;
    this.commands.push(stamped);
    return structuredClone(stamped);
  }

  /**
   * Removes commands whose scheduled tick has arrived.
   * @param tick - Current simulation tick
   * @returns Ready commands in stable issue order
   */
  takeReady(tick: number): StampedCombatCommand[] {
    const ready = this.commands
      .filter((entry) => entry.tick <= tick)
      .sort((left, right) => left.tick - right.tick || left.seq - right.seq);
    const readySequences = new Set(ready.map((entry) => entry.seq));
    const waiting = this.commands.filter(
      (entry) => !readySequences.has(entry.seq),
    );
    this.commands.splice(0, this.commands.length, ...waiting);
    return ready;
  }

  /**
   * Reads queued commands without allowing callers to mutate the queue.
   * @returns A cloned queue snapshot
   */
  snapshot(): StampedCombatCommand[] {
    return structuredClone(this.commands);
  }
}
