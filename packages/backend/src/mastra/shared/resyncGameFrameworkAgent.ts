import {
  type AgentConfig,
  AgentExecutionOptionsBase,
  Agent as MastraAgent,
} from "@mastra/core/agent";
import { Logger } from "@nestjs/common";
import { z } from "zod";
import { mastraInstance } from "./mastraInstance";

/**
 * Single model entry from Mastra's model config array.
 * Extracted from AgentConfig["model"] which is `MastraModelConfig | DynamicModel | SingleModelConfig[]`.
 */
type SingleModelConfig = Extract<AgentConfig["model"], Array<unknown>>[number];

/**
 * Result of a structured output generation call.
 */
export interface StructuredOutputResult<T> {
  /** The validated structured output object */
  object: T;
  /**
   * Mastra step history from the underlying generate call, when present.
   * Used by callers that need tool-result metadata (e.g. harvesting URLs) alongside structured output.
   */
  steps?: unknown[];
}

/**
 * Configuration struct for initializing a ResyncGameFrameworkAgent.
 *
 * @property id - Unique agent ID (should be globally unique within the system)
 * @property instructions - System prompt/instructions given to the agent
 * @property model - (Optional) One or more model configs; defaults to DEFAULT_MODEL_CONFIG if omitted.
 *   Accepts standard Mastra model configs, {@link GeminiModelConfig} entries, or mixed arrays
 *   containing both. Gemini entries are resolved by the service layer before the agent is created.
 * @property name - Human-readable name for the agent
 */
export interface ResyncGameFrameworkAgentConfig {
  /**
   * Unique agent ID (should be globally unique within the system)
   */
  id: string;
  /**
   * System prompt/instructions given to the agent
   */
  instructions: string;
  /**
   * Maximum number of reasoning steps to allow in a generated agent run
   */
  maxSteps?: number;
  /**
   * (Optional) One or more model configs; defaults to DEFAULT_MODEL_CONFIG if omitted.
   *
   * Accepts any value that Mastra's `AgentConfig["model"]` accepts, **plus**
   * {@link GeminiModelConfig} objects or mixed arrays containing both Gemini and
   * standard model entries (e.g. Anthropic primary with Gemini fallback).
   * Gemini entries are resolved into Vertex AI SDK language-model instances by
   * `ResyncGameFrameworkAgentService` before the agent is constructed.
   */
  model: AgentConfig["model"];
  /**
   * Human-readable name for the agent
   */
  name: string;
  /**
   * Shown to a coordinator as the description of this subagent's delegation tool.
   */
  description?: string;
  /**
   * Subagents this agent can delegate to.
   * Mastra exposes each one as a tool named `agent-<key>`.
   */
  agents?: AgentConfig["agents"];
  /**
   * Maximum number of tool calls to execute concurrently within a single step.
   * Defaults to Mastra's built-in default (10).
   */
  toolCallConcurrency?: number;
  /**
   * Tools that the agent can use
   */
  tools?: AgentConfig["tools"];
}

const GLOBAL_AGENT_INSTRUCTIONS = () =>
  `Today's date is ${new Date().toISOString()}`;

/**
 * Thin wrapper around Mastra's Agent that applies project-wide defaults.
 *
 * Expects a fully-resolved `model` field (no {@link GeminiModelConfig} entries).
 * Resolution of Gemini configs is handled by `ResyncGameFrameworkAgentService` before
 * this class is instantiated.
 *
 * Note: We extend MastraAgent directly so all typed overloads (generate, stream, etc.)
 * are inherited without re-wrapping.
 */
export class ResyncGameFrameworkAgent extends MastraAgent {
  private static readonly structuredOutputLogger = new Logger(
    "ResyncGameFrameworkAgent.generateStructured",
  );

  /** Original config for creating single-model retry agents. */
  private readonly agentConfig: ResyncGameFrameworkAgentConfig;

  /** Parsed model configs array for structured output retry loop. */
  private readonly modelConfigs: SingleModelConfig[];

