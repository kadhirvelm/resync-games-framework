import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ThreeDPrototype } from "@towers-of-coreborn/api";
import { RedisService } from "src/infra/redis/redis.service";
import { createAssetClassStorage } from "../shared/assetClassStorage";
import { ThreeDAssetStore } from "./threeDAssetStore";

/** Package files are entirely separate from current 2D dungeon JSON. */
const storage = createAssetClassStorage("three-d-prototypes");
/** Atomic prototype storage and slot-kind-safe asset association. */
@Injectable()
export class ThreeDPrototypeStore {
  public constructor(
    private readonly assets: ThreeDAssetStore,
    private readonly redis: RedisService,
  ) {}
  /** @returns Every valid saved package, with its current model references hydrated. */
  public async list(): Promise<ThreeDPrototype[]> {
    await mkdir(storage.rootPath(), { recursive: true });
    const values: ThreeDPrototype[] = [];
    for (const file of await readdir(storage.rootPath())) {
      if (!/^[a-f0-9-]{36}\.json$/.test(file)) continue;
      try {
        values.push(await this.read(file.slice(0, -5)));
      } catch {
        /* Skip incomplete files. */
      }
    }
    return values.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  /** @returns A package whose owned asset URLs are current. */
  public async read(id: string): Promise<ThreeDPrototype> {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new NotFoundException("Unknown 3D prototype.");
    const value = JSON.parse(
      await readFile(storage.filePath(`${id}.json`), "utf8"),
    ) as ThreeDPrototype;
    for (const slot of value.slots) {
      if (slot.assetId)
        slot.asset = await this.assets
          .read(slot.kind, slot.assetId)
          .catch(() => undefined);
    }
    return value;
  }
  /** Persists one package using a temporary file and atomic rename. */
  public async save(value: ThreeDPrototype): Promise<ThreeDPrototype> {
    await mkdir(storage.rootPath(), { recursive: true });
    const temp = storage.filePath(`.${value.id}-${randomUUID()}.tmp`);
    await writeFile(
      temp,
      JSON.stringify(
        {
          ...value,
          slots: value.slots.map(({ asset: _asset, ...slot }) => slot),
        },
        null,
        2,
      ),
    );
    await rename(temp, storage.filePath(`${value.id}.json`));
    return this.read(value.id);
  }
  /** Associates a matching model while preserving concurrent changes to other slots. */
  public async attach(
    prototypeId: string,
    slotId: string,
    assetId: string,
  ): Promise<ThreeDPrototype> {
    return this.redis.withLock(
      [`three-d:prototype:${prototypeId}`],
      5000,
      async () => {
        const value = await this.read(prototypeId);
        const slot = value.slots.find((candidate) => candidate.id === slotId);
        if (!slot) throw new BadRequestException("Unknown prototype slot.");
        await this.assets.read(slot.kind, assetId);
        slot.assetId = assetId;
        return this.save(value);
      },
    );
  }
}
