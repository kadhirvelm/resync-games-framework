import { ToolsInput } from "@mastra/core/agent";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  AgentTool,
  type AgentToolSelection,
  type ToolId,
} from "@towers-of-coreborn/api";
import { ConsultProductNowAgent } from "../agents/consult-productnow/consultProductNowAgent";
import { GenerateAudioToolService } from "../tools/generateAudioTool.service";
import { GenerateImageToolService } from "../tools/generateImageTool.service";
import { GenerateThreeDModelToolService } from "../tools/generateThreeDModelTool.service";
import { RecordProductNowLoreToolService } from "../tools/recordProductNowLoreTool.service";

type ToolRegistry = {
  [toolId in ToolId]: ToolsInput[string];
};

/**
 * Catalog of tools a Towers of Coreborn agent can be given.
 *
 * Add the id to {@link AgentTool}, then register the implementation in
 * {@link TowersOfCorebornAgentToolRegistry.buildToolRegistry}. An agent
 * declares its own enum of the {@link AgentTool} members it calls and passes
 * that enum to the agent runner. The runner loads them with
 * {@link TowersOfCorebornAgentToolRegistry.buildTools}.
 */
@Injectable()
export class TowersOfCorebornAgentToolRegistry {
  public constructor(
    private readonly consultProductNowAgent: ConsultProductNowAgent,
    private readonly generateImageToolService: GenerateImageToolService,
    private readonly generateThreeDModelToolService: GenerateThreeDModelToolService,
    private readonly recordProductNowLoreToolService: RecordProductNowLoreToolService,
    private readonly generateAudioToolService: GenerateAudioToolService,
  ) {}

  /**
   * Resolves a tool list or an agent tool enum into Mastra tools.
   * @param tools - {@link AgentTool} members, or an enum whose values are those members. An empty list gives the agent no tools.
   * @returns Tools keyed by the id the model calls
   * @throws InternalServerErrorException when an id is missing from the catalog
   */
  public buildTools(tools: AgentToolSelection): ToolsInput {
    const toolRegistry = this.buildToolRegistry();
    const toolIds = listToolIds(tools);

    return Object.fromEntries(
      toolIds.map((toolId) => {
        const tool = toolRegistry[toolId];
        if (tool === undefined) {
          throw new InternalServerErrorException(
            `No tool is registered for ${toolId}.`,
          );
        }
        return [toolId, tool] as const;
      }),
    );
  }

  /**
   * The full tool catalog. Every {@link ToolId} has one entry.
   * @returns Tools keyed by id
   */
  private buildToolRegistry(): ToolRegistry {
    return {
      [AgentTool.GenerateThreeDModel]:
        this.generateThreeDModelToolService.createTool(),
      [AgentTool.ConsultProductNow]: this.consultProductNowAgent.createTool(),
      [AgentTool.GenerateAudio]: this.generateAudioToolService.createTool(),
      [AgentTool.GenerateImage]: this.generateImageToolService.createTool(),
      [AgentTool.RecordProductNowLore]:
        this.recordProductNowLoreToolService.createTool(),
    };
  }
}

/**
 * Reads tool ids from a list or from an agent tool enum.
 * String enums that point at {@link AgentTool} also store a reverse mapping
 * from the id back to the member name. Those entries are not tool ids.
 * @param tools - A list of tool ids, or an enum of them
 * @returns The ids in declaration order
 * @throws InternalServerErrorException when a value is not an {@link AgentTool} member
 */
function listToolIds(tools: AgentToolSelection): ToolId[] {
  if (Array.isArray(tools)) {
    return tools.map(requireToolId);
  }

  const ids: ToolId[] = [];
  for (const [memberName, value] of Object.entries(tools)) {
    if (isToolId(value)) {
      ids.push(value);
      continue;
    }
    if (Object.keys(tools).includes(value)) {
      continue;
    }
    throw new InternalServerErrorException(
      `No tool is registered for ${memberName}.`,
    );
  }
  return ids;
}

/**
 * @param value - Candidate tool id from a list
 * @returns The id when the catalog defines it
 * @throws InternalServerErrorException when the catalog does not define it
 */
function requireToolId(value: string): ToolId {
  if (!isToolId(value)) {
    throw new InternalServerErrorException(
      `No tool is registered for ${value}.`,
    );
  }
  return value;
}

/**
 * @param value - Candidate tool id from a list or an agent enum
 * @returns Whether the catalog defines that id
 */
function isToolId(value: string): value is ToolId {
  return Object.values(AgentTool).some((toolId) => toolId === value);
}
