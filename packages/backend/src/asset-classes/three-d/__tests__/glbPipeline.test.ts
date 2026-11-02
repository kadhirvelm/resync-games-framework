import { describe, expect, test } from "bun:test";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { compileThreeDDesign, demoThreeDDesign } from "../compileThreeDDesign";
import { normalizeMeshyCharacter } from "../normalizeMeshyCharacter";
import { renderGlbPreview } from "../renderGlbPreview";
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
  test("normalizes Meshy clips and textures into the character contract", async () => {
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
    const image = await sharp({
      create: {
        background: { b: 72, g: 118, r: 42 },
        channels: 3,
        height: 2048,
        width: 2048,
      },
    })
      .png()
      .toBuffer();
    const texture = document
      .createTexture("Meshy texture")
      .setImage(image)
      .setMimeType("image/png");
    const buffer = document.getRoot().listBuffers()[0];
    if (!buffer) throw new Error("Missing fixture buffer");
    for (const mesh of document.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const vertexCount = primitive.getAttribute("POSITION")?.getCount();
        if (!vertexCount) throw new Error("Missing fixture positions");
        primitive.setAttribute(
          "TEXCOORD_0",
          document
            .createAccessor()
            .setType("VEC2")
            .setArray(new Float32Array(vertexCount * 2))
            .setBuffer(buffer),
        );
      }
    }
    document.getRoot().listMaterials()[0]?.setBaseColorTexture(texture);

    const normalized = await normalizeMeshyCharacter(
      await io.writeBinary(document),
    );
    const validation = await validateGlb(normalized, "character");
    const normalizedDocument = await io.readBinary(normalized);
    const normalizedTexture = normalizedDocument.getRoot().listTextures()[0];
    const normalizedImage = normalizedTexture?.getImage();
    if (!normalizedImage) throw new Error("Missing normalized texture");
    const metadata = await sharp(normalizedImage).metadata();

    expect(validation.animations.map((clip) => clip.name)).toEqual([
      "idle",
      "walk",
      "attack",
      "hit",
      "death",
    ]);
    expect(normalizedTexture?.getMimeType()).toBe("image/jpeg");
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(1024);
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
  test("renders embedded base-color textures in workshop previews", async () => {
    const document = new Document();
    const buffer = document.createBuffer();
    const positions = document
      .createAccessor("positions")
      .setType("VEC3")
      .setArray(new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]))
      .setBuffer(buffer);
    const coordinates = document
      .createAccessor("coordinates")
      .setType("VEC2")
      .setArray(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]))
      .setBuffer(buffer);
    const indices = document
      .createAccessor("indices")
      .setType("SCALAR")
      .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
      .setBuffer(buffer);
    const image = await sharp({
      create: {
        background: { alpha: 1, b: 24, g: 28, r: 220 },
        channels: 4,
        height: 2,
        width: 2,
      },
    })
      .png()
      .toBuffer();
    const texture = document
      .createTexture("red texture")
      .setImage(image)
      .setMimeType("image/png");
    const material = document
      .createMaterial("textured material")
      .setBaseColorTexture(texture);
    const primitive = document
      .createPrimitive()
      .setAttribute("POSITION", positions)
      .setAttribute("TEXCOORD_0", coordinates)
      .setIndices(indices)
      .setMaterial(material);
    const mesh = document.createMesh("quad").addPrimitive(primitive);
    document
      .createScene("preview")
      .addChild(document.createNode("quad").setMesh(mesh));
    const preview = await renderGlbPreview(
      await new NodeIO().writeBinary(document),
    );
    const rendered = await sharp(preview)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const center = (160 * rendered.info.width + 160) * 4;
    expect((rendered.data[center] ?? 0) > 150).toBe(true);
    expect(rendered.data[center + 1] ?? 255).toBeLessThan(80);
    expect(rendered.data[center + 2] ?? 255).toBeLessThan(80);
  });
});
