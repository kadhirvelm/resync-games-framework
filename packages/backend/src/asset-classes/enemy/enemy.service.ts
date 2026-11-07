import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { EnemyServiceApi } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { EnemyAgent } from "src/mastra/agents/enemy/enemyAgent";
import {
  readActiveProductNowSession,
  runWithProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { ENEMY_STORAGE } from "./enemyStorage";
import { readEnemies, readEnemy } from "./readEnemies";

/** Generates and lists full-body enemy portraits. */
@Injectable()
export class EnemyService implements OnModuleInit {
  public constructor(
    private readonly agent: EnemyAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers this asset class on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "enemy",
      (input: QueuedEnemy) => this.executeGeneration(input),
      {
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops an in-flight enemy generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: EnemyServiceApi["cancel"]["payload"],
  ): Promise<EnemyServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.agent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * Queues an enemy without holding the HTTP request open.
   * @param payload - Creature prompt and stable generation id
   * @returns Resolves after BullMQ accepts the job
   */
  public async enqueue(
    payload: EnemyServiceApi["generate"]["payload"],
  ): Promise<void> {
    const input = this.prepareGeneration(payload);
    if (!this.generationQueue) {
      throw new InternalServerErrorException(
        "Asset generation queue is unavailable.",
      );
    }
    await this.generationQueue.enqueue("enemy", input.generationId, input);
  }

  /**
   * @param payload - Natural-language creature idea and the id that can stop it
   * @returns Newly stored enemy
   */
  public async generate(
    payload: EnemyServiceApi["generate"]["payload"],
  ): Promise<EnemyServiceApi["generate"]["response"]> {
    const input = this.prepareGeneration(payload);
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait(
        "enemy",
        input.generationId,
        input,
      );
    }
    return this.executeGeneration(input);
  }

  /**
   * Validates public input and captures request-scoped lore access.
   * @param payload - Public asset generation payload
   * @returns Serializable worker input
   */
  private prepareGeneration(
    payload: EnemyServiceApi["generate"]["payload"],
  ): QueuedEnemy {
    return {
      generationId: requireGenerationId(payload.generationId),
      productNowSessionId: readActiveProductNowSession(),
      prompt: requireGenerationPrompt(
        payload.prompt,
        "Describe the enemy to generate.",
      ),
    };
  }

  /** Executes one idempotent enemy generation inside a queue worker. */
  private executeGeneration(
    input: QueuedEnemy,
  ): Promise<EnemyServiceApi["generate"]["response"]> {
    const execute = async () => {
      const existing = await readEnemy(
        ENEMY_STORAGE.rootPath(),
        input.generationId,
        this.getPublicBaseUrl(),
      );
      if (existing) return existing;
      const { id } = await this.agent.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      const asset = await readEnemy(
        ENEMY_STORAGE.rootPath(),
        id,
        this.getPublicBaseUrl(),
      );
      if (asset === undefined) {
        throw new InternalServerErrorException(
          `Enemy ${id} was generated but could not be read back.`,
        );
      }
      return asset;
    };
    return input.productNowSessionId
      ? runWithProductNowSession(input.productNowSessionId, execute)
      : execute();
  }

  /**
   * @returns Stored enemies, newest first
   */
  public async list(): Promise<EnemyServiceApi["list"]["response"]> {
    return {
      enemies: await readEnemies(
        ENEMY_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute URL of the enemy static folder */
  private getPublicBaseUrl(): string {
    return ENEMY_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedEnemy {
  generationId: string;
  productNowSessionId?: string;
  prompt: string;
}
