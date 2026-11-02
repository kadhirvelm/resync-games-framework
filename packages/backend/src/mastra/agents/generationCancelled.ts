import { HttpException } from "@nestjs/common";
import { GENERATION_CANCELLED_STATUS } from "@resync-game-framework/api";
import { isAbortError } from "src/utils/isAbortError";

/** Message returned when a workshop stop request ends a generation. */
export const GENERATION_CANCELLED_MESSAGE = "Generation stopped.";

/**
 * Raised when a caller aborts an in-flight asset generation.
 * The HTTP status matches {@link GENERATION_CANCELLED_STATUS}.
 */
export class GenerationCancelledException extends HttpException {
  public constructor() {
    super(GENERATION_CANCELLED_MESSAGE, GENERATION_CANCELLED_STATUS);
    this.name = "GenerationCancelledException";
  }
}

/**
 * Stops the current function when the caller already aborted the run.
 * @param signal - Signal for this generation, if the caller supplied one
 * @throws GenerationCancelledException when the signal is aborted
 */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new GenerationCancelledException();
  }
}

/**
 * @param error - Failure from a model call or agent stream
 * @param signal - Signal for this generation
 * @returns Whether the run should end as a cancellation
 */
export function isGenerationAbort(
  error: unknown,
  signal: AbortSignal | undefined,
): boolean {
  return (
    error instanceof GenerationCancelledException ||
    isAbortError(error) ||
    signal?.aborted === true
  );
}
