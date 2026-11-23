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
  test("re-rigs an existing character GLB and appends extra animations without text-to-3d", async () => {
    const io = new NodeIO();
    const sourceBytes = await compileThreeDDesign(
      demoThreeDDesign("character"),
      "character",
    );
    const animDoc = await io.readBinary(sourceBytes);
    const root = animDoc.getRoot();
    const baseIdle = root.listAnimations()[0];
    if (!baseIdle) throw new Error("Missing idle fixture animation");
    const extra = animDoc.createAnimation("Heavy_Hammer_Swing");
    for (const channel of baseIdle.listChannels()) {
      const sampler = channel.getSampler();
      const targetNode = channel.getTargetNode();
      const targetPath = channel.getTargetPath();
      if (!sampler || !targetNode || !targetPath) continue;
      const clonedSampler = animDoc
        .createAnimationSampler()
        .setInput(sampler.getInput())
        .setOutput(sampler.getOutput())
        .setInterpolation(sampler.getInterpolation());
      extra.addSampler(clonedSampler);
      extra.addChannel(
        animDoc
          .createAnimationChannel()
          .setSampler(clonedSampler)
          .setTargetNode(targetNode)
          .setTargetPath(targetPath),
      );
    }
    const providerBytes = await io.writeBinary(animDoc);
    const original = globalThis.fetch;
    const posts: { body: Record<string, unknown>; url: string }[] = [];
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      const target = String(url);
      if (init?.method === "POST" && typeof init.body === "string") {
        posts.push({ body: JSON.parse(init.body), url: target });
      }
      if (target.includes("assets.meshy.ai"))
        return new Response(providerBytes);
      if (target.endsWith("/v1/rigging"))
        return Response.json({ result: "new-rig-id" });
      if (target.endsWith("/v1/animations"))
        return Response.json({ result: "new-anim-id" });
      if (target.includes("/animations/new-anim-id"))
        return Response.json({
          result: {
            animation_glb_url: "https://assets.meshy.ai/character-work.glb",
          },
          status: "SUCCEEDED",
        });
      return Response.json({ status: "SUCCEEDED" });
    }) as unknown as typeof fetch;
    try {
      const provider = new MeshyProvider({ get: () => "test-key" } as never);
      const result = await provider.generateCharacter(
        "Re-rigged villager with work animation",
        new AbortController().signal,
        async () => undefined,
        [],
        async () => undefined,
        {
          extraAnimations: [{ actionId: 128, clipName: "work" }],
          sourceGlbBytes: sourceBytes,
        },
      );
      expect(result.jobIds).toEqual(["new-rig-id", "new-anim-id"]);
      expect(posts.map((post) => new URL(post.url).pathname)).toEqual([
        "/openapi/v1/rigging",
        "/openapi/v1/animations",
      ]);
      expect(
        String(posts[0]?.body.model_url).startsWith(
          "data:model/gltf-binary;base64,",
        ),
      ).toBe(true);
      expect(posts[1]?.body).toEqual({
        action_ids: [0, 30, 99, 178, 189, 128],
        rig_task_id: "new-rig-id",
      });
      const validation = await validateGlb(result.bytes, "character");
      expect(validation.animations.map((clip) => clip.name)).toEqual([
        "idle",
        "walk",
        "attack",
        "hit",
        "death",
        "work",
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
