import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  ThreeDAsset,
  ThreeDAssetKind,
  ThreeDDesign,
} from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import { createAssetClassStorage } from "../shared/assetClassStorage";
import { writeAssetDirectoryAtomically } from "../shared/writeAssetDirectoryAtomically";
import { renderGlbPreview } from "./renderGlbPreview";
import { validateGlb } from "./validateGlb";

/** Separate storage roots keep 3D types distinct from the 2D pipeline. */
export const THREE_D_STORAGE = {
  character: createAssetClassStorage("three-d-characters"),
  environment: createAssetClassStorage("three-d-environments"),
  prop: createAssetClassStorage("three-d-props"),
};

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
    const preview = await renderGlbPreview(input.bytes);
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
