import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { NodeIO } from "@gltf-transform/core";
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ThreeDAsset,
  ThreeDAssetKind,
  ThreeDDesign,
} from "@resync-game-framework/api";
import sharp from "sharp";
import { ConfigurationService } from "src/configuration/configuration.service";
import { createAssetClassStorage } from "../shared/assetClassStorage";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import { validateGlb } from "./validateGlb";

/** Separate storage roots keep 3D types distinct from the 2D pipeline. */
export const THREE_D_STORAGE = {
  character: createAssetClassStorage("three-d-characters"),
  environment: createAssetClassStorage("three-d-environments"),
  prop: createAssetClassStorage("three-d-props"),
};

/**
 * Produces a deterministic isometric thumbnail from the model's real geometry.
 * @param bytes - Validated GLB model
 * @returns A small PNG preview, without executing model data
 */
async function previewGlb(bytes: Uint8Array): Promise<Buffer> {
  const document = await new NodeIO().readBinary(bytes);
  const polygons: {
    points: [number, number, number][];
    depth: number;
    color: string;
  }[] = [];
  for (const node of document.getRoot().listNodes()) {
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const indices = primitive.getIndices()?.getArray();
      const count = indices?.length ?? position.getCount();
      const stride = Math.max(1, Math.ceil(count / 3 / 1600));
      const rgba = primitive.getMaterial()?.getBaseColorFactor() ?? [
        0.4, 0.7, 0.6, 1,
      ];
      const color = `rgb(${rgba
        .slice(0, 3)
        .map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255))
        .join(",")})`;
      for (let i = 0; i + 2 < count; i += 3 * stride) {
        if (polygons.length >= 2500) break;
        const points = [0, 1, 2].map((offset) => {
          const p = position.getElement(
            indices?.[i + offset] ?? i + offset,
            [0, 0, 0],
          ) as [number, number, number];
          const x =
            matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12];
          const y =
            matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13];
          const z =
            matrix[2] * p[0] +
            matrix[6] * p[1] +
            matrix[10] * p[2] +
            matrix[14];
          return [(x - z) * Math.SQRT1_2, -y + (x + z) * 0.35, x + z + y] as [
            number,
            number,
            number,
          ];
        });
        polygons.push({
          color,
          depth: points.reduce((sum, point) => sum + point[2], 0),
          points,
        });
      }
    }
  }
  const all = polygons.flatMap((p) => p.points);
  const xMin = Math.min(...all.map((p) => p[0]));
  const xMax = Math.max(...all.map((p) => p[0]));
  const yMin = Math.min(...all.map((p) => p[1]));
  const yMax = Math.max(...all.map((p) => p[1]));
  const scale = 240 / Math.max(xMax - xMin, yMax - yMin, 0.01);
  const shapes = polygons
    .sort((a, b) => a.depth - b.depth)
    .map(
      (polygon) =>
        `<polygon points="${polygon.points.map((p) => `${160 + (p[0] - (xMin + xMax) / 2) * scale},${160 + (p[1] - (yMin + yMax) / 2) * scale}`).join(" ")}" fill="${polygon.color}" stroke="#142d31" stroke-width="0.4"/>`,
    )
    .join("");
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#0c2024"/>${shapes}</svg>`,
    ),
  )
    .png()
    .toBuffer();
}

/** Validates and atomically publishes models, metadata and deterministic previews. */
@Injectable()
export class ThreeDAssetStore {
  public constructor(private readonly configuration: ConfigurationService) {}

  /** @returns Stored assets of the supplied kind, newest first. */
  public async list(kind: ThreeDAssetKind): Promise<ThreeDAsset[]> {
    const storage = THREE_D_STORAGE[kind];
    await mkdir(storage.rootPath(), { recursive: true });
    const ids = await readdir(storage.rootPath());
    const assets: ThreeDAsset[] = [];
    for (const id of ids.filter((value) => /^[a-f0-9-]{36}$/.test(value))) {
      try {
        assets.push(await this.read(kind, id));
      } catch {
        /* Ignore incomplete or obsolete manifests. */
      }
    }
    return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** @returns One stored asset with URLs resolved for the current backend. */
  public async read(kind: ThreeDAssetKind, id: string): Promise<ThreeDAsset> {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new NotFoundException("Unknown 3D asset.");
    const storage = THREE_D_STORAGE[kind];
    const manifest = JSON.parse(
      await readFile(storage.filePath(id, "manifest.json"), "utf8"),
    ) as ThreeDAsset;
    if (
      manifest.id !== id ||
      manifest.kind !== kind ||
      !manifest.validation?.valid
    )
      throw new NotFoundException("Invalid 3D asset manifest.");
    return {
      ...manifest,
      thumbnailUrl: storage.publicUrl(
        this.configuration.get("BACKEND_API_URL"),
        id,
        "preview.png",
      ),
      url: storage.publicUrl(
        this.configuration.get("BACKEND_API_URL"),
        id,
        "model.glb",
      ),
    };
  }

  /**
   * Reads a complete deterministic asset when a queue retry already published it.
   * @param kind - Asset category
   * @param id - Generation id used as the asset id
   * @returns Complete asset, or undefined when it has not been published
   */
  public async find(
    kind: ThreeDAssetKind,
    id: string,
  ): Promise<ThreeDAsset | undefined> {
    try {
      return await this.read(kind, id);
    } catch {
      return undefined;
    }
  }

  /**
   * Validates before any public directory exists, then publishes atomically.
   * @param input - Model, source description and generation provenance
   * @param signal - Cancellation guard checked before publication
   * @returns The accepted model and complete validation data
   */
  public async save(
    input: {
      bytes: Uint8Array;
      id?: string;
      kind: ThreeDAssetKind;
      name: string;
      prompt: string;
      design?: ThreeDDesign;
      provenance: ThreeDAsset["provenance"];
    },
    signal?: AbortSignal,
  ): Promise<ThreeDAsset> {
    const validation = await validateGlb(input.bytes, input.kind, {
      maxTriangles: this.configuration.get("THREE_D_MAX_TRIANGLES"),
    });
    const preview = await previewGlb(input.bytes);
    signal?.throwIfAborted();
    const id = input.id ?? randomUUID();
    const storage = THREE_D_STORAGE[input.kind];
    const asset: ThreeDAsset = {
      createdAt: new Date().toISOString(),
      design: input.design,
      id,
      kind: input.kind,
      name: input.name,
      prompt: input.prompt,
      provenance: input.provenance,
      thumbnailUrl: "",
      url: "",
      validation,
    };
    await writeAssetDirectoryAtomically(
      storage.filePath(id),
      async (pending) => {
        await writeFile(`${pending}/model.glb`, input.bytes);
        await writeFile(`${pending}/preview.png`, preview);
        await writeFile(`${pending}/manifest.json`, JSON.stringify(asset));
        signal?.throwIfAborted();
      },
    );
    return this.read(input.kind, id);
  }
}
