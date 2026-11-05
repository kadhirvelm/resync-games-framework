import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import type { AudioServiceApi } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  ASSET_GENERATION_JOB_TIMEOUT_MS,
  GenerationQueueService,
} from "src/generation-queue/generationQueue.service";
import { AudioAgent } from "src/mastra/agents/audio/audioAgent";
import {
  readActiveProductNowSession,
  runWithProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import { requireGenerationId } from "../shared/requireGenerationId";
import { requireGenerationPrompt } from "../shared/requireGenerationPrompt";
import { AUDIO_STORAGE } from "./audioStorage";
import { readAudioClip, readAudioClips } from "./readAudioClips";

/** Generates and lists sound effects, ambience, and music. */
@Injectable()
export class AudioService implements OnModuleInit {
  public constructor(
    private readonly agent: AudioAgent,
    private readonly configurationService: ConfigurationService,
    @Optional()
    private readonly generationQueue?: GenerationQueueService,
  ) {}

  /** Registers this asset class on worker-enabled processes. */
  public onModuleInit(): void {
    this.generationQueue?.register(
      "audio",
      (input: QueuedAudio) => this.executeGeneration(input),
      {
        onTimeout: (input) => this.agent.abort(input.generationId),
        timeoutMs: ASSET_GENERATION_JOB_TIMEOUT_MS,
      },
    );
  }

  /**
   * Stops an in-flight audio generation.
   * @param payload - Client generation id
   * @returns Whether the stop was recorded
   */
  public async cancel(
    payload: AudioServiceApi["cancel"]["payload"],
  ): Promise<AudioServiceApi["cancel"]["response"]> {
    const generationId = requireGenerationId(payload.generationId);
    const [queued, active] = await Promise.all([
      this.generationQueue?.cancel(generationId) ?? false,
      this.agent.abort(generationId),
    ]);
    return { stopped: queued || active };
  }

  /**
   * @param payload - Natural-language sound idea and the id that can stop it
   * @returns Newly stored clip
   */
  public async generate(
    payload: AudioServiceApi["generate"]["payload"],
  ): Promise<AudioServiceApi["generate"]["response"]> {
    const prompt = requireGenerationPrompt(
      payload.prompt,
      "Describe the sound to generate.",
    );
    const generationId = requireGenerationId(payload.generationId);
    const input = {
      cue: payload.cue,
      generationId,
      loop: payload.loop,
      productNowSessionId: readActiveProductNowSession(),
      prompt,
      role: payload.role,
      useLore: payload.useLore,
    };
    if (this.generationQueue) {
      return this.generationQueue.enqueueAndWait("audio", generationId, input);
    }
    return this.executeGeneration(input);
  }

  /** Executes one idempotent audio generation inside a queue worker. */
  private executeGeneration(
    input: QueuedAudio,
  ): Promise<AudioServiceApi["generate"]["response"]> {
    const execute = async () => {
      const existing = await readAudioClip(
        AUDIO_STORAGE.rootPath(),
        input.generationId,
        this.getPublicBaseUrl(),
      );
      if (existing) return existing;
      const { id } = await this.agent.query({
        cue: input.cue,
        generationId: input.generationId,
        loop: input.loop,
        prompt: input.prompt,
        role: input.role,
        useLore: input.useLore,
      });
      const asset = await readAudioClip(
        AUDIO_STORAGE.rootPath(),
        id,
        this.getPublicBaseUrl(),
      );
      if (asset === undefined) {
        throw new InternalServerErrorException(
          `Audio ${id} was generated but could not be read back.`,
        );
      }
      return asset;
    };
    return input.productNowSessionId
      ? runWithProductNowSession(input.productNowSessionId, execute)
      : execute();
  }

  /**
   * @returns Stored clips, newest first
   */
  public async list(): Promise<AudioServiceApi["list"]["response"]> {
    return {
      clips: await readAudioClips(
        AUDIO_STORAGE.rootPath(),
        this.getPublicBaseUrl(),
      ),
    };
  }

  /** @returns Absolute URL of the audio static folder */
  private getPublicBaseUrl(): string {
    return AUDIO_STORAGE.publicUrl(
      this.configurationService.get("BACKEND_API_URL"),
    );
  }
}

/** Serializable input carried across the asset-generation queue. */
interface QueuedAudio {
  cue?: AudioServiceApi["generate"]["payload"]["cue"];
  generationId: string;
  loop?: boolean;
  productNowSessionId?: string;
  prompt: string;
  role?: AudioServiceApi["generate"]["payload"]["role"];
  useLore?: boolean;
}
