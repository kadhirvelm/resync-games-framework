import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { PlayableCardServiceApi } from "@towers-of-coreborn/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { CardGeneratorAgent } from "src/mastra/agents/card-generator/cardGeneratorAgent";
import { runWithProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { PLAYABLE_CARD_STORAGE } from "./playableCardStorage";
import { readPlayableCard, readPlayableCards } from "./readPlayableCards";

/**
 * Playable-card asset class: generates one lore-backed card and lists the
 * cards already stored.
 */
@Injectable()
export class PlayableCardService implements OnModuleInit {
  public constructor(
    private readonly cardGeneratorAgent: CardGeneratorAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers this asset class on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "playable-card",
      (input: QueuedPlayableCard) => this.executeGeneration(input),
      {
        onTimeout: (input) => this.cardGeneratorAgent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops an in-flight card generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: PlayableCardServiceApi["cancel"]["payload"],
  ): Promise<PlayableCardServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.cardGeneratorAgent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * Searches the Lore document, writes a card, and returns the stored asset.
   * @param payload - Natural-language description of the card and the id that can stop it
   * @param sessionId - Browser session that holds the ProductNow connection
   * @returns The stored card with an absolute image URL
   * @throws BadRequestException when the prompt is empty or the generation id is not a UUID
   * @throws UnauthorizedException when ProductNow is not connected
   * @throws InternalServerErrorException when generation fails or the card cannot be read back
   */
  public async generate(
    payload: PlayableCardServiceApi["generate"]["payload"],
    sessionId: string,
  ): Promise<PlayableCardServiceApi["generate"]["response"]> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the card to generate.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const input = { generationId, prompt, sessionId };
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait(
        "playable-card",
        generationId,
        input,
      );
    }
    return this.executeGeneration(input);
  }

  /** Executes one idempotent playable-card generation inside a queue worker. */
  private executeGeneration(
    input: QueuedPlayableCard,
  ): Promise<PlayableCardServiceApi["generate"]["response"]> {
    return runWithProductNowSession(input.sessionId, async () => {
      const existing = await readPlayableCard(
        PLAYABLE_CARD_STORAGE.rootPath(),
        input.generationId,
        this.getPublicBaseUrl(),
      );
      if (existing) return existing;
      const { cardId } = await this.cardGeneratorAgent.query({
        generationId: input.generationId,
        prompt: input.prompt,
        sessionId: input.sessionId,
      });
      const card = await readPlayableCard(
        PLAYABLE_CARD_STORAGE.rootPath(),
        cardId,
        this.getPublicBaseUrl(),
      );
      if (card === undefined) {
        throw new InternalServerErrorException(
          `Playable card ${cardId} was generated but could not be read back.`,
        );
      }
      return card;
    });
  }

  /**
   * Lists stored playable cards, newest first.
   * @returns Every complete card with an absolute image URL
   */
  public async list(): Promise<PlayableCardServiceApi["list"]["response"]> {
    const cards = await readPlayableCards(
      PLAYABLE_CARD_STORAGE.rootPath(),
      this.getPublicBaseUrl(),
    );
    return { cards };
  }

  /**
   * @returns Absolute URL of the playable-card folder, without a trailing slash
   */
  private getPublicBaseUrl(): string {
    return PLAYABLE_CARD_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedPlayableCard {
  generationId: string;
  prompt: string;
  sessionId: string;
}
