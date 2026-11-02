import { InternalServerErrorException } from "@nestjs/common";
import type {
  ResyncGameFrameworkAgentChatResults,
  ResyncGameFrameworkAgentSingleToolChatResult,
} from "./resyncGameFrameworkAgent.service";

/**
 * Input for deciding whether a single-tool agent run succeeded.
 * @property outputLabel - Human-readable name used in error messages
 * @property readToolOutput - Narrows the tool's raw result; throw when the shape is wrong
 * @property result - Text, tool results, and tool errors observed during the run
 * @property supportingToolIds - Other tools that must complete successfully
 * @property toolId - Tool the agent was required to call
 */
export interface ResolveSingleToolChatInput<ToolOutput> {
  outputLabel: string;
  readToolOutput: (rawResult: unknown) => ToolOutput;
  result: Pick<
    ResyncGameFrameworkAgentChatResults,
    "text" | "toolErrors" | "toolResults"
  >;
  supportingToolIds?: string[];
  toolId: string;
}

/**
 * Turns a finished agent run into the one tool result the caller asked for.
 * A tool error wins over a later success, because Mastra keeps going after a
 * tool throws and the model may answer as if the run worked.
 * @param input - The run to interpret
 * @returns The narrowed tool output and the agent's closing text
 * @throws InternalServerErrorException when the tool failed or was never called
 */
export function resolveSingleToolChat<ToolOutput>(
  input: ResolveSingleToolChatInput<ToolOutput>,
): ResyncGameFrameworkAgentSingleToolChatResult<ToolOutput> {
  for (const supportingToolId of input.supportingToolIds ?? []) {
    requireSuccessfulTool(input, supportingToolId);
  }

  const toolError = input.result.toolErrors.find(
    (error) => error.toolName === input.toolId,
  );
  if (toolError !== undefined) {
    throw new InternalServerErrorException(
      `${input.outputLabel} failed: ${toolError.errorMessage}`,
    );
  }

  const toolResult = input.result.toolResults.find(
    (toolCall) => toolCall.toolName === input.toolId,
  );
  if (toolResult === undefined) {
    throw new InternalServerErrorException(
      `${input.outputLabel} failed: the agent finished without calling ${input.toolId}.${describeAgentText(input.result.text)}`,
    );
  }

  return {
    text: input.result.text,
    toolOutput: input.readToolOutput(toolResult.result),
  };
}

/**
 * Requires a supporting tool to have returned without an earlier error.
 * @param input - Finished agent run and its human-readable output label
 * @param toolId - Supporting tool that must have completed
 */
function requireSuccessfulTool<ToolOutput>(
  input: ResolveSingleToolChatInput<ToolOutput>,
  toolId: string,
): void {
  const toolError = input.result.toolErrors.find(
    (error) => error.toolName === toolId,
  );
  if (toolError !== undefined) {
    throw new InternalServerErrorException(
      `${input.outputLabel} failed in ${toolId}: ${toolError.errorMessage}`,
    );
  }
  const toolResult = input.result.toolResults.find(
    (result) => result.toolName === toolId,
  );
  if (toolResult === undefined) {
    throw new InternalServerErrorException(
      `${input.outputLabel} failed: the agent finished without calling ${toolId}.${describeAgentText(input.result.text)}`,
    );
  }
}

/**
 * Formats the agent's closing text for inclusion in an error message.
 * @param text - Text the agent produced during the run
 * @returns A suffix such as ` Agent said: "…"`, or an empty string when there is no text
 */
function describeAgentText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  return ` Agent said: "${trimmed}"`;
}
