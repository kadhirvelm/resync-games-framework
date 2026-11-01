import { NodeIO } from "@gltf-transform/core";
import { BadRequestException } from "@nestjs/common";
import {
  THREE_D_CHARACTER_ANIMATIONS,
  type ThreeDAssetKind,
  type ThreeDValidation,
} from "@towers-of-coreborn/api";
import { validateBytes } from "gltf-validator";
import sharp from "sharp";
import { THREE_D_LIMITS as limits } from "./threeDSchemas";

/**
 * Parses a GLB envelope before any library can resolve external resources.
 * @param bytes - Untrusted uploaded or downloaded bytes
 * @returns The embedded JSON chunk
 */
export function readGlbJson(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.byteLength < 24 || bytes.byteLength > limits.bytes)
    throw new BadRequestException("GLB must be between 24 bytes and 20 MiB.");
  const data = Buffer.from(bytes);
  if (
    data.readUInt32LE(0) !== 0x46546c67 ||
    data.readUInt32LE(4) !== 2 ||
    data.readUInt32LE(8) !== data.length ||
    data.readUInt32LE(16) !== 0x4e4f534a
  )
    throw new BadRequestException(
      "Expected a complete binary glTF 2.0 (.glb) file.",
    );
  const jsonLength = data.readUInt32LE(12);
  if (jsonLength > 2 * 1024 * 1024 || jsonLength + 20 > data.length)
    throw new BadRequestException("Invalid or excessive GLB metadata.");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(data.subarray(20, 20 + jsonLength).toString("utf8"));
  } catch {
    throw new BadRequestException("Invalid GLB JSON.");
  }
  if (typeof json !== "object" || json === null || Array.isArray(json))
    throw new BadRequestException("GLB metadata must be an object.");
  /** Rejects every URI and extension, including optional extensions, recursively. */
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 32)
      throw new BadRequestException("GLB metadata nesting is excessive.");
    if (typeof value !== "object" || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri")
        throw new BadRequestException(
          "GLB resources must be embedded. External and data URIs are not accepted.",
        );
      if (
        (key === "extensions" ||
          key === "extensionsUsed" ||
          key === "extensionsRequired") &&
        Object.keys(child ?? {}).length > 0
      )
        throw new BadRequestException(
          "GLB extensions are not supported. Export an uncompressed core glTF 2.0 model.",
        );
      inspect(child, depth + 1);
    }
  };
  inspect(json);
  for (const [key, max] of [
    ["meshes", limits.meshes],
    ["materials", limits.materials],
    ["textures", limits.textures],
    ["nodes", limits.nodes],
    ["animations", limits.animations],
    ["images", limits.textures],
    ["accessors", 2048],
    ["bufferViews", 2048],
    ["buffers", 1],
  ] as const) {
    const values = json[key];
    if (values !== undefined && (!Array.isArray(values) || values.length > max))
      throw new BadRequestException(`GLB exceeds ${key} budget (${max}).`);
  }
  for (const entry of (json.accessors ?? []) as { count?: number }[]) {
    if (
      !Number.isSafeInteger(entry.count) ||
      (entry.count ?? 0) < 0 ||
      (entry.count ?? Infinity) > 1_000_000
    )
      throw new BadRequestException(
        "Excessive or invalid accessor allocation.",
      );
  }
  for (const entry of (json.buffers ?? []) as { byteLength?: number }[]) {
    if (
      !Number.isSafeInteger(entry.byteLength) ||
      (entry.byteLength ?? 0) < 0 ||
      (entry.byteLength ?? Infinity) > limits.bytes
    )
      throw new BadRequestException("Excessive GLB buffer allocation.");
  }
  return json;
}

/**
 * Validates file structure, bounded complexity, textures, actual positions,
 * rigging and named animation tracks before an asset can be published.
 * @param bytes - Self-contained GLB bytes
 * @param kind - Required asset contract
 * @returns Queryable metadata or an actionable validation exception
 */
