import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AGENT_ASSET_CLASSES,
  type AgentAssetClass,
  type AgentAssetGenerationAccepted,
  type AgentAssetGenerationRequest,
  type AgentAssetGenerationStatus,
  type AssetGenerationPayload,
  AUDIO_CUES,
  AUDIO_ROLES,
  type AudioGenerationPayload,
  type ThreeDAssetKind,
  type ThreeDGenerationPayload,
} from "@resync-game-framework/api";
import { GenerationQueueService } from "src/generation-queue/generationQueue.service";
import { requireActiveProductNowSession } from "src/product-now-mcp/productNowSessionContext";
import { AudioService } from "../audio/audio.service";
import { BattleBackgroundService } from "../battle-background/battle-background.service";
import { CardCharacterService } from "../card-character/card-character.service";
import { EnemyService } from "../enemy/enemy.service";
import { PlayableCardService } from "../playable-card/playable-card.service";
import { requireGenerationId } from "../shared/requireGenerationId";
import { SpriteSheetService } from "../sprite-sheet/sprite-sheet.service";
import { StaticImageService } from "../static-image/static-image.service";
import { ThreeDService } from "../three-d/threeD.service";

const STATUS_ROUTE = "/agent/assets/generations";

/** Routes agent-facing generation requests through each asset class's validation. */
@Injectable()
export class AgentAssetGenerationService {
  public constructor(
    private readonly queue: GenerationQueueService,
    private readonly audio: AudioService,
    private readonly battleBackground: BattleBackgroundService,
    private readonly cardCharacter: CardCharacterService,
    private readonly enemy: EnemyService,
    private readonly playableCard: PlayableCardService,
    private readonly spriteSheet: SpriteSheetService,
    private readonly staticImage: StaticImageService,
    private readonly threeD: ThreeDService,
  ) {}

  /**
   * Validates and durably queues one asset generation.
   * @param request - Asset class, prompt, optional id, and class-specific options
   * @returns Job id and relative polling URL
   */
  public async enqueue(
    request: AgentAssetGenerationRequest,
  ): Promise<AgentAssetGenerationAccepted> {
    const input = requireRequestRecord(request);
    const assetClass = requireAssetClass(input.assetClass);
    validateRequestFields(input, assetClass);
    const generationId = requireGenerationId(
      input.generationId === undefined
        ? randomUUID()
        : String(input.generationId),
    );
    const { assetClass: _assetClass, ...payload } = input;
    await this.dispatch(assetClass, { ...payload, generationId });
    const status = await this.queue.getStatus(generationId);
    return {
      assetClass,
      jobId: generationId,
      status: status?.status ?? "queued",
      statusUrl: `${STATUS_ROUTE}/${generationId}`,
    };
  }

  /**
   * Reads one retained queue job.
   * @param jobId - Generation id returned by enqueue
   * @returns Normalized queue state and the result or error when terminal
   */
  public async status(jobId: string): Promise<AgentAssetGenerationStatus> {
    const generationId = requireGenerationId(jobId);
    const status = await this.queue.getStatus(generationId);
    if (!status) {
      throw new NotFoundException(
        `No generation job found for ${generationId}.`,
      );
    }
    return status;
  }

  /**
   * Sends a normalized request through its existing asset service.
   * @param assetClass - Validated public asset-class name
   * @param payload - Request body without the asset-class discriminator
   * @returns Resolves after the class-specific service accepts the job
   */
  private async dispatch(
    assetClass: AgentAssetClass,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (assetClass === "audio") {
      await this.audio.enqueue(payload as unknown as AudioGenerationPayload);
      return;
    }
    if (assetClass === "playable-card") {
      await this.playableCard.enqueue(
        payload as unknown as AssetGenerationPayload,
        requireActiveProductNowSession(),
      );
      return;
    }
    if (assetClass.startsWith("three-d-")) {
      await this.threeD.start({
        ...(payload as unknown as ThreeDGenerationPayload),
        kind: threeDKindFor(assetClass),
      });
      return;
    }
    const promptPayload = payload as unknown as AssetGenerationPayload;
    if (assetClass === "battle-background") {
      await this.battleBackground.enqueue(promptPayload);
      return;
    }
    if (assetClass === "card-character") {
      await this.cardCharacter.enqueue(promptPayload);
      return;
    }
    if (assetClass === "enemy") {
      await this.enemy.enqueue(promptPayload);
      return;
    }
    if (assetClass === "sprite-sheet") {
      await this.spriteSheet.enqueue(promptPayload);
      return;
    }
    await this.staticImage.enqueue(promptPayload);
  }
}

