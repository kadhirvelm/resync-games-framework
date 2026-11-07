import { createHash } from "node:crypto";
import {
  HttpException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import type {
  AgentAssetGenerationState,
  AgentAssetGenerationStatus,
} from "@resync-game-framework/api";
import {
  type Job,
  Queue,
  QueueEvents,
  UnrecoverableError,
  Worker,
} from "bullmq";
import { ConfigurationService } from "src/configuration/configuration.service";
import { RedisService } from "src/infra/redis/redis.service";

const ERROR_PREFIX = "asset-generation-error:";
const DEFAULT_ATTEMPTS = 3;

/** Maximum worker time for image/card generation before distributed abort. */
export const ASSET_GENERATION_JOB_TIMEOUT_MS = 15 * 60_000;

/** Maximum worker time for provider-backed 3D generation. */
export const THREE_D_GENERATION_JOB_TIMEOUT_MS = 25 * 60_000;

/** Payload persisted in Redis for every asset generation. */
interface GenerationQueuePayload {
  payload: unknown;
  requestHash: string;
}

/** Error information that survives the BullMQ process boundary. */
interface SerializedGenerationError {
  message: string;
  status: number;
}

/** Options for one registered generation handler. */
export interface GenerationHandlerOptions<Payload> {
  /** Called once after BullMQ has exhausted retries. */
  onFailed?: (payload: Payload, error: Error) => Promise<void>;
  /** Called before a worker rejects work that exceeded `timeoutMs`. */
  onTimeout?: (payload: Payload) => Promise<unknown>;
  /** Hard worker ownership limit for one attempt. */
  timeoutMs?: number;
}

/** One process-local implementation for a durable queue job name. */
interface RegisteredHandler {
  handle: (payload: unknown) => Promise<unknown>;
  onFailed?: (payload: unknown, error: Error) => Promise<void>;
  onTimeout?: (payload: unknown) => Promise<unknown>;
  timeoutMs?: number;
}

/**
 * Durable BullMQ boundary for asset generation.
 * API nodes enqueue and may wait for results; worker-enabled nodes execute the
 * same named handlers with global and per-process concurrency limits.
 */
@Injectable()
export class GenerationQueueService
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly logger = new Logger(GenerationQueueService.name);
  private queue?: Queue<GenerationQueuePayload>;
  private queueEvents?: QueueEvents;
  private worker?: Worker<GenerationQueuePayload>;

  public constructor(
    private readonly configuration: ConfigurationService,
    private readonly redis: RedisService,
  ) {}

  /** Creates producer/event connections before asset services register work. */
  public async onModuleInit(): Promise<void> {
    const address = this.redis.getConnectionAddress();
    const queueName = this.queueName();
    this.queue = new Queue<GenerationQueuePayload>(queueName, {
      connection: { ...address, maxRetriesPerRequest: 1 },
      defaultJobOptions: {
        attempts: DEFAULT_ATTEMPTS,
        backoff: { delay: 2_000, type: "exponential" },
        removeOnComplete: { age: 86_400, count: 5_000 },
        removeOnFail: { age: 7 * 86_400, count: 5_000 },
      },
    });
    this.queueEvents = new QueueEvents(queueName, {
      connection: { ...address, maxRetriesPerRequest: null },
    });
    await Promise.all([
      this.queue.waitUntilReady(),
      this.queueEvents.waitUntilReady(),
    ]);
  }

  /** Starts a worker only after every asset module has registered its handler. */
  public async onApplicationBootstrap(): Promise<void> {
    if (!this.configuration.get("ASSET_GENERATION_WORKER_ENABLED")) {
      this.logger.log("Asset generation worker disabled on this process");
      return;
    }
    const queue = this.requireQueue();
    await queue.setGlobalConcurrency(
      this.configuration.get("ASSET_GENERATION_GLOBAL_CONCURRENCY"),
    );
    const address = this.redis.getConnectionAddress();
    this.worker = new Worker<GenerationQueuePayload>(
      this.queueName(),
      (job) => this.process(job),
      {
        concurrency: this.configuration.get(
          "ASSET_GENERATION_WORKER_CONCURRENCY",
        ),
        connection: { ...address, maxRetriesPerRequest: null },
        lockDuration: 60_000,
        maxStalledCount: 2,
        stalledInterval: 30_000,
      },
    );
    this.worker.on("failed", (job, error) => {
      void this.handleFailure(job, error).catch((failureError) => {
        this.logger.error("Asset failure callback failed", failureError);
      });
    });
    this.worker.on("error", (error) => {
      this.logger.error("Asset generation worker error", error);
    });
    await this.worker.waitUntilReady();
    this.logger.log(
      `Asset generation worker ready with local concurrency ${this.worker.opts.concurrency}`,
    );
  }

  /** Closes BullMQ-owned connections without touching shared Redis clients. */
  public async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([
      this.worker?.close(),
      this.queueEvents?.close(),
      this.queue?.close(),
    ]);
  }

  /**
   * Registers the process-local implementation for one durable job name.
   * @param name - Stable queue job name
   * @param handler - Work performed by worker-enabled processes
   * @param options - Optional terminal failure callback
   */
  public register<Payload, Result>(
    name: string,
    handler: (payload: Payload) => Promise<Result>,
    options: GenerationHandlerOptions<Payload> = {},
  ): void {
    if (this.handlers.has(name)) {
      throw new Error(`Asset generation handler ${name} is already registered`);
    }
    const onFailed = options.onFailed;
    const onTimeout = options.onTimeout;
    this.handlers.set(name, {
      handle: (payload) => handler(payload as Payload),
      onFailed: onFailed
        ? (payload, error) => onFailed(payload as Payload, error)
        : undefined,
      onTimeout: onTimeout
        ? (payload) => onTimeout(payload as Payload)
        : undefined,
      timeoutMs: options.timeoutMs,
    });
  }

  /**
   * Enqueues idempotent work and returns without waiting for generation.
   * @param name - Registered handler name
   * @param generationId - Globally unique client generation id
   * @param payload - JSON-serializable handler input
   */
  public async enqueue<Payload>(
    name: string,
    generationId: string,
    payload: Payload,
  ): Promise<void> {
    await this.addOrGet(name, generationId, payload);
  }

  /**
   * Enqueues idempotent work and waits across processes for its result.
   * @param name - Registered handler name
   * @param generationId - Globally unique client generation id
   * @param payload - JSON-serializable handler input
   * @returns Handler result from whichever worker completes the job
   */
  public async enqueueAndWait<Payload, Result>(
    name: string,
    generationId: string,
    payload: Payload,
  ): Promise<Result> {
    const job = await this.addOrGet(name, generationId, payload);
    try {
      return (await job.waitUntilFinished(this.requireQueueEvents())) as Result;
    } catch (error) {
      throw restoreError(error);
    }
  }

  /**
   * Removes queued work before it starts. Active work is stopped separately
   * through the distributed abort coordinator.
   * @param generationId - Client generation id
   * @returns Whether a waiting job was removed
   */
  public async cancel(generationId: string): Promise<boolean> {
    const job = await this.requireQueue().getJob(generationId);
    if (!job) return false;
    const state = await job.getState();
    if (
      !["waiting", "delayed", "prioritized", "waiting-children"].includes(state)
    ) {
      return false;
    }
    await job.remove();
    return true;
  }

  /**
   * Checks whether BullMQ still owns executable work for a generation.
   * @param generationId - Client generation id
   * @returns Whether a job is waiting, delayed, prioritized, or active
   */
  public async isInProgress(generationId: string): Promise<boolean> {
    const job = await this.requireQueue().getJob(generationId);
    if (!job) return false;
    const state = await job.getState();
    return [
      "active",
      "waiting",
      "delayed",
      "prioritized",
      "waiting-children",
    ].includes(state);
  }

  /**
   * Reads a retained job without waiting for it to finish.
   * @param generationId - Client generation id used as the BullMQ job id
   * @returns Poll-safe state, result, and error details, or undefined after retention expires
   */
  public async getStatus(
    generationId: string,
  ): Promise<AgentAssetGenerationStatus | undefined> {
    const job = await this.requireQueue().getJob(generationId);
    if (!job) return undefined;
    const bullMqState = await job.getState();
    const status = toAgentGenerationState(bullMqState);
    const response: AgentAssetGenerationStatus = {
      assetClass: assetClassForJob(job),
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(),
      jobId: job.id ?? generationId,
      status,
    };
    if (job.processedOn !== undefined) {
      response.startedAt = new Date(job.processedOn).toISOString();
    }
    if (job.finishedOn !== undefined) {
      response.finishedAt = new Date(job.finishedOn).toISOString();
    }
    if (status === "completed") response.result = job.returnvalue;
    if (status === "failed") {
      response.error = restoreError(
        new Error(job.failedReason || "Asset generation failed."),
      ).message;
    }
    return response;
  }

  /** Adds a job or returns the matching deduplicated record. */
  private async addOrGet<Payload>(
    name: string,
    generationId: string,
    payload: Payload,
  ): Promise<Job<GenerationQueuePayload>> {
    const queue = this.requireQueue();
    const requestHash = hashGenerationRequest(payload);
    const existing = await queue.getJob(generationId);
    if (existing) {
      assertSameRequest(existing, name, requestHash);
      return existing;
    }
    const added = await queue.add(
      name,
      { payload, requestHash },
      { jobId: generationId },
    );
    const persisted = (await queue.getJob(generationId)) ?? added;
    assertSameRequest(persisted, name, requestHash);
    return persisted;
  }

  /** Runs a registered handler and preserves useful errors for API waiters. */
  private async process(job: Job<GenerationQueuePayload>): Promise<unknown> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      throw new UnrecoverableError(
        encodeError(new Error(`No handler registered for ${job.name}`)),
      );
    }
    try {
      return await runWithTimeout(handler, job.data.payload);
    } catch (error) {
      const encoded = encodeError(error);
      const unrecoverable = isUnrecoverable(error);
      const attempts = job.opts.attempts ?? DEFAULT_ATTEMPTS;
      if (unrecoverable || job.attemptsMade + 1 >= attempts) {
        try {
          await handler.onFailed?.(job.data.payload, restoreError(error));
        } catch (callbackError) {
          this.logger.error("Asset failure callback failed", callbackError);
        }
      }
      if (unrecoverable) throw new UnrecoverableError(encoded);
      throw new Error(encoded);
    }
  }

  /** Invokes a handler's failure callback only after the final attempt. */
  private async handleFailure(
    job: Job<GenerationQueuePayload> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? DEFAULT_ATTEMPTS;
    const terminal =
      error instanceof UnrecoverableError || job.attemptsMade >= attempts;
    if (!terminal) return;
    const handler = this.handlers.get(job.name);
    await handler?.onFailed?.(job.data.payload, restoreError(error));
  }

  /** @returns Initialized queue or a lifecycle ordering error. */
  private requireQueue(): Queue<GenerationQueuePayload> {
    if (!this.queue)
      throw new Error("Asset generation queue is not initialized");
    return this.queue;
  }

  /** @returns Initialized queue events or a lifecycle ordering error. */
  private requireQueueEvents(): QueueEvents {
    if (!this.queueEvents) {
      throw new Error("Asset generation queue events are not initialized");
    }
    return this.queueEvents;
  }

  /** @returns Deployment-specific BullMQ queue name. */
  private queueName(): string {
    return this.configuration.get("ASSET_GENERATION_QUEUE_NAME");
  }
}

