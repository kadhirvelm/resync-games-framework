import { type AgentExecutionOptionsBase, ToolsInput } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { FullOutput } from "@mastra/core/stream";
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { type AgentToolSelection } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import {
  PRODUCT_NOW_SESSION_REQUEST_KEY,
  readActiveProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import { z } from "zod";
import {
  GenerationCancelledException,
  isGenerationAbort,
} from "../agents/generationCancelled";
import { formatToolErrorMessage } from "./formatToolErrorMessage";
import { resolveSingleToolChat } from "./resolveSingleToolChat";
import {
  ResyncGameFrameworkAgent,
  ResyncGameFrameworkAgentConfig,
  StructuredOutputResult,
} from "./resyncGameFrameworkAgent";
import {
  MixedModelEntry,
  resolveModelConfig,
} from "./resyncGameFrameworkAgentModels";
import { ResyncGameFrameworkAgentToolRegistry } from "./resyncGameFrameworkAgentToolRegistry";

/**
 * Configuration settings for the ResyncGameFrameworkAgent that are not yet resolved.
 */
export type UnresolvedResyncGameFrameworkAgentConfig = Omit<
  ResyncGameFrameworkAgentConfig,
  "tools" | "model"
> & {
  model: MixedModelEntry | MixedModelEntry[];
};

/**
 * Input parameters for a non-streaming ResyncGameFrameworkAgent generate call.
 * @property agentConfig - Configuration settings for the ResyncGameFrameworkAgent instance.
 * @property tools - Tool ids or an agent tool enum. Omit or pass an empty list for no tools.
 * @property prompt - The user input or system prompt for the agent to process.
 */
export interface ResyncGameFrameworkAgentGenerateInput {
  /**
   * Configuration settings for the ResyncGameFrameworkAgent instance.
   */
  agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
  /**
   * Tool ids, or an enum of them declared on the agent. Omit or pass an empty list for no tools.
   */
  tools?: AgentToolSelection;
  /**
   * The user input or system prompt for the agent to process.
   */
  prompt: string;
}

/**
 * Input for a non-streaming generate call where the caller provides
 * pre-built tools directly (e.g. tools with per-call context baked in).
 * This bypasses the global tool registry.
 */
export interface ResyncGameFrameworkAgentGenerateWithToolsInput {
  /**
   * Configuration settings for the ResyncGameFrameworkAgent instance.
   */
  agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
  /**
   * The user input or system prompt for the agent to process.
   */
  prompt: string;
}

/**
 * Input parameters for a ResyncGameFrameworkAgent chat call.
 * @property agentConfig - Configuration settings for the ResyncGameFrameworkAgent instance.
 * @property prompt - The user input or system prompt for the agent to process.
 */
export interface ResyncGameFrameworkAgentChatInput {
  /** Stops the chat and its tools when the caller aborts the generation. */
  abortSignal?: AbortSignal;
  /**
   * Configuration settings for the ResyncGameFrameworkAgent instance.
   */
  agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
  /**
   * Tool ids, or an enum of them declared on the agent.
   */
  tools: AgentToolSelection;
  /**
   * The user input or system prompt for the agent to process.
   */
  prompt: string;
}

/**
 * Standard multi-tool asset-agent chat. Catalog tools are resolved here and
 * request-scoped tools are supplied by the caller.
 */
export interface AssetClassAgentChatInput {
  abortSignal?: AbortSignal;
  /** Stable id and display name of the Mastra agent */
  agentId: string;
  /** Registry tools this agent may call */
  catalogTools: AgentToolSelection;
  instructions: string;
  maxSteps: number;
  /** Tools that close over this request's mutable state or credentials */
  ownedTools?: ToolsInput;
  prompt: string;
  /** Overrides the standard ten-minute timeout for long plans */
  timeoutMs?: number;
  toolCallConcurrency?: number;
}

/**
 * A tool call that threw during a chat session. Mastra reports these to the
 * model as tool errors (so the model can apologize or retry) instead of
 * throwing, which means callers must inspect this list to detect failures.
 */
export interface ResyncGameFrameworkAgentToolError {
  /** Human-readable error message extracted from the thrown value */
  errorMessage: string;
  toolCallId: string;
  toolName: string;
}

/**
 * A tool call that completed successfully during a chat session.
 */
export interface ResyncGameFrameworkAgentToolResult {
  /** Arguments the model passed to the tool, when available */
  args?: unknown;
  /** The tool's returned value */
  result: unknown;
  toolCallId: string;
  toolName: string;
}

/**
 * The results returned from a full ResyncGameFrameworkAgent chat session.
 */
export interface ResyncGameFrameworkAgentChatResults {
  /**
   * Whether the chat was aborted.
   */
  aborted?: boolean;
  /**
   * The text that was generated by the agent.
   */
  text: string;
  /**
   * Tool calls that threw during the run, in order of occurrence.
   */
  toolErrors: ResyncGameFrameworkAgentToolError[];
  /**
   * Tool calls that completed successfully during the run, in order of occurrence.
   */
  toolResults: ResyncGameFrameworkAgentToolResult[];
}

/**
 * Input for a chat whose only job is to call one caller-owned tool.
 * Shared tools belong on {@link AgentTool} and are passed as an enum to
 * {@link ResyncGameFrameworkAgentService#runGenerationCoordinator}.
 * @property outputLabel - Human-readable name used in error messages, e.g. "Sprite sheet generation"
 * @property readToolOutput - Narrows the tool's raw result; throw when the shape is wrong
 */
export interface ResyncGameFrameworkAgentSingleToolChatInput<ToolOutput> {
  /** Stops the coordinator and its tool when the caller aborts the generation. */
  abortSignal?: AbortSignal;
  agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
  outputLabel: string;
  prompt: string;
  readToolOutput: (rawResult: unknown) => ToolOutput;
  tool: ToolsInput[string];
  toolId: string;
}

/**
 * Shared fields for an asset-class coordinator run.
 */
interface GenerationCoordinatorInput<ToolOutput> {
  /** Stops the coordinator and its tools when the caller aborts the generation. */
  abortSignal?: AbortSignal;
  /** Subagents this coordinator can delegate to, keyed by the name Mastra turns into `agent-<key>`. */
  agents?: ResyncGameFrameworkAgentConfig["agents"];
  agentId: string;
  instructions: string;
  model?: MixedModelEntry | MixedModelEntry[];
  outputLabel: string;
  prompt: string;
  readToolOutput: (rawResult: unknown) => ToolOutput;
  /** Steps for this run. Defaults to one tool call and a short reply. */
  maxSteps?: number;
  /** Other tools that must complete before the required output is accepted. */
  supportingToolIds?: string[];
  /** Tool whose result this run requires */
  toolId: string;
}

/**
 * Coordinator input that loads tools from the shared registry.
 */
export interface RegistryGenerationCoordinatorInput<ToolOutput>
  extends GenerationCoordinatorInput<ToolOutput> {
  /** Tool enum declared on the agent. The runner loads these from the registry. */
  tools: AgentToolSelection;
}

/**
 * Coordinator input for one tool the caller owns and that is not in the catalog.
 */
export interface OwnedToolGenerationCoordinatorInput<ToolOutput>
  extends GenerationCoordinatorInput<ToolOutput> {
  /**
   * Extra catalog tools loaded from the registry.
   * The owned tool is still the one `toolId` requires.
   */
  catalogTools?: AgentToolSelection;
  tool: ToolsInput[string];
}

/**
 * Result of a single-tool chat: the narrowed tool output and the agent's closing text.
 */
export interface ResyncGameFrameworkAgentSingleToolChatResult<ToolOutput> {
  text: string;
  toolOutput: ToolOutput;
}

/** The default timeout for a ResyncGameFrameworkAgent agent sessions */
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Coordinator model for asset-class agents. A class can pass a different model
 * to {@link ResyncGameFrameworkAgentService#runGenerationCoordinator}.
 */
export const ASSET_CLASS_COORDINATOR_MODEL = "openai/gpt-6-astra";

/** How many steps a generation coordinator gets: one tool call, then a short reply. */
const GENERATION_COORDINATOR_MAX_STEPS = 2;

type ResyncGameFrameworkAgentGenerateResult<T extends z.ZodType | null> =
  T extends z.ZodType<unknown>
    ? StructuredOutputResult<z.core.output<T>>
    : T extends null
      ? FullOutput<undefined>
      : never;

/**
 * Service for executing ResyncGameFrameworkAgent chat logic within a NestJS application.
 * Supports streaming responses (token-by-token) and logs progress using Nest's logger.
 */
@Injectable()
export class ResyncGameFrameworkAgentService {
  /**
   * Logger instance for debug output.
   */
  public logger = new Logger(ResyncGameFrameworkAgentService.name);

  public constructor(
    private readonly resyncGameFrameworkAgentToolRegistry: ResyncGameFrameworkAgentToolRegistry,
    public readonly configurationService: ConfigurationService,
  ) {}

  /**
   * Builds an agent with a resolved model and caller-supplied tools.
   * Use this when the tools are not in the shared registry, such as
   * ProductNow MCP tools loaded for one browser session.
   * @param config - Agent config, including tools the caller already built
   * @returns An agent ready to run or to pass to a coordinator as a subagent
   */
  public createAgent(
    config: UnresolvedResyncGameFrameworkAgentConfig & {
      tools?: ResyncGameFrameworkAgentConfig["tools"];
    },
  ): ResyncGameFrameworkAgent {
    return new ResyncGameFrameworkAgent({
      ...config,
      model: this.resolveModelConfigs(config.model),
    });
  }

  /**
   * Executes a non-streaming generate call with the ResyncGameFrameworkAgent.
   * Use this for pipeline agents that need structured or plain text output
   * without streaming. Tools (e.g. webSearch) can be injected via the
   * `tools` array without wiring them manually in the calling service.
   *
   * Returns a structured output result if a schema is provided, otherwise returns a full output.
   *
   * @param input - Generate call input parameters (agent config, prompt, optional tools).
   * @param options - Optional generate options forwarded to agent.generate() (e.g. structuredOutput, abortSignal).
   * @returns The raw result from agent.generate(), including text, object, and usage.
   */
  public async runGenerate<T extends z.ZodType | null>(
    input: ResyncGameFrameworkAgentGenerateInput,
    schema: T,
    options?: AgentExecutionOptionsBase<unknown>,
  ): Promise<ResyncGameFrameworkAgentGenerateResult<T>> {
    this.logger.debug(`Running ${input.agentConfig.name} agent`);

    const tools = this.resyncGameFrameworkAgentToolRegistry.buildTools(
      input.tools ?? [],
    );
    const resolvedModels = this.resolveModelConfigs(input.agentConfig.model);

    const agent = new ResyncGameFrameworkAgent({
      ...input.agentConfig,
      model: resolvedModels,
      tools,
    });

    const mergedOptions = this.buildExecutionOptionsWithTimeout(options);

    const result = await (async () => {
      if (schema != null) {
        return agent.generateStructured(input.prompt, schema, mergedOptions);
      }

      return agent.generate(input.prompt, mergedOptions);
    })();

    this.logger.debug(`${input.agentConfig.name} agent completed`);

    return result as ResyncGameFrameworkAgentGenerateResult<T>;
  }

  /**
   * Executes a chat session with the ResyncGameFrameworkAgent.
   * Consumes the agent's full event stream, accumulating generated text and
   * recording every tool result and tool error along the way.
   *
   * Tool exceptions do **not** reject this promise: Mastra feeds them back to the
   * model as `tool-error` events and the model typically answers with an apology.
   * Callers that require a tool to have succeeded must check `toolErrors` /
   * `toolResults` on the returned value.
   *
   * @param input - Chat session input parameters (agent config, tools, prompt).
   * @returns Generated text plus the tool results and tool errors observed during the run.
   */
  public async runChat(
    input: ResyncGameFrameworkAgentChatInput,
  ): Promise<ResyncGameFrameworkAgentChatResults> {
    return this.streamChat({
      abortSignal: input.abortSignal,
      agentConfig: input.agentConfig,
      prompt: input.prompt,
      tools: this.resyncGameFrameworkAgentToolRegistry.buildTools(input.tools),
    });
  }

  /**
   * Runs a chat with tools the caller already built.
   * Use this when a run needs catalog tools plus tools that close over
   * per-request context, such as a ProductNow session.
   * @param input - Agent config, prompt, and tools keyed by the id the model calls
   * @returns Generated text plus the tool results and tool errors observed during the run
   */
  public async runChatWithTools(input: {
    abortSignal?: AbortSignal;
    agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
    prompt: string;
    /** Overrides the standard ten-minute timeout for long multi-asset runs. */
    timeoutMs?: number;
    tools: ToolsInput;
  }): Promise<ResyncGameFrameworkAgentChatResults> {
    return this.streamChat(input);
  }

  /**
   * Runs a multi-tool asset agent with the standard coordinator model.
   * Agents name catalog tools and provide only their request-scoped tools;
   * registry access and config assembly stay inside this service.
   * @param input - Agent identity, prompt, catalog tools, and owned tools
   * @returns Generated text plus observed tool results and errors
   */
  public async runAssetClassAgentChat(
    input: AssetClassAgentChatInput,
  ): Promise<ResyncGameFrameworkAgentChatResults> {
    return this.streamChat({
      abortSignal: input.abortSignal,
      agentConfig: {
        id: input.agentId,
        instructions: input.instructions,
        maxSteps: input.maxSteps,
        model: [{ model: ASSET_CLASS_COORDINATOR_MODEL }],
        name: input.agentId,
        ...(input.toolCallConcurrency === undefined
          ? {}
          : { toolCallConcurrency: input.toolCallConcurrency }),
      },
      prompt: input.prompt,
      timeoutMs: input.timeoutMs,
      tools: {
        ...this.resyncGameFrameworkAgentToolRegistry.buildTools(
          input.catalogTools,
        ),
        ...(input.ownedTools ?? {}),
      },
    });
  }

  /**
   * Runs a coordinator agent that must call exactly one caller-owned tool.
   * Use this when the tool is not in the shared catalog. Catalog tools are
   * passed as an enum to {@link ResyncGameFrameworkAgentService#runGenerationCoordinator}.
   *
   * @param input - Agent config, prompt, the tool, and how to read its result
   * @returns The narrowed tool output and the agent's closing text
   * @throws InternalServerErrorException when the tool failed or was never called
   */
  public async runSingleToolChat<ToolOutput>(
    input: ResyncGameFrameworkAgentSingleToolChatInput<ToolOutput>,
  ): Promise<ResyncGameFrameworkAgentSingleToolChatResult<ToolOutput>> {
    const result = await this.streamChat({
      abortSignal: input.abortSignal,
      agentConfig: input.agentConfig,
      prompt: input.prompt,
      tools: { [input.toolId]: input.tool },
    });

    return resolveSingleToolChat({
      outputLabel: input.outputLabel,
      readToolOutput: input.readToolOutput,
      result,
      toolId: input.toolId,
    });
  }

  /**
   * Runs the standard asset-class coordinator: one model, two steps.
   * Pass the agent's tool enum as `tools`. This loads those tools from the
   * registry and requires a call to `toolId`. Pass `tool` instead only when
   * that tool is owned by the caller and is not in the catalog.
   * @param input - Agent id, instructions, prompt, tools, and how to read the required result
   * @returns The narrowed tool output and the agent's closing text
   * @throws InternalServerErrorException when the tool failed, was never called, or is not in the tools given to the agent
   */
  public async runGenerationCoordinator<ToolOutput>(
    input:
      | RegistryGenerationCoordinatorInput<ToolOutput>
      | OwnedToolGenerationCoordinatorInput<ToolOutput>,
  ): Promise<ResyncGameFrameworkAgentSingleToolChatResult<ToolOutput>> {
    const result = await this.streamChat({
      abortSignal: input.abortSignal,
      agentConfig: {
        ...(input.agents === undefined ? {} : { agents: input.agents }),
        id: input.agentId,
        instructions: input.instructions,
        maxSteps: input.maxSteps ?? GENERATION_COORDINATOR_MAX_STEPS,
        model: input.model ?? [{ model: ASSET_CLASS_COORDINATOR_MODEL }],
        name: input.agentId,
      },
      prompt: input.prompt,
      tools: this.coordinatorTools(input),
    });

    return resolveSingleToolChat({
      outputLabel: input.outputLabel,
      readToolOutput: input.readToolOutput,
      result,
      supportingToolIds: input.supportingToolIds,
      toolId: input.toolId,
    });
  }

  /**
   * Loads catalog tools, or wraps one caller-owned tool.
   * @param input - Coordinator input with either a tool enum or one owned tool
   * @returns Tools keyed by the id the model calls
   * @throws InternalServerErrorException when the required tool is not among the loaded tools
   */
  private coordinatorTools<ToolOutput>(
    input:
      | RegistryGenerationCoordinatorInput<ToolOutput>
      | OwnedToolGenerationCoordinatorInput<ToolOutput>,
  ): ToolsInput {
    if ("tool" in input) {
      const catalog =
        input.catalogTools === undefined
          ? {}
          : this.resyncGameFrameworkAgentToolRegistry.buildTools(
              input.catalogTools,
            );
      return { ...catalog, [input.toolId]: input.tool };
    }

    const tools = this.resyncGameFrameworkAgentToolRegistry.buildTools(
      input.tools,
    );
    if (tools[input.toolId] === undefined) {
      throw new InternalServerErrorException(
        `The ${input.toolId} tool is not included in the tools passed to ${input.agentId}.`,
      );
    }
    return tools;
  }

  /**
   * Streams one agent run with the given tools, recording text, tool results,
   * and tool errors.
   * @param input - Unresolved agent config, user prompt, and tools keyed by the name the model calls them with
   * @returns Generated text plus observed tool results and errors
   */
  private async streamChat(input: {
    abortSignal?: AbortSignal;
    agentConfig: UnresolvedResyncGameFrameworkAgentConfig;
    prompt: string;
    timeoutMs?: number;
    tools: ToolsInput;
  }): Promise<ResyncGameFrameworkAgentChatResults> {
    const { tools } = input;
    this.logger.debug(`Running ${input.agentConfig.name} agent`);

    // Accumulate the text as it is streamed from the agent.
    let accumulatedText = "";
    const toolErrors: ResyncGameFrameworkAgentToolError[] = [];
    const toolResults: ResyncGameFrameworkAgentToolResult[] = [];

    const resolvedModels = this.resolveModelConfigs(input.agentConfig.model);

    // Instantiate a new ResyncGameFrameworkAgent with the fully-resolved configuration.
    const agent = new ResyncGameFrameworkAgent({
      ...input.agentConfig,
      model: resolvedModels,
      tools,
    });

    // Asynchronously yield tokens from the agent as they become available.
    // Wrapped in try-catch to handle Mastra's DefaultSpan.error(undefined) bug: when the
    // model returns finishReason "error" (e.g. after exhausting maxSteps), Mastra's
    // onFinish callback tries to call span.error({ error: undefined }) which crashes on
    // undefined.message. We re-throw as a clean InternalServerErrorException.
    // Abort the stream if no completion arrives within the timeout. This prevents
    // a stalled LLM stream from leaving generatingBlueprints/generatingOutputs
    // stuck at true indefinitely — the AbortError propagates up to the caller's
    // catch block which pushes generating: false.
    const mergedOptions = this.buildExecutionOptionsWithTimeout(
      executionOptions(input.abortSignal, productNowRequestContext()),
      input.timeoutMs,
    );

    try {
      // Begin generating a streaming response based on the user/system prompt.
      const stream = await agent.stream(input.prompt, mergedOptions);

      for await (const chunk of stream.fullStream) {
        if (chunk.type === "text-delta") {
          accumulatedText += chunk.payload.text;
          continue;
        }

        if (chunk.type === "tool-result") {
          toolResults.push({
            args: chunk.payload.args,
            result: chunk.payload.result,
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
          });
          continue;
        }

        if (chunk.type === "tool-error") {
          const errorMessage = formatToolErrorMessage(chunk.payload.error);
          this.logger.error(
            `${input.agentConfig.name} agent tool ${chunk.payload.toolName} failed: ${errorMessage}`,
          );
          toolErrors.push({
            errorMessage,
            toolCallId: chunk.payload.toolCallId,
            toolName: chunk.payload.toolName,
          });
        }
      }

      // Retrieve the full output after the stream completes.
      const output = await stream.getFullOutput();

      this.logger.debug(`${input.agentConfig.name} agent completed`);

      if (input.abortSignal?.aborted) {
        throw new GenerationCancelledException();
      }

      if (
        (output.error != null || output.finishReason === "error") &&
        !hasToolActivity(toolResults, toolErrors)
      ) {
        throw new InternalServerErrorException(
          `Agent ${input.agentConfig.name} returned an error: ${formatStreamFailure(output.error, output.finishReason)}`,
        );
      }

      if (output.error != null || output.finishReason === "error") {
        this.logger.warn(
          `${input.agentConfig.name} ended with ${formatStreamFailure(output.error, output.finishReason)} after tool calls; keeping those results`,
        );
      }

      return chatResults(
        accumulatedText,
        output.finishReason === "tripwire",
        toolErrors,
        toolResults,
      );
    } catch (streamError) {
      if (isGenerationAbort(streamError, input.abortSignal)) {
        throw new GenerationCancelledException();
      }
      if (streamError instanceof HttpException) {
        throw streamError;
      }
      if (hasToolActivity(toolResults, toolErrors)) {
        this.logger.warn(
          `${input.agentConfig.name} stream ended after tool calls: ${formatStreamFailure(streamError)}; keeping those results`,
        );
        return chatResults(accumulatedText, false, toolErrors, toolResults);
      }
      throw new InternalServerErrorException(
        `Agent ${input.agentConfig.name} stream failed: ${formatStreamFailure(streamError)}`,
      );
    }
  }

  /**
   * Builds agent execution options with a default session timeout. If the caller
   * passes an `abortSignal` via Mastra options, it is combined with the timeout
   * via `AbortSignal.any` so either can abort the run.
   * @param options - Optional options forwarded to generate/stream
   * @param timeoutMs - Session timeout in milliseconds
   * @returns Options with `abortSignal` set
   */
  private buildExecutionOptionsWithTimeout(
    options?: AgentExecutionOptionsBase<unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): AgentExecutionOptionsBase<unknown> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (options == null) {
      return { abortSignal: timeoutSignal };
    }

    const withSignal = options as { abortSignal?: AbortSignal };
    if (withSignal.abortSignal != null) {
      return {
        ...options,
        abortSignal: AbortSignal.any([timeoutSignal, withSignal.abortSignal]),
      };
    }

    return { ...options, abortSignal: timeoutSignal };
  }

  /**
   * Resolves the model configs for the ResyncGameFrameworkAgent.
   * @param models - The model configs to resolve.
   * @returns The resolved model configs.
   */
  protected resolveModelConfigs(models: MixedModelEntry | MixedModelEntry[]) {
    const geminiCredentials =
      this.configurationService.get("GEMINI_CREDENTIALS");
    return resolveModelConfig(models, geminiCredentials);
  }
}

/**
 * Combines the caller's abort signal with the ProductNow session, when either is set.
 * Subagents read the session from the request context.
 * @param abortSignal - Signal that stops this run
 * @param requestContext - ProductNow session for this run, when the browser is connected
 * @returns Mastra execution options, or `undefined` when there is nothing to forward
 */
function executionOptions(
  abortSignal: AbortSignal | undefined,
  requestContext: RequestContext | undefined,
): AgentExecutionOptionsBase<unknown> | undefined {
  if (abortSignal === undefined && requestContext === undefined) {
    return undefined;
  }
  return {
    ...(abortSignal === undefined ? {} : { abortSignal }),
    ...(requestContext === undefined ? {} : { requestContext }),
  };
}

/**
 * @returns A request context carrying the browser's ProductNow session
 */
function productNowRequestContext(): RequestContext | undefined {
  const sessionId = readActiveProductNowSession();
  if (sessionId === undefined || sessionId === "") {
    return undefined;
  }
  const requestContext = new RequestContext();
  requestContext.setRaw(PRODUCT_NOW_SESSION_REQUEST_KEY, sessionId);
  return requestContext;
}

/**
 * @param toolResults - Tool calls that returned
 * @param toolErrors - Tool calls that threw
 * @returns Whether the run already did tool work worth keeping
 */
function hasToolActivity(
  toolResults: ResyncGameFrameworkAgentToolResult[],
  toolErrors: ResyncGameFrameworkAgentToolError[],
): boolean {
  return toolResults.length > 0 || toolErrors.length > 0;
}

/**
 * @param text - Text streamed before the run ended
 * @param aborted - Whether Mastra marked the run as a tripwire
 * @param toolErrors - Tool calls that threw
 * @param toolResults - Tool calls that returned
 * @returns The chat result callers already know how to inspect
 */
function chatResults(
  text: string,
  aborted: boolean,
  toolErrors: ResyncGameFrameworkAgentToolError[],
  toolResults: ResyncGameFrameworkAgentToolResult[],
): ResyncGameFrameworkAgentChatResults {
  return { aborted, text, toolErrors, toolResults };
}

/**
 * @param error - Finish payload or thrown stream error
 * @param finishReason - Mastra finish reason, when the stream completed
 * @returns A single-line description
 */
function formatStreamFailure(error: unknown, finishReason?: string): string {
  const message = formatToolErrorMessage(error);
  if (finishReason === undefined || finishReason === "") {
    return message;
  }
  if (message === "" || message === "undefined" || message === "null") {
    return finishReason;
  }
  return `${finishReason}: ${message}`;
}
