import { Injectable } from "@nestjs/common";
import { AgentTool } from "@towers-of-coreborn/api";
import { CardCharacterPromptRenderer } from "src/asset-classes/card-character/cardCharacterPromptRenderer";
import { CardCharacterToolService } from "src/asset-classes/card-character/cardCharacterTool.service";
import { readCardCharacterImageSet } from "src/asset-classes/card-character/readCardCharacterImageSet";
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
export enum CardCharacterAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateImage = AgentTool.GenerateImage,
}

/** Consult ProductNow, then paint. Four steps covers both calls and a reply. */
const CARD_CHARACTER_COORDINATOR_STEPS = 4;

/**
 * Input for one card-character query.
 */
export interface CardCharacterInput {
  /** Client id used to stop this run */
  generationId: string;
  /** Natural-language description of the character */
  prompt: string;
}

/**
 * Result of one card-character query.
 */
export interface CardCharacterResult {
  /** Folder name of the saved set under the card-character storage root */
  setId: string;
  /** The coordinator agent's closing text */
  summary: string;
}

/**
 * Card-character agent. Call {@link CardCharacterAgent.query} with a
 * character description. It passes {@link CardCharacterAgentTool} to the
 * agent runner, which loads `consult-productnow` and `generate-image`.
 * `consult-productnow` reads the Lore document. The model uses that answer,
 * then `generate-image` calls Gemini or OpenAI and paints four portraits,
 * weakest to strongest.
 *
 * @example
 * ```typescript
 * const result = await cardCharacterAgent.query({
 *   generationId,
 *   prompt: "a soot-covered inventor who builds clockwork wings",
 * });
 * result.setId;
 * ```
 */
@Injectable()
export class CardCharacterAgent
  implements QueryableAgent<CardCharacterInput, CardCharacterResult>
{
  public constructor(
    private readonly agents: TowersOfCorebornAgentService,
    private readonly cardCharacterToolService: CardCharacterToolService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight character generation on whichever process is running it.
   * @param generationId - Id passed to {@link CardCharacterAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates four portraits of one character, weakest to strongest.
   * @param input - User description of the character and the id that can stop it
   * @returns The saved set id and the agent's closing text
   * @throws GenerationCancelledException when the run is stopped
   * @throws InternalServerErrorException when the tool failed, was never called, or returned an unusable set
   */
  public async query(input: CardCharacterInput): Promise<CardCharacterResult> {
    return this.generationAbort.run(input.generationId, async (signal) => {
      let toolOutput: unknown;
      try {
        const result = await this.agents.runGenerationCoordinator({
          abortSignal: signal,
          agentId: "card-character-generation-agent",
          instructions:
            new CardCharacterPromptRenderer().renderCardCharacterPrompt(input),
          maxSteps: CARD_CHARACTER_COORDINATOR_STEPS,
          outputLabel: "Card character generation",
          prompt: input.prompt,
          readToolOutput: (raw) => raw,
          supportingToolIds: [CardCharacterAgentTool.ConsultProductNow],
          toolId: CardCharacterAgentTool.GenerateImage,
          tools: CardCharacterAgentTool,
        });
        toolOutput = result.toolOutput;
        throwIfAborted(signal);
        const portraits = readCardCharacterImageSet(toolOutput);
        const saved =
          await this.cardCharacterToolService.saveGeneratedPortraits({
            portraits,
            setId: input.generationId,
            sourcePrompt: input.prompt,
          });
        return { setId: saved.setId, summary: result.text };
      } catch (error) {
        await deleteImageFiles(collectImageFilePaths(toolOutput));
        throw error;
      }
    });
  }
}