/**
 * Maps BullMQ's detailed lifecycle to the stable public polling contract.
 * @param state - State returned by BullMQ
 * @returns Stable public generation state
 */
export function toAgentGenerationState(
  state: string,
): AgentAssetGenerationState {
  if (
    ["waiting", "delayed", "prioritized", "waiting-children"].includes(state)
  ) {
    return "queued";
  }
  if (state === "active") return "running";
  if (state === "completed") return "completed";
  if (state === "failed") return "failed";
  return "unknown";
}

/**
 * Returns the public asset class, including the category of a 3D job.
 * @param job - Retained BullMQ generation job
 * @returns Agent-facing asset-class name
 */
function assetClassForJob(job: Job<GenerationQueuePayload>): string {
  if (job.name !== "three-d") return job.name;
  const payload = job.data.payload;
  if (payload === null || typeof payload !== "object") return job.name;
  const kind = (payload as { kind?: unknown }).kind;
  if (!["character", "environment", "prop"].includes(String(kind))) {
    return job.name;
  }
  return `three-d-${String(kind)}`;
}

/** Executes one attempt with an optional distributed-abort timeout. */
async function runWithTimeout(
  handler: RegisteredHandler,
  payload: unknown,
): Promise<unknown> {
  if (!handler.timeoutMs) return handler.handle(payload);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      void Promise.resolve(handler.onTimeout?.(payload)).catch(() => undefined);
      reject(
        new HttpException(
          `Asset generation exceeded ${handler.timeoutMs}ms.`,
          504,
        ),
      );
    }, handler.timeoutMs);
  });
  try {
    return await Promise.race([handler.handle(payload), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Produces a stable hash for JSON-like generation input.
 * @param payload - Serializable request payload
 * @returns SHA-256 digest used to reject id reuse with different input
 */
export function hashGenerationRequest(payload: unknown): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

/** Serializes object keys deterministically for request hashing. */
function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Rejects reuse of a generation id for a different job or request. */
function assertSameRequest(
  job: Job<GenerationQueuePayload>,
  name: string,
  requestHash: string,
): void {
  if (job.name === name && job.data.requestHash === requestHash) return;
  throw new HttpException(
    "Generation id already belongs to another request.",
    409,
  );
}

/** Encodes an error so a producer waiting on another process can restore it. */
function encodeError(error: unknown): string {
  const status = error instanceof HttpException ? error.getStatus() : 500;
  const serialized: SerializedGenerationError = {
    message:
      error instanceof Error ? error.message : "Asset generation failed.",
    status,
  };
  return `${ERROR_PREFIX}${JSON.stringify(serialized)}`;
}

/** Restores an HTTP-aware error from a failed BullMQ job. */
function restoreError(error: unknown): Error {
  const fallback = error instanceof Error ? error : new Error(String(error));
  const index = fallback.message.indexOf(ERROR_PREFIX);
  if (index < 0) return fallback;
  try {
    const serialized = JSON.parse(
      fallback.message.slice(index + ERROR_PREFIX.length),
    ) as SerializedGenerationError;
    return new HttpException(serialized.message, serialized.status);
  } catch {
    return fallback;
  }
}

/** Returns whether retrying an error cannot produce a different outcome. */
function isUnrecoverable(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const status = error.getStatus();
  return (
    status === 504 ||
    (status >= 400 && status < 500 && status !== 408 && status !== 429)
  );
}
