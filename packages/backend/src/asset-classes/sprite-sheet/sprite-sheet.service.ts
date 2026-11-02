import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { SpriteSheetServiceApi } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { SpriteSheetAgent } from "src/mastra/agents/sprite-sheet/spriteSheetAgent";
import {
  readActiveProductNowSession,
  runWithProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { readSpriteSheet, readSpriteSheets } from "./readSpriteSheets";
import { SPRITE_SHEET_STORAGE } from "./spriteSheetStorage";

/** Generates and lists animated character sprite sheets. */
@Injectable()
export class SpriteSheetService implements OnModuleInit {
  public constructor(
    private readonly agent: SpriteSheetAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers this asset class on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "sprite-sheet",
      (input: QueuedSpriteSheet) => this.executeGeneration(input),
      {
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops an in-flight sprite-sheet generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: SpriteSheetServiceApi["cancel"]["payload"],
  ): Promise<SpriteSheetServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.agent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * @param payload - Natural-language character idea and the id that can stop it
   * @returns Newly stored sprite sheet, split into animations
   */
  public async generate(
    payload: SpriteSheetServiceApi["generate"]["payload"],
  ): Promise<SpriteSheetServiceApi["generate"]["response"]> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the character to animate.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const input = {
      generationId,
      productNowSessionId: readActiveProductNowSession(),
      prompt,
    };
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait(
        "sprite-sheet",
        generationId,
        input,
      );
    }
    return this.executeGeneration(input);
  }

  /** Executes one idempotent sprite generation inside a queue worker. */
  private executeGeneration(
    input: QueuedSpriteSheet,
  ): Promise<SpriteSheetServiceApi["generate"]["response"]> {
    const execute = async () => {
      const existing = await readSpriteSheet(
        SPRITE_SHEET_STORAGE.rootPath(),
        input.generationId,
        this.getPublicBaseUrl(),
      );
      if (existing) return existing;
      const { id } = await this.agent.query({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      const asset = await readSpriteSheet(
        SPRITE_SHEET_STORAGE.rootPath(),
        id,
        this.getPublicBaseUrl(),
      );
      if (asset === undefined) {
        throw new InternalServerErrorException(
          `Sprite sheet ${id} was generated but could not be read back.`,
        );
      }
      return asset;
    };
    return input.productNowSessionId
      ? runWithProductNowSession(input.productNowSessionId, execute)
      : execute();
  }

  /**
   * @returns Stored sprite sheets, newest first
   */
  public async list(): Promise<SpriteSheetServiceApi["list"]["response"]> {
    return {
      spriteSheets: await readSpriteSheets(
        SPRITE_SHEET_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute URL of the sprite-sheet static folder */
  private getPublicBaseUrl(): string {
    return SPRITE_SHEET_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedSpriteSheet {
  generationId: string;
  productNowSessionId?: string;
  prompt: string;
}
