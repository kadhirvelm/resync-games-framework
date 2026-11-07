import { describe, expect, test } from "bun:test";
import {
  GenerationQueueService,
  hashGenerationRequest,
  toAgentGenerationState,
} from "../generationQueue.service";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

/**
 * Injects one retained BullMQ-shaped job into an otherwise isolated service.
 * @param job - Minimal job fields read by getStatus
 * @returns Queue service ready for a status lookup
 */
function serviceWithJob(job: Record<string, unknown>): GenerationQueueService {
  const service = new GenerationQueueService({} as never, {} as never);
  (service as unknown as { queue: unknown }).queue = {
    getJob: async () => job,
  };
  return service;
}

describe("hashGenerationRequest", () => {
  test("is stable across object key order", () => {
    expect(hashGenerationRequest({ kind: "enemy", prompt: "Moss bell" })).toBe(
      hashGenerationRequest({ kind: "enemy", prompt: "Moss bell" }),
    );
  });

  test("changes when nested request content changes", () => {
    expect(
      hashGenerationRequest({ design: { joints: ["root"] }, prompt: "A" }),
    ).not.toBe(
      hashGenerationRequest({
        design: { joints: ["root", "hand"] },
        prompt: "A",
      }),
    );
  });
});

describe("GenerationQueueService handler registry", () => {
  test("rejects duplicate handler names during bootstrap", () => {
    const service = new GenerationQueueService({} as never, {} as never);
    service.register("enemy", async () => "first");

    expect(() => service.register("enemy", async () => "second")).toThrow();
  });
});

describe("toAgentGenerationState", () => {
  test("normalizes queue, terminal, and unrecognized states", () => {
    expect(toAgentGenerationState("waiting")).toBe("queued");
    expect(toAgentGenerationState("delayed")).toBe("queued");
    expect(toAgentGenerationState("active")).toBe("running");
    expect(toAgentGenerationState("completed")).toBe("completed");
    expect(toAgentGenerationState("failed")).toBe("failed");
    expect(toAgentGenerationState("unknown")).toBe("unknown");
  });
});

describe("GenerationQueueService.getStatus", () => {
  test("returns a completed 3D asset with normalized timestamps", async () => {
    const result = { id: GENERATION_ID, name: "Crystal beacon" };
    const service = serviceWithJob({
      attemptsMade: 1,
      data: { payload: { kind: "prop" }, requestHash: "hash" },
      finishedOn: 2_000,
      getState: async () => "completed",
      id: GENERATION_ID,
      name: "three-d",
      processedOn: 1_500,
      returnvalue: result,
      timestamp: 1_000,
    });

    expect(await service.getStatus(GENERATION_ID)).toEqual({
      assetClass: "three-d-prop",
      attemptsMade: 1,
      createdAt: new Date(1_000).toISOString(),
      finishedAt: new Date(2_000).toISOString(),
      jobId: GENERATION_ID,
      result,
      startedAt: new Date(1_500).toISOString(),
      status: "completed",
    });
  });

  test("restores the useful message from a failed worker", async () => {
    const service = serviceWithJob({
      attemptsMade: 3,
      data: { payload: {}, requestHash: "hash" },
      failedReason:
        'asset-generation-error:{"message":"Provider refused","status":400}',
      getState: async () => "failed",
      id: GENERATION_ID,
      name: "static-image",
      timestamp: 1_000,
    });

    const status = await service.getStatus(GENERATION_ID);
    expect(status?.error).toBe("Provider refused");
    expect(status?.status).toBe("failed");
  });
});
