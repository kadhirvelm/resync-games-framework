import { describe, expect, test } from "bun:test";
import {
  GenerationQueueService,
  hashGenerationRequest,
} from "../generationQueue.service";

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
