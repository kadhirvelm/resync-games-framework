/** Snapshot of the battlefield's opening load, for the loading screen. */
export interface LoadingProgress {
  /** Loads that finished, including ones that failed into a stand-in. */
  completed: number;
  /** Loads that failed; their procedural stand-ins stay in place. */
  failed: number;
  /** Label of the oldest load still running, or null when none are. */
  current: string | null;
  /** Loads started so far. More can start after earlier ones finish. */
  total: number;
}

/**
 * Wraps one piece of loading work so the loading screen can count it.
 * The returned promise settles exactly like `work`.
 */
export type TrackLoad = <T>(label: string, work: Promise<T>) => Promise<T>;

/** Counts loads as they start and finish. */
export interface LoadingTracker {
  /** Latest counts. */
  progress: () => LoadingProgress;
  track: TrackLoad;
}

/** Progress before anything has started. */
export const EMPTY_LOADING_PROGRESS: LoadingProgress = {
  completed: 0,
  current: null,
  failed: 0,
  total: 0,
};

/**
 * Passes work through untracked, for callers that do not show progress.
 * @param _label - Ignored
 * @param work - Loading work
 * @returns `work` unchanged
 */
export const untrackedLoad: TrackLoad = (_label, work) => work;

/**
 * Creates a tracker that reports each start and finish.
 * @param onChange - Receives fresh counts after every change
 * @returns The tracker
 */
export function createLoadingTracker(
  onChange: (progress: LoadingProgress) => void,
): LoadingTracker {
  let nextId = 0;
  const pending = new Map<number, string>();
  let completed = 0;
  let failed = 0;
  let total = 0;

  const progress = (): LoadingProgress => ({
    completed,
    current: pending.values().next().value ?? null,
    failed,
    total,
  });

  const track: TrackLoad = (label, work) => {
    const id = nextId;
    nextId += 1;
    pending.set(id, label);
    total += 1;
    onChange(progress());
    const settle = (ok: boolean) => {
      pending.delete(id);
      completed += 1;
      if (!ok) failed += 1;
      onChange(progress());
    };
    work.then(
      () => settle(true),
      () => settle(false),
    );
    return work;
  };

  return { progress, track };
}

/**
 * Fraction of started loads that finished. Callers keep the shown bar from
 * moving backward when new loads start.
 * @param progress - Current counts
 * @returns A value from 0 to 1; 0 before anything starts
 */
export function loadingFraction(progress: LoadingProgress): number {
  if (progress.total === 0) return 0;
  return Math.min(1, progress.completed / progress.total);
}

/**
 * Resolves after `work` settles or `ms` passes, whichever comes first, so a
 * hung request cannot hold the loading screen forever.
 * @param work - Loading work
 * @param ms - Longest wait in milliseconds
 * @returns Whether the work settled before the deadline
 */
export function settleWithin(
  work: Promise<unknown>,
  ms: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = () => {
      clearTimeout(timer);
      resolve(true);
    };
    work.then(done, done);
  });
}
