import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { StaticImageServiceApi } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { StaticImageAgent } from "src/mastra/agents/static-image/staticImageAgent";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { readStaticImage, readStaticImages } from "./readStaticImages";
import { STATIC_IMAGE_STORAGE } from "./staticImageStorage";

/** Generates and lists reusable standalone 2D images. */
@Injectable()
export class StaticImageService implements OnModuleInit {
  public constructor(
    private readonly agent: StaticImageAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers the static-image handler on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "static-image",
      (input: QueuedStaticImage) => this.executeGeneration(input),
      {
        onFailed: async (input) => {
          await this.agent.abort(input.generationId);
        },
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops one in-flight static-image generation.
   * @param payload - Client generation id
   * @returns Whether a queued or active run was stopped
   */
  public async cancel(
    payload: StaticImageServiceApi["cancel"]["payload"],
  ): Promise<StaticImageServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.agent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * Enqueues one natural-language image request.
   * @param payload - Image request and stable generation id
   * @returns Newly stored image
   */
  public async generate(
    payload: StaticImageServiceApi["generate"]["payload"],
  ): Promise<StaticImageServiceApi["generate"]["response"]> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the static image to generate.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const input = { generationId, prompt };
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait(
        "static-image",
        generationId,
        input,
      );
    }
    return this.executeGeneration(input);
  }

  /** Executes one idempotent static-image generation. */
  private async executeGeneration(
    input: QueuedStaticImage,
  ): Promise<StaticImageServiceApi["generate"]["response"]> {
    const existing = await readStaticImage(
      STATIC_IMAGE_STORAGE.rootPath(),
      input.generationId,
      this.getPublicBaseUrl(),
    );
    if (existing) return existing;
    const { id } = await this.agent.query(input);
    const asset = await readStaticImage(
      STATIC_IMAGE_STORAGE.rootPath(),
      id,
      this.getPublicBaseUrl(),
    );
    if (asset === undefined) {
      throw new InternalServerErrorException(
        `Static image ${id} was generated but could not be read back.`,
      );
    }
    return asset;
  }

  /** @returns Stored static images, newest first */
  public async list(): Promise<StaticImageServiceApi["list"]["response"]> {
    return {
      staticImages: await readStaticImages(
        STATIC_IMAGE_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute public URL of the static-image folder */
  private getPublicBaseUrl(): string {
    return STATIC_IMAGE_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedStaticImage {
  generationId: string;
  prompt: string;
}
