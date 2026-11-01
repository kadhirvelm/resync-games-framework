import { Injectable } from "@nestjs/common";
import { AgentTool } from "@towers-of-coreborn/api";
import { BATTLE_BACKGROUND_AGENT_INSTRUCTIONS } from "src/asset-classes/battle-background/battleBackgroundPrompt";
import { BattleBackgroundToolService } from "src/asset-classes/battle-background/battleBackgroundTool.service";
import { readBattleBackgroundImage } from "src/asset-classes/battle-background/readBattleBackgroundImage";
import { TowersOfCorebornAgentService } from "src/mastra/shared/towersOfCorebornAgent.service";
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
export enum BattleBackgroundAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/** Consult ProductNow, then paint. Four steps covers both calls and a reply. */
const BATTLE_BACKGROUND_COORDINATOR_STEPS = 4;

/** Input for one battle-background query. */
export interface BattleBackgroundInput {
  /** Client id used to stop this run */
  generationId: string;
  /** Natural-language description of the battle room */
  prompt: string;
}

/** Result of one battle-background query. */
export interface BattleBackgroundResult {
  /** Folder name of the stored background */
  id: string;
  /** The coordinator agent's closing text */
  summary: string;
}

/**
 * Battle-background agent. Call {@link BattleBackgroundAgent.query} with a
 * room description. It passes {@link BattleBackgroundAgentTool} to the agent
 * runner, which loads `consult-productnow` and `generate-image`.
 * `consult-productnow` runs the ProductNow research subagent. The model checks
 * how the Spire or the Reach is set up, then paints one room.
 */
@Injectable()
export class BattleBackgroundAgent
  implements QueryableAgent<BattleBackgroundInput, BattleBackgroundResult>
{
  public constructor(
    private readonly agents: TowersOfCorebornAgentService,
    private readonly toolService: BattleBackgroundToolService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight background generation on whichever process is running it.
   * @param generationId - Id passed to {@link BattleBackgroundAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates and stores one battle-room background.
   * @param input - User's room description and the id that can stop it
   * @returns Stored background id and coordinator summary
   * @throws GenerationCancelledException when the run is stopped
   * @throws InternalServerErrorException when the tool failed, was never called, or returned an unusable image
   */
  public async query(
    input: BattleBackgroundInput,
  ): Promise<BattleBackgroundResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      let toolOutput: unknown;
      try {
        const result = await this.agents.runGenerationCoordinator({
          abortSignal: signal,
          agentId: "battle-background-generation-agent",
          instructions: BATTLE_BACKGROUND_AGENT_INSTRUCTIONS,
          maxSteps: BATTLE_BACKGROUND_COORDINATOR_STEPS,
          outputLabel: "Battle background generation",
          prompt: input.prompt,
          readToolOutput: (raw) => raw,
          supportingToolIds: [BattleBackgroundAgentTool.ConsultProductNow],
          toolId: BattleBackgroundAgentTool.GenerateImage,
          tools: BattleBackgroundAgentTool,
        });
        toolOutput = result.toolOutput;
        throwIfAborted(signal);
        const background = readBattleBackgroundImage(toolOutput);
        const saved = await this.toolService.saveGeneratedBackground({
          id: input.generationId,
          image: background.image,
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
