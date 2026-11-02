import { describe, expect, mock, test } from "bun:test";
import { AgentTool } from "@resync-game-framework/api";
import {
  ASSET_CLASS_COORDINATOR_MODEL,
  ResyncGameFrameworkAgentService,
} from "../resyncGameFrameworkAgent.service";

describe("ResyncGameFrameworkAgentService", () => {
  test("builds a standard asset-class chat from catalog and owned tools", async () => {
    const catalogTool = { description: "catalog" };
    const ownedTool = { description: "owned" };
    const buildTools = mock((_tools: unknown) => ({
      [AgentTool.ConsultProductNow]: catalogTool,
    }));
    const streamChat = mock(async (_input: unknown) => ({
      text: "done",
      toolErrors: [],
      toolResults: [],
    }));
    const service = new ResyncGameFrameworkAgentService(
      { buildTools } as never,
      {} as never,
    );
    Object.assign(service, { streamChat });

    const result = await service.runAssetClassAgentChat({
      agentId: "sample-agent",
      catalogTools: [AgentTool.ConsultProductNow],
      instructions: "Use both tools.",
      maxSteps: 6,
      ownedTools: { "submit-sample": ownedTool } as never,
      prompt: "Make a sample.",
      timeoutMs: 1234,
      toolCallConcurrency: 1,
    });

    expect(result.text).toBe("done");
    expect(buildTools.mock.calls[0]?.[0]).toEqual([
      AgentTool.ConsultProductNow,
    ]);
    expect(streamChat.mock.calls[0]?.[0]).toEqual({
      abortSignal: undefined,
      agentConfig: {
        id: "sample-agent",
        instructions: "Use both tools.",
        maxSteps: 6,
        model: [{ model: ASSET_CLASS_COORDINATOR_MODEL }],
        name: "sample-agent",
        toolCallConcurrency: 1,
      },
      prompt: "Make a sample.",
      timeoutMs: 1234,
      tools: {
        [AgentTool.ConsultProductNow]: catalogTool,
        "submit-sample": ownedTool,
      },
    });
  });
});
