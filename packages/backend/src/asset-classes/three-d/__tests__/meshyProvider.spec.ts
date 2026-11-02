import { describe, expect, test } from "bun:test";
import { NodeIO } from "@gltf-transform/core";
import { compileThreeDDesign, demoThreeDDesign } from "../compileThreeDDesign";
import { MeshyProvider } from "../meshyProvider";
import { validateGlb } from "../validateGlb";

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
  test("resumes a complete four-stage character without paid submissions", async () => {
    const io = new NodeIO();
    const document = await io.readBinary(
      await compileThreeDDesign(demoThreeDDesign("character"), "character"),
    );
    const providerClipNames = [
      "Idle",
      "Casual_Walk",
      "Reaping_Swing",
      "Hit_Reaction",
      "dying_backwards",
    ];
    for (const [index, animation] of document
      .getRoot()
      .listAnimations()
      .entries())
      animation.setName(providerClipNames[index] ?? "unexpected");
    const providerBytes = await io.writeBinary(document);
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push(`${init?.method ?? "GET"} ${String(url)}`);
      if (String(url).includes("assets.meshy.ai"))
        return new Response(providerBytes);
      if (String(url).includes("/animations/animation-id"))
        return Response.json({
          result: {
            animation_glb_url: "https://assets.meshy.ai/character.glb",
          },
          status: "SUCCEEDED",
        });
      if (String(url).includes("/rigging/rig-id"))
        return Response.json({ status: "SUCCEEDED" });
      return Response.json({
        model_urls: { glb: "https://assets.meshy.ai/model.glb" },
        status: "SUCCEEDED",
      });
    }) as unknown as typeof fetch;
    try {
      const provider = new MeshyProvider({ get: () => "test-key" } as never);
      const result = await provider.generateCharacter(
        "A jade cultivator",
        new AbortController().signal,
        async () => undefined,
        ["preview-id", "refine-id", "rig-id", "animation-id"],
        async () => {
          throw new Error("unexpected submission");
        },
      );
      expect(result.jobIds).toEqual([
        "preview-id",
        "refine-id",
        "rig-id",
        "animation-id",
      ]);
      expect(calls.some((call) => call.startsWith("POST"))).toBe(false);
      expect((await validateGlb(result.bytes, "character")).valid).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });
});
