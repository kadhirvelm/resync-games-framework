import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AgentTool } from "@towers-of-coreborn/api";
import {
  readSpriteSheetImages,
  type SpriteSheetImages,
} from "src/asset-classes/sprite-sheet/readSpriteSheetImages";
import { SPRITE_SHEET_AGENT_INSTRUCTIONS } from "src/asset-classes/sprite-sheet/spriteSheetPrompt";
import { SpriteSheetToolService } from "src/asset-classes/sprite-sheet/spriteSheetTool.service";
import {
  createSpriteSheetTools,
  type SpriteSheetDraft,
  type SpriteSheetGenerationState,
  SUBMIT_SPRITE_SHEET_TOOL_ID,
} from "src/asset-classes/sprite-sheet/spriteSheetTools";
import {
  type TowersOfCorebornAgentChatResults,
  TowersOfCorebornAgentService,
} from "src/mastra/shared/towersOfCorebornAgent.service";
import {
  collectImageFilePaths,
  deleteImageFiles,
} from "src/mastra/tools/generateImageTool.service";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { throwIfAborted } from "../generationCancelled";
import type { QueryableAgent } from "../queryableAgent";

/**
 * Registered tools this agent calls.
 * Add a member, set to an {@link AgentTool} value, to give the agent that tool.
 */
export enum SpriteSheetAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/** Lore consult, submission, image generation, and closing response. */
const SPRITE_SHEET_COORDINATOR_STEPS = 6;

/** Input for one sprite-sheet query. */
export interface SpriteSheetInput {
  /** Client id used to stop this run */
  generationId: string;
  /** Natural-language description of the character */
  prompt: string;
}

/** Result of one sprite-sheet query. */
export interface SpriteSheetResult {
  /** Folder name of the stored sprite sheet */
  id: string;
  /** The coordinator agent's closing text */
  summary: string;
}

/**
 * Sprite-sheet agent. Call {@link SpriteSheetAgent.query} with a character
 * description. It passes {@link SpriteSheetAgentTool} to the agent runner,
 * which loads `consult-productnow` and `generate-image`. The model checks the
 * Lore document, submits a design, then paints an identity anchor and an
 * animation sheet from it. The sheet is split into one strip per animation.
 */
@Injectable()
export class SpriteSheetAgent
  implements QueryableAgent<SpriteSheetInput, SpriteSheetResult>
{
  public constructor(
    private readonly agents: TowersOfCorebornAgentService,
    private readonly toolService: SpriteSheetToolService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight sprite-sheet generation on whichever process is running it.
   * @param generationId - Id passed to {@link SpriteSheetAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates, splits, and stores one sprite sheet.
   * @param input - User's character description and the id that can stop it
   * @returns Stored sprite-sheet id and coordinator summary
   * @throws GenerationCancelledException when the run is stopped
   * @throws InternalServerErrorException when a tool failed, was skipped, or returned unusable images
   */
  public async query(input: SpriteSheetInput): Promise<SpriteSheetResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      const state: SpriteSheetGenerationState = {};
      let imagePaths: string[] = [];
      try {
        const result = await this.agents.runAssetClassAgentChat({
          abortSignal: signal,
          agentId: "sprite-sheet-generation-agent",
          catalogTools: SpriteSheetAgentTool,
          instructions: SPRITE_SHEET_AGENT_INSTRUCTIONS,
          maxSteps: SPRITE_SHEET_COORDINATOR_STEPS,
          ownedTools: createSpriteSheetTools(state, signal),
          prompt: input.prompt,
        });
        imagePaths = result.toolResults.flatMap((call) =>
          collectImageFilePaths(call.result),
        );
        throwIfAborted(signal);
        const painted = readPaintedSpriteSheet(result, state);
        const saved = await this.toolService.saveGeneratedSpriteSheet({
          draft: painted.draft,
          images: painted.images,
          sourcePrompt: input.prompt,
        });
        return { id: saved.id, summary: result.text };
      } finally {
        await deleteImageFiles(imagePaths);
      }
    });
  }
}

/**
 * Requires lore research, a submitted design, and one successful image call.
 * @param result - Tool calls observed during the agent run
 * @param state - Design captured by submit-sprite-sheet
 * @returns The accepted design with its anchor and sheet
 */
function readPaintedSpriteSheet(
  result: TowersOfCorebornAgentChatResults,
  state: SpriteSheetGenerationState,
): { draft: SpriteSheetDraft; images: SpriteSheetImages } {
  const failedTool = result.toolErrors.find(
    (error) =>
      error.toolName === AgentTool.ConsultProductNow ||
      error.toolName === AgentTool.GenerateImage ||
      error.toolName === SUBMIT_SPRITE_SHEET_TOOL_ID,
  );
  if (failedTool !== undefined) {
    throw new InternalServerErrorException(
      `Sprite sheet generation failed: ${failedTool.errorMessage}`,
    );
  }
  const loreCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.ConsultProductNow,
  );
  if (loreCall === undefined) {
    throw new InternalServerErrorException(
      "Sprite sheet generation failed: the agent finished without consulting ProductNow.",
    );
  }
  if (state.draft === undefined) {
    throw new InternalServerErrorException(
      "Sprite sheet generation did not submit a character design.",
    );
  }
  const imageCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.GenerateImage,
  );
  if (imageCall === undefined) {
    throw new InternalServerErrorException(
      "Sprite sheet generation failed: the agent finished without calling generate-image.",
    );
  }
  return {
    draft: state.draft,
    images: readSpriteSheetImages(imageCall.result),
  };
}