export async function validateGlb(
  bytes: Uint8Array,
  kind: ThreeDAssetKind,
  options: { maxTriangles?: number } = {},
): Promise<ThreeDValidation> {
  const triangleLimit = Math.min(
    limits.triangles,
    Math.max(1, options.maxTriangles ?? limits.triangles),
  );
  readGlbJson(bytes);
  const report = await validateBytes(bytes, {
    externalResourceFunction: async () => {
      throw new Error("External resources disabled");
    },
    maxIssues: 30,
  });
  if (report.issues.numErrors > 0)
    throw new BadRequestException(
      `GLB validation failed: ${report.issues.messages
        .filter((m) => m.severity === 0)
        .map((m) => m.message)
        .slice(0, 3)
        .join("; ")}`,
    );
  const doc = await new NodeIO().readBinary(bytes);
  const root = doc.getRoot();
  let triangles = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4)
        throw new BadRequestException("Only triangle meshes are supported.");
      const positions = primitive.getAttribute("POSITION");
      if (!positions || positions.getCount() > limits.triangles * 3)
        throw new BadRequestException(
          "Missing positions or excessive vertex count.",
        );
      triangles +=
        (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
      const values = positions.getArray();
      if (!values) throw new BadRequestException("Missing position data.");
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i] ?? NaN;
        if (!Number.isFinite(value) || Math.abs(value) > 1000)
          throw new BadRequestException(
            "Non-finite or excessive model dimensions.",
          );
        min[i % 3] = Math.min(min[i % 3] ?? Infinity, value);
        max[i % 3] = Math.max(max[i % 3] ?? -Infinity, value);
      }
    }
  }
  if (triangles < 1 || triangles > triangleLimit)
    throw new BadRequestException(
      `Triangle count must be between 1 and ${triangleLimit}.`,
    );
  // Count actual scene instances, not just unique meshes. Reusing one mesh
  // hundreds of times must not evade the runtime triangle/draw-call budget.
  let instantiatedTriangles = 0;
  let drawCalls = 0;
  min.fill(Infinity);
  max.fill(-Infinity);
  for (const node of root.listNodes()) {
    const matrix = node.getWorldMatrix();
    if (
      matrix.some((value) => !Number.isFinite(value) || Math.abs(value) > 1000)
    )
      throw new BadRequestException("Invalid or excessive node transform.");
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      drawCalls += 1;
      const positions = primitive.getAttribute("POSITION");
      if (!positions) continue;
      const lower = positions.getMin([0, 0, 0]);
      const upper = positions.getMax([0, 0, 0]);
      for (let corner = 0; corner < 8; corner += 1) {
        const x = (corner & 1 ? upper[0] : lower[0]) ?? 0;
        const y = (corner & 2 ? upper[1] : lower[1]) ?? 0;
        const z = (corner & 4 ? upper[2] : lower[2]) ?? 0;
        const point = [
          matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
          matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
          matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ];
        for (const [axis, value] of point.entries()) {
          if (!Number.isFinite(value) || Math.abs(value) > 1000)
            throw new BadRequestException(
              "Transformed bounds exceed the scene budget.",
            );
          min[axis] = Math.min(min[axis] ?? Infinity, value);
          max[axis] = Math.max(max[axis] ?? -Infinity, value);
        }
      }
      instantiatedTriangles +=
        (primitive.getIndices()?.getCount() ?? positions.getCount()) / 3;
      if (instantiatedTriangles > triangleLimit || drawCalls > limits.meshes)
        throw new BadRequestException(
          "Scene instances exceed triangle or draw-call budget.",
        );
    }
  }
  if (drawCalls === 0)
    throw new BadRequestException("GLB contains no instantiated model meshes.");
  let texturePixels = 0;
  for (const texture of root.listTextures()) {
    const image = texture.getImage();
    if (!image || !["image/png", "image/jpeg"].includes(texture.getMimeType()))
      throw new BadRequestException("Textures must be embedded PNG or JPEG.");
    const metadata = await sharp(image, {
      limitInputPixels: limits.textureEdge ** 2,
    }).metadata();
    texturePixels += (metadata.width ?? 0) * (metadata.height ?? 0);
    if (texturePixels > limits.textureEdge ** 2)
      throw new BadRequestException(
        "Combined textures exceed 64 MiB decoded RGBA budget.",
      );
    if (
      (metadata.width ?? Infinity) > limits.textureEdge ||
      (metadata.height ?? Infinity) > limits.textureEdge
    )
      throw new BadRequestException("Texture exceeds 4096px budget.");
  }
  const animations = root.listAnimations().map((animation) => {
    for (const sampler of animation.listSamplers()) {
      const values = sampler.getOutput()?.getArray();
      if (
        !values ||
        values.some(
          (value) => !Number.isFinite(value) || Math.abs(value) > 1000,
        )
      )
        throw new BadRequestException("Invalid or excessive animation values.");
    }
    const duration = Math.max(
      0,
      ...animation
        .listSamplers()
        .map((sampler) => sampler.getInput()?.getMax([])[0] ?? 0),
    );
    if (
      !Number.isFinite(duration) ||
      duration > limits.duration ||
      animation.listChannels().length === 0
    )
      throw new BadRequestException("Invalid animation channels or duration.");
    return { duration, name: animation.getName() };
  });
  if (
    kind === "character" &&
    (root.listSkins().length === 0 ||
      THREE_D_CHARACTER_ANIMATIONS.some(
        (name) =>
          !animations.some((clip) => clip.name === name && clip.duration > 0),
      ))
  )
    throw new BadRequestException(
      "Characters require a skin and nonempty idle, walk, attack, hit, and death animations.",
    );
  return {
    animations,
    bounds: { max, min },
    bytes: bytes.length,
    materials: root.listMaterials().length,
    meshes: root.listMeshes().length,
    skins: root.listSkins().length,
    textures: root.listTextures().length,
    triangles,
    valid: true,
    warnings: report.issues.messages
      .filter((m) => m.severity === 1)
      .map((m) => m.message)
      .slice(0, 8),
  };
}
