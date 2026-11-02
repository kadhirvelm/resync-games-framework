import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { AgentTool } from "@resync-game-framework/api";
import { ENEMY_AGENT_INSTRUCTIONS } from "src/asset-classes/enemy/enemyPrompt";
import { EnemyToolService } from "src/asset-classes/enemy/enemyTool.service";
import {
  createEnemyTools,
  type EnemyGenerationState,
  SUBMIT_ENEMY_TOOL_ID,
} from "src/asset-classes/enemy/enemyTools";
import { readEnemyImage } from "src/asset-classes/enemy/readEnemyImage";
import {
  type ResyncGameFrameworkAgentChatResults,
  ResyncGameFrameworkAgentService,
} from "src/mastra/shared/resyncGameFrameworkAgent.service";
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
export enum EnemyAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/** Lore consult, submission, image generation, and closing response. */
const ENEMY_COORDINATOR_STEPS = 6;

/** Input for one enemy query. */
export interface EnemyInput {
  /** Client id used to stop this run */
  generationId: string;
  /** Natural-language description of the enemy */
  prompt: string;
}

/** Result of one enemy query. */
export interface EnemyResult {
  /** Folder name of the stored enemy */
  id: string;
  /** The coordinator agent's closing text */
  summary: string;
}

/**
 * Enemy agent. Call {@link EnemyAgent.query} with a creature description.
 * It passes {@link EnemyAgentTool} to the agent runner, which loads
 * `consult-productnow` and `generate-image`. The model checks the Lore
 * document, then paints one creature facing the player.
 */
@Injectable()
export class EnemyAgent implements QueryableAgent<EnemyInput, EnemyResult> {
  public constructor(
    private readonly agents: ResyncGameFrameworkAgentService,
    private readonly toolService: EnemyToolService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight enemy generation on whichever process is running it.
   * @param generationId - Id passed to {@link EnemyAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates and stores one enemy portrait.
   * @param input - User's creature description and the id that can stop it
   * @returns Stored enemy id and coordinator summary
   * @throws GenerationCancelledException when the run is stopped
   * @throws InternalServerErrorException when the tool failed, was never called, or returned an unusable image
   */
  public async query(input: EnemyInput): Promise<EnemyResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      const state: EnemyGenerationState = {};
      let imagePaths: string[] = [];
      try {
        const result = await this.agents.runAssetClassAgentChat({
          abortSignal: signal,
          agentId: "enemy-generation-agent",
          catalogTools: EnemyAgentTool,
          instructions: ENEMY_AGENT_INSTRUCTIONS,
          maxSteps: ENEMY_COORDINATOR_STEPS,
          ownedTools: createEnemyTools(state, signal),
          prompt: input.prompt,
        });
        imagePaths = result.toolResults.flatMap((call) =>
          collectImageFilePaths(call.result),
        );
        throwIfAborted(signal);
        const enemy = readPaintedEnemy(result, state);
        const saved = await this.toolService.saveGeneratedEnemy({
          draft: enemy.draft,
          id: input.generationId,
          image: enemy.image,
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
 * Requires a submitted enemy draft and one successful image call.
 * @param result - Tool calls observed during the agent run
 * @param state - Draft captured by submit-enemy
 * @returns The accepted draft and generated portrait
 */
function readPaintedEnemy(
  result: ResyncGameFrameworkAgentChatResults,
  state: EnemyGenerationState,
) {
  const failedTool = result.toolErrors.find(
    (error) =>
      error.toolName === AgentTool.ConsultProductNow ||
      error.toolName === AgentTool.GenerateImage ||
      error.toolName === SUBMIT_ENEMY_TOOL_ID,
  );
  if (failedTool !== undefined) {
    throw new InternalServerErrorException(
      `Enemy generation failed: ${failedTool.errorMessage}`,
    );
  }
  const loreCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.ConsultProductNow,
  );
  if (loreCall === undefined) {
    throw new InternalServerErrorException(
      "Enemy generation failed: the agent finished without consulting ProductNow.",
    );
  }
  if (state.draft === undefined) {
    throw new InternalServerErrorException(
      "Enemy generation did not submit enemy stats.",
    );
  }
  const imageCall = result.toolResults.find(
    (call) => call.toolName === AgentTool.GenerateImage,
  );
  if (imageCall === undefined) {
    throw new InternalServerErrorException(
      "Enemy generation failed: the agent finished without calling generate-image.",
    );
  }
  return {
    draft: state.draft,
    image: readEnemyImage(imageCall.result).image,
  };
}
