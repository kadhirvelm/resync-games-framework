import { Injectable } from "@nestjs/common";
import { AgentTool } from "@resync-game-framework/api";
import { readStaticImageResult } from "src/asset-classes/static-image/readStaticImageResult";
import { STATIC_IMAGE_AGENT_INSTRUCTIONS } from "src/asset-classes/static-image/staticImagePrompt";
import { StaticImageToolService } from "src/asset-classes/static-image/staticImageTool.service";
import { ResyncGameFrameworkAgentService } from "src/mastra/shared/resyncGameFrameworkAgent.service";
import {
  collectImageFilePaths,
  deleteImageFiles,
} from "src/mastra/tools/generateImageTool.service";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { throwIfAborted } from "../generationCancelled";
import type { QueryableAgent } from "../queryableAgent";

/** Shared tools available to the standalone-image agent. */
export enum StaticImageAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/** One tool call plus the coordinator's closing response. */
const STATIC_IMAGE_COORDINATOR_STEPS = 3;

/** Input for one static-image query. */
export interface StaticImageInput {
  /** Client id used to stop this run. */
  generationId: string;
  /** Natural-language image request. */
  prompt: string;
}

/** Result of one static-image query. */
export interface StaticImageAgentResult {
  /** Folder name of the stored image. */
  id: string;
  /** Coordinator closing text. */
  summary: string;
}

/** Generates one generic 2D image through the shared image tool. */
@Injectable()
export class StaticImageAgent
  implements QueryableAgent<StaticImageInput, StaticImageAgentResult>
{
  public constructor(
    private readonly agents: ResyncGameFrameworkAgentService,
    private readonly toolService: StaticImageToolService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops one distributed image run.
   * @param generationId - Id passed to query
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates and stores one standalone image.
   * @param input - Image request and stable generation id
   * @returns Stored image id and coordinator summary
   */
  public async query(input: StaticImageInput): Promise<StaticImageAgentResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      let toolOutput: unknown;
      try {
        const result = await this.agents.runGenerationCoordinator({
          abortSignal: signal,
          agentId: "static-image-generation-agent",
          instructions: STATIC_IMAGE_AGENT_INSTRUCTIONS,
          maxSteps: STATIC_IMAGE_COORDINATOR_STEPS,
          outputLabel: "Static image generation",
          prompt: input.prompt,
          readToolOutput: (raw) => raw,
          supportingToolIds: [],
          toolId: StaticImageAgentTool.GenerateImage,
          tools: StaticImageAgentTool,
        });
        toolOutput = result.toolOutput;
        throwIfAborted(signal);
        const image = readStaticImageResult(toolOutput);
        const saved = await this.toolService.saveGeneratedImage({
          aspectRatio: image.aspectRatio,
          id: input.generationId,
          image: image.image,
          imageSize: image.imageSize,
          sourcePrompt: input.prompt,
        });
        return { id: saved.id, summary: result.text };
      } catch (error) {
        await deleteImageFiles(collectImageFilePaths(toolOutput));
        throw error;
      }
    });
  }
}
