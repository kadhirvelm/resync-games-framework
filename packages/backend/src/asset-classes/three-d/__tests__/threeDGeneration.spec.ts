import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { ThreeDJob } from "@towers-of-coreborn/api";
import { GenerateThreeDModelToolService } from "src/mastra/tools/generateThreeDModelTool.service";
import { ThreeDJobs } from "../threeDJobs";
import { validateGlb } from "../validateGlb";

/** Creates a deterministic memory Redis surface for lifecycle tests. */
function memoryJobs() {
  const entries = new Map<string, string>();
  const redis = {
    expire: async () => 1,
    get: async (key: string) => entries.get(key) ?? null,
    getClient: () => ({
      incr: async (key: string) => {
        const value = Number(entries.get(key) ?? 0) + 1;
        entries.set(key, String(value));
        return value;
      },
      scan: async () => [
        "0",
        [...entries.keys()].filter((key) => key.startsWith("three-d:job:")),
      ],
    }),
    set: async (key: string, value: string) => {
      entries.set(key, value);
    },
    withLock: async (
      _keys: string[],
      _duration: number,
      operation: () => Promise<unknown>,
    ) => operation(),
  };
  return new ThreeDJobs(redis as never);
}
/** Returns one unique admission record. */
function job(): ThreeDJob {
  return {
    generationId: randomUUID(),
    kind: "prop",
    progress: 0,
    prompt: "A beacon",
    provider: "demo",
    stage: "Queued",
    startedAt: new Date().toISOString(),
    state: "running",
  };
}

describe("3D generation lifecycle", () => {
  test("deduplicates ids while allowing work to wait in the shared queue", async () => {
    const jobs = memoryJobs();
    const first = job();
    expect(await jobs.admit(first)).toBe(true);
    expect(await jobs.admit(first)).toBe(false);
    await jobs.admit(job());
    expect(await jobs.admit(job())).toBe(true);
  });
  test("rejects a second run for a slot that is already generating", async () => {
    const jobs = memoryJobs();
    const first = { ...job(), prototypeId: randomUUID(), slotId: randomUUID() };
    await jobs.admit(first);
    await expect(
      jobs.admit({ ...first, generationId: randomUUID() }),
    ).rejects.toThrow("already generating");
  });
  test("terminal failures and cancellations cannot be revived by late progress", async () => {
    for (const state of ["failed", "cancelled"] as const) {
      const jobs = memoryJobs();
      const request = job();
      await jobs.admit(request);
      await jobs.finish(request.generationId, { stage: "Stopped", state });
      await jobs.progress(request.generationId, "late provider progress", 60);
      expect((await jobs.get(request.generationId))?.state).toBe(state);
    }
  });
  test("provider failure cannot publish an asset", async () => {
    let saves = 0;
    const generator = new GenerateThreeDModelToolService(
      {
        save: async () => {
          saves += 1;
        },
      } as never,
      {
        generate: async () => {
          throw new Error("provider offline");
        },
      } as never,
      memoryJobs(),
    );
    await expect(
      generator.generate(
        {
          generationId: randomUUID(),
          kind: "prop",
          prompt: "A jade chest",
          provider: "meshy",
        },
        new AbortController().signal,
      ),
    ).rejects.toThrow("provider offline");
    expect(saves).toBe(0);
  });
  test("journals uncertain paid submissions and clears them only after a task id is saved", async () => {
    const jobs = memoryJobs();
    const request = job();
    await jobs.admit(request);
    await jobs.submitting(request.generationId, "preview");
    await expect(
      jobs.submitting(request.generationId, "preview"),
    ).rejects.toThrow("unknown result");
    await jobs.progress(request.generationId, "geometry", 10, "preview-id");
    expect(
      (await jobs.get(request.generationId))?.providerSubmissionPending,
    ).toBeUndefined();
    expect((await jobs.get(request.generationId))?.providerJobIds).toEqual([
      "preview-id",
    ]);
  });
  test("the demo generator validates real GLB bytes without a provider call", async () => {
    let saves = 0;
    const store = {
      save: async (input: { bytes: Uint8Array; kind: "prop" }) => {
        saves += 1;
        return {
          ...input,
          validation: await validateGlb(input.bytes, input.kind),
        };
      },
    };
    const generator = new GenerateThreeDModelToolService(
      store as never,
      {
        generate: () => {
          throw new Error("unexpected provider call");
        },
      } as never,
      memoryJobs(),
    );
    const result = await generator.generate(
      {
        generationId: randomUUID(),
        kind: "prop",
        prompt: "A beacon",
        provider: "demo",
      },
      new AbortController().signal,
    );
    expect(result.validation.valid).toBe(true);
    expect(saves).toBe(1);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      generator.generate(
        {
          generationId: randomUUID(),
          kind: "prop",
          prompt: "A beacon",
          provider: "demo",
        },
        cancelled.signal,
      ),
    ).rejects.toThrow(Error);
    expect(saves).toBe(1);
  });
});
