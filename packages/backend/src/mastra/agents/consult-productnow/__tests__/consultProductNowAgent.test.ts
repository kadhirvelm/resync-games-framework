import { describe, expect, mock, test } from "bun:test";
import { RequestContext } from "@mastra/core/request-context";
import { UnauthorizedException } from "@nestjs/common";
import { AgentTool } from "@resync-game-framework/api";
import { ResyncGameFrameworkAgentToolRegistry } from "src/mastra/shared/resyncGameFrameworkAgentToolRegistry";
import type { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import {
  PRODUCT_NOW_SESSION_REQUEST_KEY,
  runWithProductNowSession,
} from "src/product-now-mcp/productNowSessionContext";
import {
  CONSULT_PRODUCTNOW_AGENT_NAME,
  ConsultProductNowAgent,
} from "../consultProductNowAgent";

describe("ConsultProductNowAgent", () => {
  test("loads ProductNow read tools and calls them with the browser session", async () => {
    const called: Array<{
      args: unknown;
      name: string;
      sessionId: string;
      signal: AbortSignal | undefined;
    }> = [];
    const agent = createAgent({
      callTool: mock(
        async (
          sessionId: string,
          name: string,
          args: unknown,
          signal?: AbortSignal,
        ) => {
          called.push({ args, name, sessionId, signal });
          return { title: "Lore" };
        },
      ),
      listTools: mock(async () => ({
        tools: [searchTool(), fetchTool(), writeTool()],
      })),
    });

    const tools = await agent.loadTools("session-1");
    const search = tools.search as
      | {
          execute?: (
            input: unknown,
            context?: { abortSignal?: AbortSignal },
          ) => Promise<unknown>;
        }
      | undefined;
    if (typeof search?.execute !== "function") {
      throw new Error("expected the search tool");
    }

    const signal = new AbortController().signal;
    await search.execute({ query: "the Reach" }, { abortSignal: signal });

    expect(Object.keys(tools).sort()).toEqual(["fetch", "search"]);
    expect(called).toEqual([
      {
        args: { query: "the Reach" },
        name: "search",
        sessionId: "session-1",
        signal,
      },
    ]);
    expect(agent.subagent.name).toBe(CONSULT_PRODUCTNOW_AGENT_NAME);
    expect(agent.subagent.getDescription()).toContain("ProductNow");
  });

  test("reads the session from the delegation request context", async () => {
    const sessions: string[] = [];
    const agent = createAgent({
      callTool: mock(async () => ({})),
      listTools: mock(async (sessionId: string) => {
        sessions.push(sessionId);
        return { tools: [searchTool()] };
      }),
    });
    const requestContext = new RequestContext();
    requestContext.setRaw(PRODUCT_NOW_SESSION_REQUEST_KEY, "session-9");

    const tools = await agent.toolsForRequest(requestContext);

    expect(Object.keys(tools)).toEqual(["search"]);
    expect(sessions).toEqual(["session-9"]);
  });

  test("reads the active browser session when the request context has none", async () => {
    const sessions: string[] = [];
    const agent = createAgent({
      callTool: mock(async () => ({})),
      listTools: mock(async (sessionId: string) => {
        sessions.push(sessionId);
        return { tools: [searchTool()] };
      }),
    });

    await runWithProductNowSession("session-4", () =>
      agent.toolsForRequest(new RequestContext()),
    );

    expect(sessions).toEqual(["session-4"]);
  });

  test("refuses to load tools without a ProductNow session", async () => {
    const sessions: string[] = [];
    const agent = createAgent({
      callTool: mock(async () => ({})),
      listTools: mock(async (sessionId: string) => {
        sessions.push(sessionId);
        return { tools: [searchTool()] };
      }),
    });

    const error = await agent.toolsForRequest(new RequestContext()).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error instanceof UnauthorizedException).toBe(true);
    expect(sessions).toEqual([]);
  });

  test("the registry tool runs the subagent and returns its answer", async () => {
    const agent = createAgent({
      callTool: mock(async () => ({})),
      listTools: mock(async () => ({ tools: [searchTool()] })),
    });
    const signal = new AbortController().signal;
    agent.subagent.generate = mock(async (prompt: string) => {
      expect(prompt).toBe("How is the Reach set up?");
      return { text: "  The Reach is climbed under the Warden Compact.  " };
    }) as unknown as typeof agent.subagent.generate;
    const registry = new ResyncGameFrameworkAgentToolRegistry(
      agent,
      {
        createTool: () => ({ id: AgentTool.GenerateImage }),
      } as never,
      { createTool: () => ({ id: AgentTool.GenerateThreeDModel }) } as never,
      { createTool: () => ({ id: AgentTool.RecordProductNowLore }) } as never,
      { createTool: () => ({ id: AgentTool.GenerateAudio }) } as never,
    );

    const tool = registry.buildTools([AgentTool.ConsultProductNow])[
      AgentTool.ConsultProductNow
    ] as
      | {
          execute?: (
            input: { question: string },
            context?: { abortSignal?: AbortSignal },
          ) => Promise<{ answer: string }>;
        }
      | undefined;
    if (typeof tool?.execute !== "function") {
      throw new Error("expected consult-productnow to be registered");
    }

    const result = await tool.execute(
      { question: "How is the Reach set up?" },
      { abortSignal: signal },
    );

    expect(result).toEqual({
      answer: "The Reach is climbed under the Warden Compact.",
    });
  });
});

/**
 * @param productNow - ProductNow MCP stand-in
 * @returns A consult agent whose model runner does not need credentials
 */
function createAgent(productNow: {
  callTool: ProductNowMcpService["callTool"];
  listTools: ProductNowMcpService["listTools"];
}): ConsultProductNowAgent {
  return new ConsultProductNowAgent(
    { get: () => undefined } as never,
    productNow as unknown as ProductNowMcpService,
  );
}

/**
 * @returns The ProductNow search tool the research agent is allowed to call
 */
function searchTool() {
  return {
    description: "Search documents.",
    inputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: { query: { type: "string" } },
      type: "object",
    },
    name: "search",
  };
}

/**
 * @returns The ProductNow fetch tool the research agent is allowed to call
 */
function fetchTool() {
  return {
    description: "Read one document.",
    inputSchema: {
      properties: { documentId: { type: "string" } },
      type: "object",
    },
    name: "fetch",
  };
}

/**
 * @returns A write tool the research agent must not offer to the model
 */
function writeTool() {
  return {
    description: "Edit a document.",
    inputSchema: { type: "object" },
    name: "edit_document",
  };
}
