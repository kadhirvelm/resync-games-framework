import {
  DUNGEON_ASSET_CLASS_ID,
  DUNGEON_SLOT_ASSET_CLASS_ID,
  type DungeonInFlightJob,
  isGenerationCancelled,
  isServiceError,
} from "@resync-game-framework/api";

/** A generation request that is still running, or that failed and has not been dismissed. */
export interface PendingJob {
  /** Set when this run fills a dungeon slot */
  dungeonId?: string;
  error: string | null;
  id: string;
  prompt: string;
  /** Set when this run fills a dungeon slot */
  slotId?: string;
  /** True after the user asks this run to stop, until it settles */
  stopping: boolean;
}

/** A pending job tagged with the asset class that owns it. */
interface AssetGenerationJob extends PendingJob {
  assetClassId: string;
  /**
   * True for a dungeon slot run started in this page until Redis has recorded it.
   * A refresh must not drop the job before that record exists.
   */
  awaitingServer?: boolean;
}

/** In-flight jobs, gallery refresh counts, and results kept for this session. */
export interface AssetGenerationJobState {
  jobs: AssetGenerationJob[];
  refreshKeys: Record<string, number>;
  /** Successful generate payloads, newest first, for classes that display them directly. */
  results: Record<string, unknown[]>;
}

/**
 * @returns Empty job state
 */
export function createAssetGenerationJobState(): AssetGenerationJobState {
  return { jobs: [], refreshKeys: {}, results: {} };
}

/**
 * Records a generation that has just been sent.
 * @param state - Current jobs
 * @param job - The new request, without an error yet
 * @returns State that includes the running job
 */
export function startAssetGenerationJob(
  state: AssetGenerationJobState,
  job: {
    assetClassId: string;
    /** True until Redis has the dungeon slot run */
    awaitingServer?: boolean;
    dungeonId?: string;
    id: string;
    prompt: string;
    slotId?: string;
  },
): AssetGenerationJobState {
  const next: AssetGenerationJob = {
    assetClassId: job.assetClassId,
    error: null,
    id: job.id,
    prompt: job.prompt,
    stopping: false,
  };
  if (job.awaitingServer !== undefined) {
    next.awaitingServer = job.awaitingServer;
  }
  if (job.dungeonId !== undefined) {
    next.dungeonId = job.dungeonId;
  }
  if (job.slotId !== undefined) {
    next.slotId = job.slotId;
  }

  return {
    ...state,
    jobs: [...state.jobs, next],
  };
}

/**
 * Drops a finished job and asks its class's gallery to refetch.
 * A job that was already removed does not change the refresh key.
 * @param state - Current jobs
 * @param jobId - Job that succeeded
 * @returns State without that job, with its class's refresh key incremented
 */
export function completeAssetGenerationJob(
  state: AssetGenerationJobState,
  jobId: string,
): AssetGenerationJobState {
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (job === undefined) {
    return state;
  }

  return {
    jobs: state.jobs.filter((entry) => entry.id !== jobId),
    refreshKeys: {
      ...state.refreshKeys,
      [job.assetClassId]: (state.refreshKeys[job.assetClassId] ?? 0) + 1,
    },
    results: state.results,
  };
}

/**
 * Marks a running job as waiting for the backend to stop.
 * A missing job, or one that already failed, is left alone.
 * @param state - Current jobs
 * @param jobId - Job the user asked to stop
 * @returns State with that job's stopping flag set
 */
export function markAssetGenerationJobStopping(
  state: AssetGenerationJobState,
  jobId: string,
): AssetGenerationJobState {
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (job === undefined || job.error !== null) {
    return state;
  }

  return {
    ...state,
    jobs: state.jobs.map((entry) =>
      entry.id === jobId ? { ...entry, stopping: true } : entry,
    ),
  };
}

/**
 * Marks a job as failed so the gallery can show the error.
 * @param state - Current jobs
 * @param jobId - Job that failed
 * @param message - Message to show on the job card
 * @returns State with that job's error set, or the same state when the job is gone
 */
export function failAssetGenerationJob(
  state: AssetGenerationJobState,
  jobId: string,
  message: string,
): AssetGenerationJobState {
  const job = state.jobs.find((entry) => entry.id === jobId);
  if (job === undefined) {
    return state;
  }

  return {
    ...state,
    jobs: state.jobs.map((entry) =>
      entry.id === jobId ? { ...entry, error: message } : entry,
    ),
  };
}

/**
 * Removes a job the user dismissed.
 * @param state - Current jobs
 * @param jobId - Job to remove
 * @returns State without that job
 */
export function dismissAssetGenerationJob(
  state: AssetGenerationJobState,
  jobId: string,
): AssetGenerationJobState {
  return {
    ...state,
    jobs: state.jobs.filter((entry) => entry.id !== jobId),
  };
}

/**
 * Applies a resolved `generate` call. Service callers resolve with a service
 * error object instead of rejecting, so a resolved error is still a failure.
 * @param state - Current jobs
 * @param input - The job id, the resolved value, and how to turn an error into text
 * @returns Completed state, or failed state when the result is a service error
 */
