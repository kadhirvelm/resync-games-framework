import { describe, expect, test } from "bun:test";
import { MeshyProvider } from "../meshyProvider";

describe("Meshy provider adapter", () => {
  test("resumes persisted tasks without creating another billable request", async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("assets.meshy.ai"))
        return new Response(new Uint8Array([1, 2, 3]));
      return Response.json({
        model_urls: { glb: "https://assets.meshy.ai/model.glb" },
        status: "SUCCEEDED",
      });
    }) as unknown as typeof fetch;
    try {
      const provider = new MeshyProvider({ get: () => "test-key" } as never);
      const result = await provider.generate(
        "A jade chest",
        new AbortController().signal,
        async () => undefined,
        ["preview-id", "refine-id"],
        async () => {
          throw new Error("unexpected submission");
        },
      );
      expect(result.jobIds).toEqual(["preview-id", "refine-id"]);
      expect(calls.some((call) => call.startsWith("POST"))).toBe(false);
      expect(result.bytes.length).toBe(3);
    } finally {
      globalThis.fetch = original;
    }
  });
  test("rejects untrusted download hosts before downloading model bytes", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({
        model_urls: { glb: "https://localhost/internal" },
        status: "SUCCEEDED",
      });
    }) as unknown as typeof fetch;
    try {
      const provider = new MeshyProvider({ get: () => "test-key" } as never);
      await expect(
        provider.generate(
          "A jade chest",
          new AbortController().signal,
          async () => undefined,
          ["preview-id", "refine-id"],
        ),
      ).rejects.toThrow("unexpected download host");
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
});
