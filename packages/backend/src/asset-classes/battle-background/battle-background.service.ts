import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { BattleBackgroundServiceApi } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { BattleBackgroundAgent } from "src/mastra/agents/battle-background/battleBackgroundAgent";
import {
  readActiveProductNowSession,
  runWithProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { BATTLE_BACKGROUND_STORAGE } from "./battleBackgroundStorage";
import {
  readBattleBackground,
  readBattleBackgrounds,
} from "./readBattleBackgrounds";

/** Generates and lists wide battle-room backgrounds. */
@Injectable()
export class BattleBackgroundService implements OnModuleInit {
  public constructor(
    private readonly agent: BattleBackgroundAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers this asset class on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "battle-background",
      (input: QueuedBattleBackground) => this.executeGeneration(input),
      {
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops an in-flight background generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: BattleBackgroundServiceApi["cancel"]["payload"],
  ): Promise<BattleBackgroundServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.agent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * Queues a background without holding the HTTP request open.
   * @param payload - Natural-language room idea and stable generation id
   * @returns Resolves after BullMQ accepts the job
   */
  public async enqueue(
    payload: BattleBackgroundServiceApi["generate"]["payload"],
  ): Promise<void> {
    const input = this.prepareGeneration(payload);
    if (!this.generationQueue) {
      throw new InternalServerErrorException(
        "Asset generation queue is unavailable.",
      );
    }
    await this.generationQueue.enqueue(
      "battle-background",
      input.generationId,
      input,
    );
  }

  /**
   * @param payload - Natural-language room idea and the id that can stop it
   * @returns Newly stored background
   */
  public async generate(
    payload: BattleBackgroundServiceApi["generate"]["payload"],
  ): Promise<BattleBackgroundServiceApi["generate"]["response"]> {
    const input = this.prepareGeneration(payload);
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait(
        "battle-background",
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
    payload: BattleBackgroundServiceApi["generate"]["payload"],
  ): QueuedBattleBackground {
    return {
      generationId: requireGenerationId(payload.generationId),
      productNowSessionId: readActiveProductNowSession(),
      prompt: requireGenerationPrompt(
        payload.prompt,
        "Describe the battle room to generate.",
      ),
    };
  }

  /** Executes one idempotent background generation inside a queue worker. */
  private executeGeneration(
    input: QueuedBattleBackground,
  ): Promise<BattleBackgroundServiceApi["generate"]["response"]> {
    const execute = async () => {
      const existing = await readBattleBackground(
        BATTLE_BACKGROUND_STORAGE.rootPath(),
        input.generationId,
        this.getPublicBaseUrl(),
      );
      if (existing) return existing;
      const { id } = await this.agent.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      const asset = await readBattleBackground(
        BATTLE_BACKGROUND_STORAGE.rootPath(),
        id,
        this.getPublicBaseUrl(),
      );
      if (asset === undefined) {
        throw new InternalServerErrorException(
          `Battle background ${id} was generated but could not be read back.`,
        );
      }
      return asset;
    };
    return input.productNowSessionId
      ? runWithProductNowSession(input.productNowSessionId, execute)
      : execute();
  }

  /**
   * @returns Stored backgrounds, newest first
   */
  public async list(): Promise<BattleBackgroundServiceApi["list"]["response"]> {
    return {
      backgrounds: await readBattleBackgrounds(
        BATTLE_BACKGROUND_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute URL of the battle-background static folder */
  private getPublicBaseUrl(): string {
    return BATTLE_BACKGROUND_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedBattleBackground {
  generationId: string;
  productNowSessionId?: string;
  prompt: string;
}
