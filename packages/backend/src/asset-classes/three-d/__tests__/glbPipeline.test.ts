import { describe, expect, test } from "bun:test";
import { NodeIO } from "@gltf-transform/core";
import { compileThreeDDesign, demoThreeDDesign } from "../compileThreeDDesign";
import { THREE_D_STORAGE } from "../threeDAssetStore";
import { readGlbJson, validateGlb } from "../validateGlb";

describe("3D GLB pipeline", () => {
  for (const kind of ["prop", "environment", "character"] as const) {
    test(`compiles a valid self-contained ${kind}`, async () => {
      const bytes = await compileThreeDDesign(demoThreeDDesign(kind), kind);
      const validation = await validateGlb(bytes, kind);
      expect(validation.valid).toBe(true);
      expect(validation.triangles > 0).toBe(true);
      expect(validation.bytes).toBeLessThan(100_000);
      if (kind === "character") {
        expect(validation.skins).toBe(1);
        expect(validation.animations.map((clip) => clip.name)).toEqual([
          "idle",
          "walk",
          "attack",
          "hit",
          "death",
        ]);
      }
    });
  }
  test("rejects truncated and non-GLB files", async () => {
    const bytes = await compileThreeDDesign(demoThreeDDesign("prop"), "prop");
    expect(() => readGlbJson(bytes.slice(0, 25))).toThrow();
    expect(() => readGlbJson(new Uint8Array(40))).toThrow();
  });
  test("rejects static assets as characters", async () => {
    const bytes = await compileThreeDDesign(demoThreeDDesign("prop"), "prop");
    await expect(validateGlb(bytes, "character")).rejects.toThrow(
      "Characters require",
    );
  });
  test("enforces a configured lower triangle ceiling", async () => {
    const bytes = await compileThreeDDesign(demoThreeDDesign("prop"), "prop");
    await expect(
      validateGlb(bytes, "prop", { maxTriangles: 40 }),
    ).rejects.toThrow("between 1 and 40");
  });
  test("counts instantiated primitives against the draw budget", async () => {
    const io = new NodeIO();
    const document = await io.readBinary(
      await compileThreeDDesign(demoThreeDDesign("prop"), "prop"),
    );
    const scene = document.getRoot().listScenes()[0];
    const mesh = document.getRoot().listMeshes()[0];
    if (!scene || !mesh) throw new Error("Missing fixture scene");
    for (let index = 0; index < 130; index += 1)
      scene.addChild(document.createNode(`instance-${index}`).setMesh(mesh));
    await expect(
      validateGlb(await io.writeBinary(document), "prop"),
    ).rejects.toThrow("Scene instances exceed");
  });
  test("rejects executable-looking or invalid model designs", async () => {
    await expect(
      compileThreeDDesign(
        {
          name: "unsafe",
          parts: [
            {
              ...demoThreeDDesign("prop").parts[0],
              color: "url(https://evil.test)",
            },
          ],
        } as never,
        "prop",
      ),
    ).rejects.toThrow(Error);
  });
  test("rejects external resources before any resource loader runs", async () => {
    const bytes = await compileThreeDDesign(demoThreeDDesign("prop"), "prop");
    const io = new NodeIO();
    const document = await io.readBinary(bytes);
    const json = await io.writeJSON(document);
    json.json.buffers = [
      { byteLength: 100, uri: "https://evil.test/model.bin" },
    ];
    const data = Buffer.from(
      JSON.stringify(json.json).padEnd(
        Math.ceil(JSON.stringify(json.json).length / 4) * 4,
        " ",
      ),
    );
    const glb = Buffer.alloc(20 + data.length);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(data.length, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    data.copy(glb, 20);
    expect(() => readGlbJson(glb)).toThrow();
  });
  test("builds normal encoded public model URLs", () => {
    expect(
      THREE_D_STORAGE.prop.publicUrl(
        "https://backend.test/",
        "a b",
        "model.glb",
      ),
    ).toBe("https://backend.test/static/three-d-props/a%20b/model.glb");
  });
});
