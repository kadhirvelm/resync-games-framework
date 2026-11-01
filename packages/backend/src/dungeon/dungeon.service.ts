import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  DungeonBlueprint,
  DungeonInFlightJob,
  DungeonServiceApi,
  DungeonSlotKind,
} from "@towers-of-coreborn/api";
import { requireGenerationId } from "src/asset-classes/shared/requireGenerationId";
import { requireGenerationPrompt } from "src/asset-classes/shared/requireGenerationPrompt";
import type { PlannedDungeonSlot } from "src/mastra/agents/dungeon-coordinator/dungeonCoordinatorAgent";
import { DungeonCoordinatorAgent } from "src/mastra/agents/dungeon-coordinator/dungeonCoordinatorAgent";
import { GenerationCancelledException } from "src/mastra/agents/generationCancelled";
import { DungeonAssetLookup } from "./dungeonAssetLookup";
import {
  type StoredDungeonBlueprint,
  type StoredDungeonSlot,
} from "./dungeonBlueprint";
import {
  DungeonBlueprintStore,
  requireStoredSlot,
} from "./dungeonBlueprintStore";
import { requireDungeonId } from "./dungeonIds";
import {
  DUNGEON_IN_FLIGHT_MAX_AGE_MS,
  DungeonInFlightStore,
} from "./dungeonInFlightStore";
import {
  DungeonSlotGenerator,
  type PreparedDungeonSlot,
} from "./dungeonSlotGenerator";

/**
 * Plans dungeon packages, runs one slot at a time, and links assets that
 * already exist. Packages are JSON files. Running slots are also in Redis.
 */
@Injectable()
export class DungeonService {
  private readonly logger = new Logger(DungeonService.name);

  public constructor(
    private readonly coordinator: DungeonCoordinatorAgent,
    private readonly slotGenerator: DungeonSlotGenerator,
    private readonly inflight: DungeonInFlightStore,
    private readonly assets: DungeonAssetLookup,
    private readonly blueprints: DungeonBlueprintStore,
  ) {}

  /**
   * Links an existing asset to a slot and writes that id into the package.
   * @param payload - Package, slot, and stored asset id
   * @returns The updated package
   */
  public async associate(
    payload: DungeonServiceApi["associate"]["payload"],
  ): Promise<DungeonBlueprint> {
    const dungeonId = requireDungeonId(payload.dungeonId, "Dungeon id");
    const slotId = requireDungeonId(payload.slotId, "Slot id");
    const assetId = requireDungeonId(payload.assetId, "Asset id");
    const blueprint = await this.blueprints.requireStored(dungeonId);
    const slot = requireStoredSlot(blueprint, slotId);
    if (slot.status === "generating") {
      throw new BadRequestException("This prompt is still generating.");
    }
    const linked = await this.assets.read(slot.kind, assetId);
    if (linked === undefined) {
      throw new BadRequestException(
        `No ${slotLabel(slot.kind)} was found for ${assetId}.`,
      );
    }
    await this.blueprints.updateSlot(dungeonId, slotId, {
      assetId,
      clearError: true,
      clearGenerationId: true,
      status: "ready",
    });
    return this.blueprints.read(dungeonId);
  }

