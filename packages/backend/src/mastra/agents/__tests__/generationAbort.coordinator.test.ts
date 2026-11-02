import { describe, expect, test } from "bun:test";
import { MockRedisService } from "src/infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "src/infra/redis/redis.service";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { GenerationCancelledException } from "../generationCancelled";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

describe("GenerationAbortCoordinator", () => {
  test("a stop on one process aborts the run on another", async () => {
    const redis = new MockRedisService();
    const worker = coordinator(redis);
    const api = coordinator(redis);
    await worker.onModuleInit();
    await api.onModuleInit();

    const run = await worker.begin(GENERATION_ID);
    await api.stop(GENERATION_ID);

    expect(run.signal.aborted).toBe(true);
    await run.end();
  });

  test("a stop that arrives first aborts the run when it starts", async () => {
    const redis = new MockRedisService();
    const api = coordinator(redis);
    const worker = coordinator(redis);
    await api.onModuleInit();

    await api.stop(GENERATION_ID);
    const run = await worker.begin(GENERATION_ID);

    expect(run.signal.aborted).toBe(true);
    await run.end();
  });

  test("a duplicate local run is rejected instead of aborting the owner", async () => {
    const redis = new MockRedisService();
    const runs = coordinator(redis);
    const first = await runs.begin(GENERATION_ID);

    await expect(runs.begin(GENERATION_ID)).rejects.toThrow("already running");
    expect(first.signal.aborted).toBe(false);
    await runs.stop(GENERATION_ID);
    expect(first.signal.aborted).toBe(true);
    await first.end();
  });

  test("a cancelled marker survives run cleanup for queue retries", async () => {
    const redis = new MockRedisService();
    const runs = coordinator(redis);
    await runs.onModuleInit();
    const first = await runs.begin(GENERATION_ID);
    await runs.stop(GENERATION_ID);
    await first.end();

    const retry = await runs.begin(GENERATION_ID);
    expect(retry.signal.aborted).toBe(true);
    await retry.end();
  });

  test("run owns the cancellation lifecycle", async () => {
    const redis = new MockRedisService();
    const runs = coordinator(redis);
    await runs.onModuleInit();

    const result = await runs.run(GENERATION_ID, async (signal) => {
      expect(signal.aborted).toBe(false);
      return "done";
    });
    await runs.stop(GENERATION_ID);

    expect(result).toBe("done");
  });

  test("run translates a distributed stop into a cancellation", async () => {
    const redis = new MockRedisService();
    const runs = coordinator(redis);
    await runs.onModuleInit();

    const error = await runs
      .run(GENERATION_ID, async () => {
        await runs.stop(GENERATION_ID);
        throw new Error("provider aborted");
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof GenerationCancelledException).toBe(true);
  });
});

/**
 * @param redis - In-memory Redis stand-in
 * @returns A coordinator that publishes and subscribes through that Redis
 */
function coordinator(redis: MockRedisService): GenerationAbortCoordinator {
  return new GenerationAbortCoordinator(redis as unknown as RedisService);
}
