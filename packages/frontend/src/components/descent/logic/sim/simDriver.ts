import { TICK_MS } from "./constants";
import type { DescentSim } from "./descentSim";

/** Frame clock injected so tests can drive the loop by hand. */
export interface FrameScheduler {
  /** @param handle - Value returned by `request` */
  cancel(handle: number): void;
  /**
   * @param callback - Receives a monotonic timestamp in milliseconds
   * @returns A handle for `cancel`
   */
  request(callback: (timeMs: number) => void): number;
}

/** Driver tuning. */
export interface SimDriverOptions {
  /** Most frame steps run in one callback after a stall. Default 5. */
  maxStepsPerFrame?: number;
  /** Defaults to `requestAnimationFrame`. */
  scheduler?: FrameScheduler;
  /** Real milliseconds per frame step. Defaults to `TICK_MS`. */
  stepMs?: number;
}

/** Result of one accumulator update. */
export interface DueSteps {
  accumulatorMs: number;
  steps: number;
}

/**
 * Fixed-timestep accumulator. Each due step calls `stepFrame`, which runs
 * `speed` ticks, so speed multiplies ticks per frame step instead of
 * shortening ticks. Time beyond `maxSteps` is dropped rather than replayed.
 * @param accumulatorMs - Leftover real time from earlier frames
 * @param elapsedMs - Real time since the previous frame
 * @param stepMs - Real time per frame step
 * @param maxSteps - Cap on steps for this frame
 * @returns Steps to run and the remaining accumulator
 */
export function computeDueSteps(
  accumulatorMs: number,
  elapsedMs: number,
  stepMs: number,
  maxSteps: number,
): DueSteps {
  const total = accumulatorMs + Math.max(0, elapsedMs);
  const steps = Math.min(Math.floor(total / stepMs), maxSteps);
  if (steps === maxSteps) {
    return { accumulatorMs: 0, steps };
  }
  return { accumulatorMs: total - steps * stepMs, steps };
}

/**
 * Default scheduler backed by `requestAnimationFrame`.
 * @returns A browser frame scheduler
 */
function browserScheduler(): FrameScheduler {
  return {
    cancel: (handle) => cancelAnimationFrame(handle),
    request: (callback) => requestAnimationFrame(callback),
  };
}

/**
 * Runs the sim in real time. This is the only place wall-clock time is read;
 * the sim itself only sees whole ticks.
 * @param sim - Sim to advance
 * @param options - Scheduler and timing overrides
 * @returns Function that stops the loop
 */
export function startSimDriver(
  sim: Pick<DescentSim, "paused" | "stepFrame">,
  options: SimDriverOptions = {},
): () => void {
  const scheduler = options.scheduler ?? browserScheduler();
  const stepMs = options.stepMs ?? TICK_MS;
  const maxSteps = options.maxStepsPerFrame ?? 5;
  let accumulatorMs = 0;
  let previousMs: number | null = null;
  let running = true;
  let handle = 0;

  /** @param timeMs - Frame timestamp */
  const frame = (timeMs: number) => {
    if (!running) return;
    const elapsedMs = previousMs === null ? 0 : timeMs - previousMs;
    previousMs = timeMs;
    if (sim.paused) {
      accumulatorMs = 0;
    } else {
      const due = computeDueSteps(accumulatorMs, elapsedMs, stepMs, maxSteps);
      accumulatorMs = due.accumulatorMs;
      for (let index = 0; index < due.steps && !sim.paused; index += 1) {
        sim.stepFrame();
      }
    }
    handle = scheduler.request(frame);
  };

  handle = scheduler.request(frame);
  return () => {
    running = false;
    scheduler.cancel(handle);
  };
}