  /**
   * Stops a planning run or the slot run that used this id.
   * @param payload - Generation id from the workshop
   * @returns Whether a stop was recorded
   */
  public async cancel(
    payload: DungeonServiceApi["cancel"]["payload"],
  ): Promise<DungeonServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const stopped = await Promise.all([
      this.coordinator.abort(generationId),
      this.slotGenerator.abort(generationId),
    ]);
    return { stopped: stopped.some(Boolean) };
  }

  /**
   * Plans a dungeon package and saves it as JSON. Does not paint assets.
   * @param payload - Broad dungeon idea and the id that can stop planning
   * @param sessionId - Connected ProductNow browser session
   * @returns The saved package
   */
  public async generate(
    payload: DungeonServiceApi["generate"]["payload"],
    sessionId: string,
  ): Promise<DungeonBlueprint> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the dungeon to plan.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const planned = await this.coordinator.query({
      generationId,
      prompt,
      sessionId,
    });
    const blueprint: StoredDungeonBlueprint = {
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      prompt,
      slots: planned.slots.map(toStoredSlot),
      summary: planned.summary,
    };
    return this.blueprints.create(blueprint);
  }

  /**
   * Runs one saved prompt through its agent and writes the new asset id
   * back into the package. The run stays in Redis until it finishes.
   * @param payload - Package, slot, and the id that can stop this run
   * @param sessionId - Connected ProductNow browser session
   * @returns The package after the slot is filled
   */
  public async generateSlot(
    payload: DungeonServiceApi["generateSlot"]["payload"],
    sessionId: string,
  ): Promise<DungeonBlueprint> {
    const dungeonId = requireDungeonId(payload.dungeonId, "Dungeon id");
    const slotId = requireDungeonId(payload.slotId, "Slot id");
    const generationId = requireGenerationId(payload.generationId);
    const started = await this.beginSlot(dungeonId, slotId, generationId);

    try {
      const assetId = await this.slotGenerator.generate({
        ...started,
        generationId,
        sessionId,
      });
      await this.blueprints.updateSlot(
        dungeonId,
        slotId,
        {
          assetId,
          clearError: true,
          clearGenerationId: true,
          status: "ready",
        },
        generationId,
      );
      return await this.blueprints.read(dungeonId);
    } catch (error) {
      await this.finishFailedSlot(dungeonId, slotId, generationId, error);
      throw error;
    } finally {
      await this.inflight.delete(generationId);
    }
  }

  /**
   * Drops expired runs, then returns the runs a refreshed page should show.
   * @returns Slot generations that are still inside the time limit
   */
  public async listInFlight(): Promise<
    DungeonServiceApi["inflight"]["response"]
  > {
    const jobs = await this.settle();
    return { jobs };
  }

  /**
   * @returns Saved packages, newest first, with previews for linked assets
   */
  public async list(): Promise<DungeonServiceApi["list"]["response"]> {
    await this.settle();
    return { dungeons: await this.blueprints.list() };
  }

  /**
   * Marks a slot generating and records it in Redis before the agent starts.
   * @param dungeonId - Package id
   * @param slotId - Prompt to run
   * @param generationId - Client id that can stop the run
   * @returns The slot, the prompt its agent should receive, and card progression
   */
  private async beginSlot(
    dungeonId: string,
    slotId: string,
    generationId: string,
  ): Promise<PreparedDungeonSlot> {
    return this.blueprints.withMutation(
      dungeonId,
      async ({ blueprint, updateSlot }) => {
        const slot = requireStoredSlot(blueprint, slotId);
        if (slot.status === "generating") {
          throw new BadRequestException("This prompt is already generating.");
        }
        if (slot.status === "ready") {
          throw new BadRequestException("This prompt already has an asset.");
        }
        const prepared = await this.slotGenerator.prepare(
          slot,
          blueprint.slots,
        );
        const job: DungeonInFlightJob = {
          dungeonId,
          generationId,
          kind: slot.kind,
          prompt: slot.prompt,
          slotId,
          startedAt: new Date().toISOString(),
        };
        await updateSlot(slotId, {
          clearError: true,
          generationId,
          status: "generating",
        });
        try {
          await this.inflight.put(job);
        } catch (error) {
          await updateSlot(slotId, {
            clearGenerationId: true,
            status: "planned",
          });
          throw error;
        }
        return prepared;
      },
    );
  }

  /**
   * Records a stopped or failed slot. A stop returns the slot to planned.
   * @param dungeonId - Package id
   * @param slotId - Prompt that was running
   * @param generationId - Run that finished
   * @param error - Failure from the agent
   */
  private async finishFailedSlot(
    dungeonId: string,
    slotId: string,
    generationId: string,
    error: unknown,
  ): Promise<void> {
    if (error instanceof GenerationCancelledException) {
      await this.blueprints.updateSlot(
        dungeonId,
        slotId,
        { clearError: true, clearGenerationId: true, status: "planned" },
        generationId,
      );
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Dungeon slot ${slotId} failed: ${message}`);
    await this.blueprints.updateSlot(
      dungeonId,
      slotId,
      { clearGenerationId: true, error: message, status: "failed" },
      generationId,
    );
  }

  /**
   * Fails runs that exceeded the time limit, and slots left generating with
   * no Redis record. Returns the runs that are still current.
   * @returns In-flight jobs a client should display
   */
  private async settle(): Promise<DungeonInFlightJob[]> {
    const now = Date.now();
    for (const job of await this.inflight.list()) {
      if (isStaleInFlightJob(job, now)) {
        await this.blueprints.updateSlot(
          job.dungeonId,
          job.slotId,
          {
            clearGenerationId: true,
            error: "This generation timed out.",
            status: "failed",
          },
          job.generationId,
        );
        await this.inflight.delete(job.generationId);
      }
    }

    const stored = await this.blueprints.listStored();
    for (const blueprint of stored) {
      for (const slot of blueprint.slots) {
        if (slot.status === "generating") {
          await this.failUnownedSlot(blueprint.id, slot.id);
        }
      }
    }

    const live = await this.inflight.list();
    return live.filter((job) => !isStaleInFlightJob(job, Date.now()));
  }

  /**
   * Fails a generating slot when Redis has no current run for it.
   * The check happens under the package lock so it cannot race the start
   * of a run, which writes the file and Redis together.
   * @param dungeonId - Package id
   * @param slotId - Slot that might have been left generating
   */
  private async failUnownedSlot(
    dungeonId: string,
    slotId: string,
  ): Promise<void> {
    await this.blueprints.withMutation(
      dungeonId,
      async ({ blueprint, updateSlot }) => {
        const slot = blueprint.slots.find((entry) => entry.id === slotId);
        if (slot?.status !== "generating") {
          return;
        }
        const jobs = await this.inflight.list();
        const owned = jobs.some(
          (job) =>
            job.generationId === slot.generationId &&
            !isStaleInFlightJob(job, Date.now()),
        );
        if (owned) {
          return;
        }
        await updateSlot(slotId, {
          clearGenerationId: true,
          error: "Generation stopped before it finished.",
          status: "failed",
        });
      },
    );
  }
}

/**
 * @param slot - Planned prompt
 * @returns The slot stored in the package file
 */
function toStoredSlot(slot: PlannedDungeonSlot): StoredDungeonSlot {
  if (slot.kind === "sprite-sheet") {
    return {
      characterSlotId: slot.characterSlotId,
      id: slot.id,
      kind: slot.kind,
      prompt: slot.prompt,
      status: "planned",
      title: slot.title,
    };
  }
  if (slot.kind === "playable-card") {
    return {
      characterSlotId: slot.characterSlotId,
      id: slot.id,
      kind: slot.kind,
      level: slot.level,
      prompt: slot.prompt,
      status: "planned",
      title: slot.title,
    };
  }
  return {
    id: slot.id,
    kind: slot.kind,
    prompt: slot.prompt,
    status: "planned",
    title: slot.title,
  };
}

/**
 * @param kind - Slot agent
 * @returns A short name for errors
 */
function slotLabel(kind: DungeonSlotKind): string {
  if (kind === "battle-background") {
    return "battle background";
  }
  if (kind === "card-character") {
    return "card character";
  }
  if (kind === "enemy") {
    return "enemy";
  }
  if (kind === "sprite-sheet") {
    return "sprite sheet";
  }
  return "playable card";
}

/**
 * @param job - Redis run record
 * @param now - Current time in milliseconds
 * @returns Whether the run is older than the in-flight limit
 */
function isStaleInFlightJob(job: DungeonInFlightJob, now: number): boolean {
  const started = Date.parse(job.startedAt);
  return Number.isNaN(started) || now - started > DUNGEON_IN_FLIGHT_MAX_AGE_MS;
}