/**
 * Validates fields not covered by the prompt-only asset services.
 * @param input - Untrusted request body
 * @param assetClass - Validated asset-class discriminator
 * @returns Nothing when all fields are valid
 */
function validateRequestFields(
  input: Record<string, unknown>,
  assetClass: AgentAssetClass,
): void {
  if (typeof input.prompt !== "string") {
    throw new BadRequestException("Generation prompt must be a string.");
  }
  if (
    input.generationId !== undefined &&
    typeof input.generationId !== "string"
  ) {
    throw new BadRequestException("Generation id must be a UUID.");
  }
  if (assetClass !== "audio") return;
  requireOptionalMember(input.cue, AUDIO_CUES, "Audio cue");
  requireOptionalMember(input.role, AUDIO_ROLES, "Audio role");
  requireOptionalBoolean(input.loop, "Audio loop");
  requireOptionalBoolean(input.useLore, "Audio useLore");
}

/**
 * Rejects an optional value outside a finite string catalog.
 * @param value - Optional untrusted field value
 * @param allowed - Accepted string values
 * @param label - Caller-facing field label
 * @returns Nothing when the value is absent or allowed
 */
function requireOptionalMember(
  value: unknown,
  allowed: readonly string[],
  label: string,
): void {
  if (value === undefined || allowed.includes(String(value))) return;
  throw new BadRequestException(
    `${label} must be one of: ${allowed.join(", ")}.`,
  );
}

/**
 * Rejects an optional flag unless it is a JSON boolean.
 * @param value - Optional untrusted field value
 * @param label - Caller-facing field label
 * @returns Nothing when the value is absent or boolean
 */
function requireOptionalBoolean(value: unknown, label: string): void {
  if (value === undefined || typeof value === "boolean") return;
  throw new BadRequestException(`${label} must be a boolean.`);
}

/**
 * Rejects missing, array, or primitive request bodies.
 * @param request - Untrusted controller body
 * @returns Object body safe for field-level validation
 */
function requireRequestRecord(
  request: AgentAssetGenerationRequest,
): Record<string, unknown> {
  if (
    request === null ||
    typeof request !== "object" ||
    Array.isArray(request)
  ) {
    throw new BadRequestException("Generation request must be a JSON object.");
  }
  return request as unknown as Record<string, unknown>;
}

/**
 * Returns a supported asset class or a caller-facing validation error.
 * @param value - Untrusted asset-class field
 * @returns Validated asset class
 */
function requireAssetClass(value: unknown): AgentAssetClass {
  const assetClass = typeof value === "string" ? value : "";
  if (!AGENT_ASSET_CLASSES.some((candidate) => candidate === assetClass)) {
    throw new BadRequestException(
      `Asset class must be one of: ${AGENT_ASSET_CLASSES.join(", ")}.`,
    );
  }
  return assetClass as AgentAssetClass;
}

/**
 * Extracts the storage kind from a validated 3D agent asset class.
 * @param assetClass - Validated 3D asset-class name
 * @returns Matching 3D storage kind
 */
function threeDKindFor(assetClass: AgentAssetClass): ThreeDAssetKind {
  if (assetClass === "three-d-character") return "character";
  if (assetClass === "three-d-environment") return "environment";
  return "prop";
}
