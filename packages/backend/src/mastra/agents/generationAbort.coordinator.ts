import {
  ConflictException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { RedisService } from "src/infra/redis/redis.service";
import {
  GenerationCancelledException,
  isGenerationAbort,
  throwIfAborted,
} from "./generationCancelled";

/** Pub/sub channel that tells every backend process to stop a generation. */
const CANCEL_CHANNEL = "asset-generation:cancel";

/** How long a stop stays recorded, past the longest generation timeout. */
const CANCEL_TTL_SECONDS = 35 * 60;

/** One local run whose model calls listen to `signal`. */
export interface GenerationRun {
  /**
   * Drops this run. A newer run with the same id is left in place.
   */
  end: () => Promise<void>;
  /** Aborts when this id is stopped from any process */
  signal: AbortSignal;
}

/**
 * Coordinates generation aborts across backend processes.
 * Each process keeps the `AbortController` for runs it started. Redis stores
 * the stop and publishes it, so a cancel request can land on a different
 * process from the one painting the asset.
 */
@Injectable()
export class GenerationAbortCoordinator
  implements OnModuleInit, OnModuleDestroy
{
  private readonly runs = new Map<string, AbortController>();

  public constructor(private readonly redisService: RedisService) {}

  /**
   * Listens for stop messages published by any process.
   */
  public async onModuleInit(): Promise<void> {
    await this.redisService.subscribe(CANCEL_CHANNEL, (generationId) => {
      this.abortLocal(generationId);
    });
  }

  /**
   * Stops listening for stop messages.
   */
  public async onModuleDestroy(): Promise<void> {
    await this.redisService.unsubscribe(CANCEL_CHANNEL);
  }

  /**
   * Opens a run. A stop recorded before this call aborts the signal immediately.
   * @param generationId - Client id for this generation
   * @returns The signal to pass into model calls, and how to drop the run
   */
  public async begin(generationId: string): Promise<GenerationRun> {
    const previous = this.runs.get(generationId);
    if (previous !== undefined && !previous.signal.aborted) {
      throw new ConflictException(
        "A generation with this id is already running on this worker.",
      );
    }

    const controller = new AbortController();
    this.runs.set(generationId, controller);
    const alreadyStopped = await this.redisService.get(
      cancelledKey(generationId),
    );
    if (alreadyStopped != null) {
      controller.abort();
    }

    return {
      end: async () => {
        if (this.runs.get(generationId) !== controller) return;
        this.runs.delete(generationId);
        if (!controller.signal.aborted) {
          await this.redisService.del(cancelledKey(generationId));
        }
      },
      signal: controller.signal,
    };
  }

  /**
   * Runs one generation with the shared distributed cancellation lifecycle.
   * This is the normal entry point for agents: it opens the run, rejects a
   * previously recorded stop, translates abort errors, and always closes it.
   * @param generationId - Client id used to stop this generation
   * @param operation - Agent work that receives the distributed abort signal
   * @returns The operation result
   * @throws GenerationCancelledException when the run is stopped
   */
  public async run<Result>(
    generationId: string,
    operation: (signal: AbortSignal) => Promise<Result>,
  ): Promise<Result> {
    const run = await this.begin(generationId);
    try {
      throwIfAborted(run.signal);
      return await operation(run.signal);
    } catch (error) {
      if (isGenerationAbort(error, run.signal)) {
        throw new GenerationCancelledException();
      }
      throw error;
    } finally {
      await run.end();
    }
  }

  /**
   * Records a stop in Redis and aborts the run on every listening process.
   * @param generationId - Client id passed to {@link GenerationAbortCoordinator.begin}
   * @returns Whether the stop was recorded
   */
  public async stop(generationId: string): Promise<boolean> {
    await this.redisService.set(
      cancelledKey(generationId),
      "1",
      CANCEL_TTL_SECONDS,
    );
    await this.redisService.publish(CANCEL_CHANNEL, generationId);
    this.abortLocal(generationId);
    return true;
  }

  /**
   * @param generationId - Id from a Redis stop message or a local stop call
   */
  private abortLocal(generationId: string): void {
    const controller = this.runs.get(generationId);
    if (controller === undefined || controller.signal.aborted) {
      return;
    }
    controller.abort();
  }
}

/**
 * @param generationId - Client generation id
 * @returns Redis key that records a stop for this id
 */
function cancelledKey(generationId: string): string {
  return `asset-generation:cancelled:${generationId}`;
}