export function applyGenerationResult(
  state: AssetGenerationJobState,
  input: {
    errorMessage: (error: unknown) => string;
    jobId: string;
    /** Other galleries that should refetch after this generation succeeds. */
    refreshClassIds?: readonly string[];
    /** Keeps the payload for a gallery that has no stored list of its own. */
    rememberResult?: boolean;
    result: unknown;
  },
): AssetGenerationJobState {
  if (isGenerationCancelled(input.result)) {
    return refreshAssetClasses(
      dismissAssetGenerationJob(state, input.jobId),
      input.refreshClassIds ?? [],
    );
  }
  if (isServiceError(input.result)) {
    const job = state.jobs.find((entry) => entry.id === input.jobId);
    if (job?.stopping === true) {
      return refreshAssetClasses(
        dismissAssetGenerationJob(state, input.jobId),
        input.refreshClassIds ?? [],
      );
    }
    return refreshAssetClasses(
      failAssetGenerationJob(
        state,
        input.jobId,
        input.errorMessage(input.result),
      ),
      input.refreshClassIds ?? [],
    );
  }

  const job = state.jobs.find((entry) => entry.id === input.jobId);
  const completed = completeAssetGenerationJob(state, input.jobId);
  if (job === undefined) {
    return completed;
  }

  const remembered = rememberGenerationResult(
    completed,
    job.assetClassId,
    input.result,
    input.rememberResult === true,
  );
  return refreshAssetClasses(remembered, input.refreshClassIds ?? []);
}

/**
 * @param state - Current jobs
 * @param assetClassId - Asset class to filter by
 * @returns That class's running and failed jobs
 */
export function jobsForAssetClass(
  state: AssetGenerationJobState,
  assetClassId: string,
): PendingJob[] {
  return state.jobs.filter((job) => job.assetClassId === assetClassId);
}

/**
 * @param state - Current jobs
 * @param assetClassId - Asset class to look up
 * @returns How many times that class's gallery should have refetched
 */
export function refreshKeyForAssetClass(
  state: AssetGenerationJobState,
  assetClassId: string,
): number {
  return state.refreshKeys[assetClassId] ?? 0;
}

/**
 * @param state - Current jobs
 * @param assetClassId - Asset class to look up
 * @returns Successful results kept for that class, newest first
 */
export function resultsForAssetClass(
  state: AssetGenerationJobState,
  assetClassId: string,
): readonly unknown[] {
  return state.results[assetClassId] ?? [];
}

/**
 * Stores one successful payload when the class displays it directly.
 * @param state - Jobs after the running entry was removed
 * @param assetClassId - Class that produced the payload
 * @param result - Successful generate response
 * @param remember - Whether this class keeps its responses
 * @returns State with the result prepended, or the same completed state
 */
function rememberGenerationResult(
  state: AssetGenerationJobState,
  assetClassId: string,
  result: unknown,
  remember: boolean,
): AssetGenerationJobState {
  if (!remember) {
    return state;
  }

  return {
    ...state,
    results: {
      ...state.results,
      [assetClassId]: [result, ...(state.results[assetClassId] ?? [])],
    },
  };
}

/**
 * Matches the workshop's running jobs to Redis.
 * Jobs started on this page stay up until Redis has seen them. Jobs that
 * Redis no longer lists are finished, and their galleries refetch.
 * @param state - Current jobs
 * @param remoteJobs - Runs Redis still has
 * @returns State with restored, acknowledged, or finished dungeon slot runs
 */
export function reconcileInFlightJobs(
  state: AssetGenerationJobState,
  remoteJobs: readonly DungeonInFlightJob[],
): AssetGenerationJobState {
  const remoteIds = new Set(remoteJobs.map((job) => job.generationId));
  let next = state;
  let changed = false;

  for (const remote of remoteJobs) {
    const existing = next.jobs.find((job) => job.id === remote.generationId);
    if (existing === undefined) {
      next = startAssetGenerationJob(next, {
        assetClassId: DUNGEON_SLOT_ASSET_CLASS_ID[remote.kind],
        awaitingServer: false,
        dungeonId: remote.dungeonId,
        id: remote.generationId,
        prompt: remote.prompt,
        slotId: remote.slotId,
      });
      changed = true;
      continue;
    }
    if (existing.awaitingServer === true) {
      next = acknowledgeServerJob(next, existing.id);
      changed = true;
    }
  }

  const finishedIds = next.jobs
    .filter(
      (job) =>
        job.dungeonId !== undefined &&
        job.error === null &&
        job.awaitingServer !== true &&
        !remoteIds.has(job.id),
    )
    .map((job) => job.id);
  if (finishedIds.length > 0) {
    for (const jobId of finishedIds) {
      next = completeAssetGenerationJob(next, jobId);
    }
    next = refreshAssetClasses(next, [DUNGEON_ASSET_CLASS_ID]);
    changed = true;
  }

  if (!changed) {
    return state;
  }
  return next;
}

/**
 * @param state - Current jobs
 * @returns Jobs that fill a dungeon slot, including ones shown on another tab
 */
export function dungeonSlotJobs(state: AssetGenerationJobState): PendingJob[] {
  return state.jobs.filter((job) => job.slotId !== undefined);
}

/**
 * @param state - Current jobs
 * @param jobId - Dungeon slot run Redis has recorded
 * @returns State that will drop this job once Redis no longer lists it
 */
function acknowledgeServerJob(
  state: AssetGenerationJobState,
  jobId: string,
): AssetGenerationJobState {
  return {
    ...state,
    jobs: state.jobs.map((job) =>
      job.id === jobId ? { ...job, awaitingServer: false } : job,
    ),
  };
}

/**
 * Asks galleries to refetch.
 * @param state - Current jobs
 * @param assetClassIds - Classes whose stored assets may have changed
 * @returns State with those refresh keys incremented
 */
export function refreshAssetClasses(
  state: AssetGenerationJobState,
  assetClassIds: readonly string[],
): AssetGenerationJobState {
  if (assetClassIds.length === 0) {
    return state;
  }

  const refreshKeys = { ...state.refreshKeys };
  for (const assetClassId of assetClassIds) {
    refreshKeys[assetClassId] = (refreshKeys[assetClassId] ?? 0) + 1;
  }
  return { ...state, refreshKeys };
}
