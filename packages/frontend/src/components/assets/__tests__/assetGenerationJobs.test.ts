import { describe, expect, test } from "bun:test";
import {
  DUNGEON_ASSET_CLASS_ID,
  GENERATION_CANCELLED_STATUS,
  type ServiceError,
} from "@resync-game-framework/api";
import {
  applyGenerationResult,
  completeAssetGenerationJob,
  createAssetGenerationJobState,
  dismissAssetGenerationJob,
  dungeonSlotJobs,
  failAssetGenerationJob,
  jobsForAssetClass,
  markAssetGenerationJobStopping,
  reconcileInFlightJobs,
  refreshKeyForAssetClass,
  resultsForAssetClass,
  startAssetGenerationJob,
} from "../assetGenerationJobs";

const serviceError: ServiceError = {
  code: 500,
  message: "model down",
  path: "/card-characters/generate",
  type: "error",
};

describe("asset generation jobs", () => {
  test("keeps each class's jobs and refresh keys separate", () => {
    const started = [startOther("other-1"), startCard("card-1")].reduce(
      (state, update) => update(state),
      createAssetGenerationJobState(),
    );
    const finished = completeAssetGenerationJob(started, "other-1");

    expect(jobsForAssetClass(finished, "other-class")).toEqual([]);
    expect(jobsForAssetClass(finished, "card-characters")).toEqual([
      {
        assetClassId: "card-characters",
        error: null,
        id: "card-1",
        prompt: "a knight",
        stopping: false,
      },
    ]);
    expect(refreshKeyForAssetClass(finished, "other-class")).toBe(1);
    expect(refreshKeyForAssetClass(finished, "card-characters")).toBe(0);
  });

  test("treats a resolved service error as a failed job", () => {
    const started = startOther("other-1")(createAssetGenerationJobState());
    const failed = applyGenerationResult(started, {
      errorMessage: (error) => (error as ServiceError).message,
      jobId: "other-1",
      result: serviceError,
    });

    expect(jobsForAssetClass(failed, "other-class")[0]?.error).toBe(
      "model down",
    );
    expect(refreshKeyForAssetClass(failed, "other-class")).toBe(0);
  });

  test("refetches after a successful result and drops the job", () => {
    const started = startOther("other-1")(createAssetGenerationJobState());
    const finished = applyGenerationResult(started, {
      errorMessage: () => "unused",
      jobId: "other-1",
      result: { fileName: "a.png" },
    });

    expect(jobsForAssetClass(finished, "other-class")).toEqual([]);
    expect(refreshKeyForAssetClass(finished, "other-class")).toBe(1);
  });

  test("drops a job the user stopped without refetching", () => {
    const started = startOther("other-1")(createAssetGenerationJobState());
    const stopping = markAssetGenerationJobStopping(started, "other-1");
    const cancelled = applyGenerationResult(stopping, {
      errorMessage: () => "unused",
      jobId: "other-1",
      result: { ...serviceError, code: GENERATION_CANCELLED_STATUS },
    });

    expect(jobsForAssetClass(cancelled, "other-class")).toEqual([]);
    expect(refreshKeyForAssetClass(cancelled, "other-class")).toBe(0);
  });

  test("keeps a finished asset when stop loses the race", () => {
    const started = startOther("other-1")(createAssetGenerationJobState());
    const stopping = markAssetGenerationJobStopping(started, "other-1");
    const finished = applyGenerationResult(stopping, {
      errorMessage: () => "unused",
      jobId: "other-1",
      result: { fileName: "a.png" },
    });

    expect(jobsForAssetClass(finished, "other-class")).toEqual([]);
    expect(refreshKeyForAssetClass(finished, "other-class")).toBe(1);
  });

  test("keeps a dungeon result and refreshes the asset galleries it fills", () => {
    const started = startOther("dungeon-1")(createAssetGenerationJobState());
    const finished = applyGenerationResult(started, {
      errorMessage: () => "unused",
      jobId: "dungeon-1",
      refreshClassIds: ["card-characters", "battle-backgrounds"],
      rememberResult: true,
      result: { summary: "A drowned belfry." },
    });

    expect(jobsForAssetClass(finished, "other-class")).toEqual([]);
    expect(resultsForAssetClass(finished, "other-class")).toEqual([
      { summary: "A drowned belfry." },
    ]);
    expect(refreshKeyForAssetClass(finished, "card-characters")).toBe(1);
    expect(refreshKeyForAssetClass(finished, "battle-backgrounds")).toBe(1);
  });

  test("restores a Redis slot run and clears it when Redis drops it", () => {
    const restored = reconcileInFlightJobs(createAssetGenerationJobState(), [
      {
        dungeonId: "dungeon-1",
        generationId: "run-1",
        kind: "enemy",
        prompt: "A moss bell",
        slotId: "slot-1",
        startedAt: "2026-10-18T00:00:00.000Z",
      },
    ]);

    expect(jobsForAssetClass(restored, "enemies")).toEqual([
      {
        assetClassId: "enemies",
        awaitingServer: false,
        dungeonId: "dungeon-1",
        error: null,
        id: "run-1",
        prompt: "A moss bell",
        slotId: "slot-1",
        stopping: false,
      },
    ]);
    expect(dungeonSlotJobs(restored)).toHaveLength(1);

    const finished = reconcileInFlightJobs(restored, []);

    expect(jobsForAssetClass(finished, "enemies")).toEqual([]);
    expect(refreshKeyForAssetClass(finished, "enemies")).toBe(1);
    expect(refreshKeyForAssetClass(finished, DUNGEON_ASSET_CLASS_ID)).toBe(1);
  });

  test("keeps a slot run that this page started until Redis lists it", () => {
    const started = startAssetGenerationJob(createAssetGenerationJobState(), {
      assetClassId: "enemies",
      awaitingServer: true,
      dungeonId: "dungeon-1",
      id: "run-1",
      prompt: "A moss bell",
      slotId: "slot-1",
    });

    const waiting = reconcileInFlightJobs(started, []);

    expect(waiting).toBe(started);
    expect(jobsForAssetClass(waiting, "enemies")).toHaveLength(1);
  });

  test("does not refetch a job that was already dismissed", () => {
    const started = startOther("other-1")(createAssetGenerationJobState());
    const dismissed = dismissAssetGenerationJob(started, "other-1");
    const finished = completeAssetGenerationJob(dismissed, "other-1");
    const failed = failAssetGenerationJob(dismissed, "other-1", "too late");

    expect(finished).toBe(dismissed);
    expect(failed).toBe(dismissed);
    expect(refreshKeyForAssetClass(finished, "other-class")).toBe(0);
  });
});

/**
 * @param id - Job id
 * @returns A state update that starts a job for a second asset class
 */
function startOther(id: string) {
  return (state: ReturnType<typeof createAssetGenerationJobState>) =>
    startAssetGenerationJob(state, {
      assetClassId: "other-class",
      id,
      prompt: "a knight",
    });
}

/**
 * @param id - Job id
 * @returns A state update that starts a card-character job
 */
function startCard(id: string) {
  return (state: ReturnType<typeof createAssetGenerationJobState>) =>
    startAssetGenerationJob(state, {
      assetClassId: "card-characters",
      id,
      prompt: "a knight",
    });
}
