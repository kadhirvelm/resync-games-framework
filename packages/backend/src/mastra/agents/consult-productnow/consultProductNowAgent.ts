import type { ToolsInput } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { AgentTool, type ProductNowMcpTool } from "@towers-of-coreborn/api";
import {
  CARD_GAME_FOLDER_ID,
  LORE_DOCUMENT_ID,
} from "src/asset-classes/playable-card/playableCardSpec";
import { ConfigurationService } from "src/configuration/configuration.service";
import { TowersOfCorebornAgent } from "src/mastra/shared/towersOfCorebornAgent";
import { resolveModelConfig } from "src/mastra/shared/towersOfCorebornAgentModels";
import { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import { readProductNowSessionForTool } from "src/product-now-mcp/productNowSessionContext";
import { z } from "zod";
import { throwIfAborted } from "../generationCancelled";

/** Mastra agent id for the ProductNow research subagent. */
export const CONSULT_PRODUCTNOW_AGENT_NAME = "consult-productnow";

/** Mastra model that researches one ProductNow question. */
const CONSULT_PRODUCTNOW_MODEL = "openai/gpt-5.4";

/** Research steps, including the reply that answers the question. */
const MAX_CONSULT_PRODUCTNOW_STEPS = 6;

const MAX_TOOL_RESULT_CHARS = 6000;

/**
 * ProductNow tools this agent may call.
 * Write tools stay unavailable so a lore lookup cannot edit documents.
 */
const PRODUCT_NOW_READ_TOOLS = new Set([
  "fetch",
  "fetch_folder",
  "list_document_versions",
  "search",
]);

const consultProductNowInputSchema = z.object({
  question: z
    .string()
    .trim()
    .min(2)
    .max(2000)
    .describe(
      "One question about the Spire, the Reach, a floor, a person, an order, or an event.",
    ),
});

const consultProductNowOutputSchema = z.object({
  answer: z.string(),
});

/** Abort signal and request context forwarded into the research subagent. */
interface ConsultProductNowRunContext {
  abortSignal?: AbortSignal;
  requestContext?: RequestContext;
}

/**
 * ProductNow research subagent.
 *
 * Coordinators do not construct this agent. They opt into
 * {@link AgentTool.ConsultProductNow}, and that registry tool calls
 * {@link ConsultProductNowAgent.answer}. The subagent's own tools are
 * ProductNow's read tools for the browser session, loaded here rather than
 * from the shared registry.
 */
@Injectable()
export class ConsultProductNowAgent {
  private readonly logger = new Logger(ConsultProductNowAgent.name);

  /** Mastra agent that researches one ProductNow question. */
  public readonly subagent: TowersOfCorebornAgent;

  public constructor(
    configurationService: ConfigurationService,
    private readonly productNowMcpService: ProductNowMcpService,
  ) {
    this.subagent = new TowersOfCorebornAgent({
      description:
        "Research one question about the Spire, the Reach, or other lore in ProductNow. Answer from the documents those tools return. If ProductNow is not connected, say so.",
      id: "consult-productnow-agent",
      instructions: renderConsultProductNowInstructions(),
      maxSteps: MAX_CONSULT_PRODUCTNOW_STEPS,
      model: resolveModelConfig(
        [{ model: CONSULT_PRODUCTNOW_MODEL }],
        configurationService.get("GEMINI_CREDENTIALS"),
      ),
      name: CONSULT_PRODUCTNOW_AGENT_NAME,
      tools: ({ requestContext }) => this.toolsForRequest(requestContext),
    });
  }

  /**
   * Tool definition registered for {@link AgentTool.ConsultProductNow}.
   * The session comes from the current request, not from the model.
   * @returns The Mastra tool coordinators call to consult ProductNow
   */
  public createTool() {
    return createTool({
      description:
        "Ask the ProductNow research agent one question about the Spire, the Reach, or other lore. It searches ProductNow with the connected user's session and returns an answer grounded in those documents.",
      execute: async (
        input: z.infer<typeof consultProductNowInputSchema>,
        context?: ConsultProductNowRunContext,
      ) => this.answer(input.question, context),
      id: AgentTool.ConsultProductNow,
      inputSchema: consultProductNowInputSchema,
      outputSchema: consultProductNowOutputSchema,
    });
  }

  /**
   * Runs the research subagent for one question.
   * @param question - What to look up in ProductNow
   * @param context - Abort signal and the request context that may carry the browser session
   * @returns The subagent's answer
   * @throws UnauthorizedException when ProductNow is not connected
   * @throws InternalServerErrorException when research finishes without an answer
   */
  public async answer(
    question: string,
    context?: ConsultProductNowRunContext,
  ): Promise<{ answer: string }> {
    throwIfAborted(context?.abortSignal);
    const result = await this.subagent.generate(question, {
      abortSignal: context?.abortSignal,
      requestContext: context?.requestContext,
    });
    const answer = result.text.trim();
    if (answer === "") {
      throw new InternalServerErrorException(
        "ProductNow research did not return an answer.",
      );
    }
    return { answer };
  }

  /**
   * Loads ProductNow's read tools for the session on this delegation.
   * @param requestContext - Mastra request context, which may carry the browser session
   * @returns Tools keyed by the ProductNow tool name
   * @throws UnauthorizedException when ProductNow is not connected
   * @throws BadGatewayException when ProductNow offers nothing to read
   */
  public async toolsForRequest(requestContext: {
    getRaw(key: string): unknown;
  }): Promise<ToolsInput> {
    const sessionId = readProductNowSessionForTool(requestContext);
    if (sessionId === undefined) {
      throw new UnauthorizedException(
        "Connect ProductNow before using its tools",
      );
    }
    return this.loadTools(sessionId);
  }

  /**
   * Turns ProductNow's read tools into Mastra tools bound to one session.
   * @param sessionId - Browser session that holds the ProductNow OAuth tokens
   * @returns Tools keyed by the ProductNow tool name
   * @throws BadGatewayException when ProductNow offers nothing to read
   */
  public async loadTools(sessionId: string): Promise<ToolsInput> {
    const listed = await this.productNowMcpService.listTools(sessionId);
    const readable = listed.tools.filter((tool) =>
      PRODUCT_NOW_READ_TOOLS.has(tool.name),
    );
    if (readable.length === 0) {
      throw new BadGatewayException(
        "ProductNow did not offer any documents to read.",
      );
    }

    return Object.fromEntries(
      readable.map((tool) => [tool.name, this.toMastraTool(sessionId, tool)]),
    );
  }

  /**
   * @param sessionId - Browser session that holds the ProductNow OAuth tokens
   * @param tool - One ProductNow MCP tool declaration
   * @returns A Mastra tool that calls that ProductNow tool
   */
  private toMastraTool(sessionId: string, tool: ProductNowMcpTool) {
    return createTool({
      description: tool.description ?? `ProductNow tool ${tool.name}.`,
      execute: async (input, context) => {
        throwIfAborted(context?.abortSignal);
        const args = isRecord(input) ? input : undefined;
        try {
          const raw = await this.productNowMcpService.callTool(
            sessionId,
            tool.name,
            args,
            context?.abortSignal,
          );
          return formatToolResult(raw);
        } catch (error) {
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          this.logger.warn(
            `ProductNow ${tool.name} failed: ${formatError(error)}`,
          );
          return `ProductNow ${tool.name} failed: ${formatError(error)}. Try a narrower query.`;
        }
      },
      id: tool.name,
      inputSchema: productNowInputSchema(tool.inputSchema),
    });
  }
}

/**
 * Instructions for the ProductNow research subagent.
 * Flavor and room layout have to come from ProductNow, not from memory.
 * @returns System instructions for one research run
 */
function renderConsultProductNowInstructions(): string {
  return [
    "You answer one question about Towers of Coreborn: the Spire, the Reach, its floors, people, orders, and history.",
    "Use the ProductNow tools. Search before you answer. You may search and fetch several times.",
    `For lore, search with folderId "${CARD_GAME_FOLDER_ID}", searchScope "workspace", and resultType "documents". The Lore document id is "${LORE_DOCUMENT_ID}". Fetch that document when the excerpts are not enough.`,
    "Answer in your final message. Use names, floors, and events the tools returned.",
    "If nothing matches, say that the documents do not cover it. Do not invent floors, names, or history.",
  ].join("\n");
}

/**
 * Converts a ProductNow input schema into a Zod schema Mastra can send to the model.
 * Drops the JSON Schema draft URL, which Zod's converter does not need.
 * @param schema - MCP input schema
 * @returns Zod input schema, or an open object when the MCP schema cannot be converted
 */
function productNowInputSchema(schema: Record<string, unknown>) {
  const { $schema: _schema, ...rest } = schema;
  try {
    return z.fromJSONSchema(rest as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    return z.object({}).passthrough();
  }
}

/**
 * @param raw - ProductNow tool result
 * @returns Text the research model should read next
 */
function formatToolResult(raw: unknown): string {
  const text = raw === undefined ? "" : (JSON.stringify(raw) ?? String(raw));
  if (text === "") {
    return "ProductNow returned no content.";
  }
  if (text.length <= MAX_TOOL_RESULT_CHARS) {
    return text;
  }
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated]`;
}

/**
 * @param value - Unknown tool input
 * @returns Whether the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @param error - Thrown value from a ProductNow call
 * @returns A single-line message
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