  public constructor(config: ResyncGameFrameworkAgentConfig) {
    const defaultOptions: Record<string, unknown> = {};
    if (config.maxSteps) defaultOptions.maxSteps = config.maxSteps;
    if (config.toolCallConcurrency)
      defaultOptions.toolCallConcurrency = config.toolCallConcurrency;

    super({
      ...(Object.keys(defaultOptions).length > 0 && { defaultOptions }),
      agents: config.agents,
      description: config.description,
      id: config.id,
      instructions: `${GLOBAL_AGENT_INSTRUCTIONS()} ${config.instructions}`,
      model: config.model,
      name: config.name,
      tools: config.tools,
    });

    this.__registerMastra(mastraInstance);

    this.agentConfig = config;
    this.modelConfigs = Array.isArray(config.model)
      ? config.model
      : [{ maxRetries: 0, model: config.model } as SingleModelConfig];
  }

  /**
   * Generates structured output with retry and model fallback for validation errors.
   * Mastra's built-in retry only covers API errors (network, rate limits). Structured
   * output schema validation happens after the stream completes and bypasses the retry
   * loop. This method fills that gap by retrying validation failures using the same
   * per-model maxRetries policy from the model config.
   *
   * @param prompt - The user prompt to send to the model
   * @param schema - Zod schema to validate the output against
   * @returns Validated structured output object and usage metrics
   * @throws Error if all models and retries are exhausted, or on non-validation errors
   */
  public async generateStructured<T extends z.ZodType>(
    prompt: Parameters<ResyncGameFrameworkAgent["generate"]>[0],
    schema: T,
    options?: AgentExecutionOptionsBase<unknown>,
  ): Promise<StructuredOutputResult<z.infer<T>>> {
    const logger = ResyncGameFrameworkAgent.structuredOutputLogger;
    let lastError: Error | undefined;

    for (const modelConfig of this.modelConfigs) {
      if (modelConfig.enabled === false) continue;

      const maxRetries = modelConfig.maxRetries ?? 0;
      const modelId =
        modelConfig.id ??
        (typeof modelConfig.model === "string" ? modelConfig.model : "unknown");

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const singleModelAgent = new ResyncGameFrameworkAgent({
            ...this.agentConfig,
            model: [modelConfig],
          });

          const result = await singleModelAgent.generate(prompt, {
            ...options,
            structuredOutput: { schema },
          });

          const rawResult = result as Record<string, unknown>;
          const object = rawResult.object as z.infer<T>;

          if (!object) {
            throw new Error(
              "Structured output generation returned null object",
            );
          }

          if (attempt > 0) {
            logger.log(
              `Structured output succeeded on model ${modelId} attempt ${attempt + 1}/${maxRetries + 1}`,
            );
          }

          return {
            object,
            steps: Array.isArray(rawResult.steps) ? rawResult.steps : undefined,
          };
        } catch (error) {
          if (
            !ResyncGameFrameworkAgent.isStructuredOutputValidationError(error)
          ) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error(
              `Non-recoverable error from model ${modelId} ` +
                `(attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`,
            );
            throw error;
          }

          lastError = error instanceof Error ? error : new Error(String(error));

          logger.warn(
            `Structured output validation failed for model ${modelId} ` +
              `(attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`,
          );

          if (attempt < maxRetries) {
            const delayMs = Math.min(1000 * 2 ** attempt, 10000);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      logger.warn(
        `Model ${modelId} exhausted ${maxRetries + 1} attempts for structured output, trying next model`,
      );
    }

    throw new Error(
      `All models and retries exhausted for structured output generation. Last error: ${lastError?.message}`,
    );
  }

  /**
   * Checks whether an error is a Mastra structured output validation failure.
   * Handles both direct errors (id = STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED)
   * and wrapped errors (AGENT_GENERATE_FAILED with validation error as cause).
   */
  private static isStructuredOutputValidationError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const mastraError = error as { id?: string; cause?: unknown };
    if (mastraError.id === "STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED") {
      return true;
    }

    if (mastraError.cause) {
      return ResyncGameFrameworkAgent.isStructuredOutputValidationError(
        mastraError.cause,
      );
    }

    return false;
  }
}
