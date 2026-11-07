import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type {
  ThreeDAsset,
  ThreeDAssetKind,
  ThreeDGenerationPayload,
  ThreeDWorkshopServiceApi,
} from "@resync-game-framework/api";
import {
  GenerationQueueService,
  hashGenerationRequest,
  THREE_D_GENERATION_JOB_TIMEOUT_MS,
} from "src/generation-queue/generationQueue.service";
import {
  ThreeDCharacterAgent,
  ThreeDDesignAgent,
  ThreeDEnvironmentAgent,
  ThreeDPropAgent,
} from "src/mastra/agents/three-d/threeDAgents";
import { ThreeDPrototypeAgent } from "src/mastra/agents/three-d/threeDPrototypeAgent";
import { z } from "zod";
import { MeshyProvider, providerDelay } from "./meshyProvider";
import { ThreeDAssetStore } from "./threeDAssetStore";
import { ThreeDJobs } from "./threeDJobs";
import { ThreeDPrototypeStore } from "./threeDPrototypeStore";
import { THREE_D_LIMITS, threeDGenerationSchema } from "./threeDSchemas";

/** Asset, background generation, and package operations for the 3D workshop. */
@Injectable()
export class ThreeDService implements OnModuleInit {
  public constructor(
    private readonly assets: ThreeDAssetStore,
    private readonly meshy: MeshyProvider,
    private readonly jobs: ThreeDJobs,
    private readonly packages: ThreeDPrototypeStore,
    private readonly planner: ThreeDPrototypeAgent,
    private readonly prop: ThreeDPropAgent,
    private readonly environment: ThreeDEnvironmentAgent,
    private readonly character: ThreeDCharacterAgent,
    private readonly agent: ThreeDDesignAgent,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}
  /** Registers every 3D category behind one durable worker handler. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "three-d",
      (input: ThreeDWorkshopServiceApi["start"]["payload"]) =>
        this.executeQueued(input),
      {
        onFailed: (input, error) =>
          this.recordFailure(input.generationId, error),
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: THREE_D_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }
  /** @returns Stored models and provider readiness for one category. */
  public async list(kind: ThreeDAssetKind) {
    return {
      assets: await this.assets.list(kind),
      meshyConfigured: this.meshy.configured(),
    };
  }
  /** Generates through the same quota and deduplication gate as background jobs. */
  public async generate(
    kind: ThreeDAssetKind,
    payload: ThreeDGenerationPayload,
  ) {
    const admitted = await this.start({ ...payload, kind });
    const signal = AbortSignal.timeout(25 * 60_000);
    while (true) {
      const job = await this.jobs.get(admitted.generationId);
      if (job?.asset) return job.asset;
      if (job?.state === "failed") throw new BadRequestException(job.error);
      if (job?.state === "cancelled")
        throw new HttpException("Generation stopped.", 499);
      await providerDelay(300, signal);
    }
  }
  /** Dispatches an already-admitted request to its category-specific agent. */
  private execute(kind: ThreeDAssetKind, payload: ThreeDGenerationPayload) {
    const request = threeDGenerationSchema.parse({ ...payload, kind });
    return this[request.kind].query(request);
  }
  /** @returns A validation-checked manual GLB import. */
  public async ingest(
    kind: ThreeDAssetKind,
    payload: { name: string; fileName: string; glbBase64: string },
  ) {
    const input = z
      .object({
        fileName: z
          .string()
          .max(200)
          .regex(/\.glb$/i),
        glbBase64: z
          .string()
          .max(Math.ceil(THREE_D_LIMITS.bytes / 3) * 4)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
        name: z.string().trim().min(1).max(80),
      })
      .parse(payload);
    return this.assets.save({
      bytes: Buffer.from(input.glbBase64, "base64"),
      kind,
      name: input.name,
      prompt: `Imported ${input.fileName}`,
      provenance: {
        elapsedMs: 0,
        estimatedCredits: 0,
        jobIds: [],
        provider: "upload",
      },
    });
  }
  /** @returns Current packages and durable background jobs. */
  public async workshop() {
    return {
      jobs: await this.jobs.list(),
      prototypes: await this.packages.list(),
    };
  }
  /** Plans and stores a coherent prototype from one creative description. */
  public create(payload: {
    name: string;
    prompt: string;
    demo?: boolean;
    generationId?: string;
  }) {
    const input = z
      .object({
        demo: z.boolean().default(false),
        generationId: z.uuid().optional(),
        name: z.string().trim().max(80),
        prompt: z.string().trim().min(1).max(4000),
      })
      .parse(payload);
    return this.planner.query(
      input.name,
      input.prompt,
      input.demo,
      input.generationId,
    );
  }
  /** Attaches an already validated matching asset to a package slot. */
  public attach(payload: {
    prototypeId: string;
    slotId: string;
    assetId: string;
  }) {
    const input = z
      .object({ assetId: z.uuid(), prototypeId: z.uuid(), slotId: z.uuid() })
      .parse(payload);
    return this.packages.attach(input.prototypeId, input.slotId, input.assetId);
  }
  /** Stops a distributed model generation. */
  public async cancel(payload: { generationId: string }) {
    const generationId = z.uuid().parse(payload.generationId);
    const queued = await this.generationQueue?.cancel(generationId);
    if (queued) {
      await this.jobs.finish(generationId, {
        error: "Generation stopped.",
        stage: "Stopped",
        state: "cancelled",
      });
    }
    return {
      stopped: Boolean(queued) || (await this.agent.abort(generationId)),
    };
  }
  /**
   * Admits and starts an async job, returning immediately for refresh-safe UI.
   * @param payload - Explicit provider, category, brief and optional package slot
   * @returns Durable job state; duplicate ids do not resubmit provider tasks
   */
  public async start(payload: ThreeDWorkshopServiceApi["start"]["payload"]) {
    const input = threeDGenerationSchema
      .extend({ prototypeId: z.uuid().optional(), slotId: z.uuid().optional() })
      .parse(payload);
    if (Boolean(input.prototypeId) !== Boolean(input.slotId))
      throw new BadRequestException(
        "Package and slot must be supplied together.",
      );
    if (input.provider === "meshy" && !this.meshy.configured())
      throw new BadRequestException(
        "Meshy needs MESHY_API_KEY on the backend.",
      );
    if (input.prototypeId) {
      const prototype = await this.packages.read(input.prototypeId);
      if (
        !prototype.slots.some(
          (slot) => slot.id === input.slotId && slot.kind === input.kind,
        )
      )
        throw new BadRequestException("Unknown slot or incorrect asset kind.");
    }
    const job = {
      generationId: input.generationId,
      kind: input.kind,
      progress: 0,
      prompt: input.prompt,
      prototypeId: input.prototypeId,
      provider: input.provider,
      requestHash: hashGenerationRequest(input),
      slotId: input.slotId,
      stage: "Queued",
      startedAt: new Date().toISOString(),
      state: "running" as const,
    };
    if (!(await this.jobs.admit(job)))
      return (await this.jobs.get(job.generationId)) ?? job;
    if (!this.generationQueue) {
      const error = new InternalServerErrorException(
        "Asset generation queue is unavailable.",
      );
      await this.recordFailure(input.generationId, error);
      throw error;
    }
    try {
      await this.generationQueue.enqueue("three-d", input.generationId, input);
    } catch (error) {
      await this.recordFailure(input.generationId, error);
      throw error;
    }
    return job;
  }
  /** Executes an admitted job and records successful publication. */
  private async executeQueued(
    input: ThreeDWorkshopServiceApi["start"]["payload"],
  ): Promise<ThreeDAsset> {
    await this.jobs.progress(input.generationId, "Starting worker", 1);
    const asset =
      (await this.assets.find(input.kind, input.generationId)) ??
      (await this.execute(input.kind, input));
    if (input.prototypeId && input.slotId)
      await this.packages.attach(input.prototypeId, input.slotId, asset.id);
    await this.jobs.finish(input.generationId, {
      asset,
      progress: 100,
      stage: "Ready",
      state: "complete",
    });
    return asset;
  }

  /** Records the final BullMQ failure after retries are exhausted. */
  private async recordFailure(
    generationId: string,
    error: unknown,
  ): Promise<void> {
    const cancelled =
      (error instanceof Error &&
        error.name === "GenerationCancelledException") ||
      (error instanceof HttpException && error.getStatus() === 499);
    await this.jobs.finish(generationId, {
      error: error instanceof Error ? error.message : "3D generation failed.",
      stage: cancelled ? "Stopped" : "Failed",
      state: cancelled ? "cancelled" : "failed",
    });
  }
}
