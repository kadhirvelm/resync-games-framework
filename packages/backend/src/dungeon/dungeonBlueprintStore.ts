import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type {
  DungeonBlueprint,
  DungeonSlotPreview,
} from "@resync-game-framework/api";
import type { AssetClassStorage } from "src/asset-classes/shared/assetClassStorage";
import { ConfigurationService } from "src/configuration/configuration.service";
import { RedisService } from "src/infra/redis/redis.service";
import { DungeonAssetLookup } from "./dungeonAssetLookup";
import { withDungeonAudio } from "./dungeonAudioPlan";
import {
  applyDungeonSlotUpdate,
  type DungeonSlotUpdate,
  readStoredDungeonBlueprint,
  readStoredDungeonBlueprints,
  type StoredDungeonBlueprint,
  type StoredDungeonSlot,
  toDungeonBlueprint,
  withUnitSprites,
  writeStoredDungeonBlueprint,
} from "./dungeonBlueprint";
import { DUNGEON_FILE_NAME, DUNGEON_STORAGE_TOKEN } from "./dungeonStorage";

/** How long a package write may wait for another write to finish. */
const DUNGEON_WRITE_LOCK_MS = 15_000;

/** Operations available while one dungeon package is locked. */
export interface DungeonBlueprintMutation {
  /** Package as it existed when the lock was acquired */
  blueprint: StoredDungeonBlueprint;
  /**
   * Writes one slot. Repeated calls apply to the result of the previous call.
   * @param slotId - Slot to replace
   * @param update - Fields to set or clear
   */
  updateSlot: (slotId: string, update: DungeonSlotUpdate) => Promise<void>;
}

/**
 * Owns dungeon package persistence, per-package locking, and API hydration.
 * Orchestration services do not need to know file paths or lock keys.
 */
@Injectable()
export class DungeonBlueprintStore {
  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly redis: RedisService,
    private readonly assets: DungeonAssetLookup,
    @Inject(DUNGEON_STORAGE_TOKEN)
    private readonly storage: AssetClassStorage,
  ) {}

  /**
   * Saves a new package and returns its hydrated API representation.
   * @param blueprint - Package to write
   * @returns Saved package with its JSON URL and asset previews
   */
  public async create(
    blueprint: StoredDungeonBlueprint,
  ): Promise<DungeonBlueprint> {
    const complete = withDungeonAudio(withUnitSprites(blueprint));
    await writeStoredDungeonBlueprint(this.storage.rootPath(), complete);
    return this.hydrate(complete);
  }

  /**
   * @returns Every saved package with public URLs and asset previews
   */
  public async list(): Promise<DungeonBlueprint[]> {
    const stored = await this.listStored();
    return Promise.all(stored.map((blueprint) => this.hydrate(blueprint)));
  }

  /**
   * @returns Stored packages, newest first, without API-only previews
   */
  public listStored(): Promise<StoredDungeonBlueprint[]> {
    return readStoredDungeonBlueprints(this.storage.rootPath());
  }

  /**
   * @param dungeonId - Package id
   * @returns One package with public URLs and previews
   */
  public async read(dungeonId: string): Promise<DungeonBlueprint> {
    return this.hydrate(await this.requireStored(dungeonId));
  }

  /**
   * @param dungeonId - Package folder name
   * @returns The stored package
   * @throws NotFoundException when the package file is missing
   */
  public async requireStored(
    dungeonId: string,
  ): Promise<StoredDungeonBlueprint> {
    const stored = await readStoredDungeonBlueprint(
      this.storage.rootPath(),
      dungeonId,
    );
    if (stored === undefined) {
      throw new NotFoundException(`Dungeon ${dungeonId} was not found.`);
    }
    return stored;
  }

  /**
   * Updates one slot under the package lock.
   * @param dungeonId - Package id
   * @param slotId - Slot to change
   * @param update - Fields to set or clear
   * @param ownerGenerationId - When set, skips the write if another run owns the slot
   * @returns Whether the update was applied
   */
  public updateSlot(
    dungeonId: string,
    slotId: string,
    update: DungeonSlotUpdate,
    ownerGenerationId?: string,
  ): Promise<boolean> {
    return this.withMutation(dungeonId, async (mutation) => {
      const slot = requireStoredSlot(mutation.blueprint, slotId);
      if (
        ownerGenerationId !== undefined &&
        slot.generationId !== ownerGenerationId
      ) {
        return false;
      }
      await mutation.updateSlot(slotId, update);
      return true;
    });
  }

  /**
   * Runs a multi-step package change while holding its distributed lock.
   * This is used when a file update and a Redis in-flight record must move
   * together.
   * @param dungeonId - Package id
   * @param operation - Work that may write one or more slot states
   * @returns The operation result
   */
  public withMutation<Result>(
    dungeonId: string,
    operation: (mutation: DungeonBlueprintMutation) => Promise<Result>,
  ): Promise<Result> {
    return this.redis.withLock(
      [lockKey(dungeonId)],
      DUNGEON_WRITE_LOCK_MS,
      async () => {
        let current = await this.requireStored(dungeonId);
        return operation({
          blueprint: current,
          updateSlot: async (slotId, update) => {
            current = {
              ...current,
              slots: current.slots.map((slot) =>
                slot.id === slotId
                  ? applyDungeonSlotUpdate(slot, update)
                  : slot,
              ),
            };
            await writeStoredDungeonBlueprint(this.storage.rootPath(), current);
          },
        });
      },
    );
  }

  /**
   * @param blueprint - Stored package to decorate
   * @returns API package with its public JSON URL and linked-asset previews
   */
  private async hydrate(
    blueprint: StoredDungeonBlueprint,
  ): Promise<DungeonBlueprint> {
    const previews = new Map<string, DungeonSlotPreview>();
    await Promise.all(
      blueprint.slots.map(async (slot) => {
        if (slot.assetId === undefined) {
          return;
        }
        const linked = await this.assets.read(slot.kind, slot.assetId);
        if (linked !== undefined) {
          previews.set(slot.id, linked.preview);
        }
      }),
    );
    return toDungeonBlueprint(
      blueprint,
      this.storage.publicUrl(
        this.configurationService.get("BACKEND_API_URL"),
        blueprint.id,
        DUNGEON_FILE_NAME,
      ),
      previews,
    );
  }
}

/**
 * @param blueprint - Package that should contain the slot
 * @param slotId - Slot id
 * @returns The stored slot
 * @throws NotFoundException when the package has no such slot
 */
export function requireStoredSlot(
  blueprint: StoredDungeonBlueprint,
  slotId: string,
): StoredDungeonSlot {
  const slot = blueprint.slots.find((entry) => entry.id === slotId);
  if (slot === undefined) {
    throw new NotFoundException(`Dungeon slot ${slotId} was not found.`);
  }
  return slot;
}

/**
 * @param dungeonId - Package id
 * @returns Redis lock key for writes to that package
 */
function lockKey(dungeonId: string): string {
  return `lock:dungeon:${dungeonId}`;
}
