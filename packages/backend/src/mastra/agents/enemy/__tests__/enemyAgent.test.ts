import { describe, expect, mock, test } from "bun:test";
import type { ToolsInput } from "@mastra/core/agent";
import { SUBMIT_ENEMY_TOOL_ID } from "src/asset-classes/enemy/enemyTools";
import { EnemyAgent, EnemyAgentTool } from "../enemyAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

describe("EnemyAgent", () => {
  test("gives ProductNow research and generate-image to the coordinator", async () => {
    const runChatWithTools = mock(
      async (input: {
        instructions: string;
        maxSteps: number;
        ownedTools: ToolsInput;
      }) => {
        expect(EnemyAgentTool.ConsultProductNow).toBe("consult-productnow");
        expect(input.maxSteps).toBe(6);
        expect(input.instructions).toContain("`consult-productnow`");
        expect(input.instructions).toContain("read the Lore document");
        expect(input.instructions).toContain("`generate-image`");
        expect(input.instructions).toContain("`submit-enemy`");
        expect(input.instructions).toContain("facing left");
        await executeTool(input.ownedTools, SUBMIT_ENEMY_TOOL_ID, {
          description: "A feral Coreborn with moss-covered antlers.",
          maxHitPoints: 42,
          name: "Moss Antler",
          pattern: [
            {
              amount: 6,
              kind: "attack",
              text: "Deal 6 damage to the player.",
            },
            { amount: 8, kind: "defend", text: "Gain 8 block." },
          ],
          scene: "One full-body Moss Antler facing left on pure white.",
        });
        return {
          text: "Moss Antler is ready.",
          toolErrors: [],
          toolResults: [
            {
              result: { answer: "Moss Antlers hunt in the Reach." },
              toolCallId: "lore-1",
              toolName: EnemyAgentTool.ConsultProductNow,
            },
            {
              result: portrait("/tmp/not-read"),
              toolCallId: "image-1",
              toolName: "generate-image",
            },
          ],
        };
      },
    );
    const saveGeneratedEnemy = mock(
      async (input: {
        draft: { maxHitPoints: number; pattern: unknown[] };
      }) => {
        expect(input.draft.maxHitPoints).toBe(42);
        expect(input.draft.pattern).toHaveLength(2);
        return { id: "enemy-1" };
      },
    );
    const agent = new EnemyAgent(
      {
        runAssetClassAgentChat: runChatWithTools,
      } as never,
      { saveGeneratedEnemy } as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "a feral Coreborn with moss-covered antlers",
    });

    expect(runChatWithTools).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "enemy-1",
      summary: "Moss Antler is ready.",
    });
    expect(saveGeneratedEnemy).toHaveBeenCalledTimes(1);
  });

  test("rejects a run that does not submit enemy stats", async () => {
    const runChatWithTools = mock(async () => ({
      text: "missing stats",
      toolErrors: [],
      toolResults: [
        {
          result: { answer: "A warden beast protects the Reach." },
          toolCallId: "lore-1",
          toolName: EnemyAgentTool.ConsultProductNow,
        },
      ],
    }));
    const agent = new EnemyAgent(
      { runAssetClassAgentChat: runChatWithTools } as never,
      { saveGeneratedEnemy: mock(async () => ({ id: "unused" })) } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a warden beast" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("submit enemy stats");
  });

  test("rejects a painted enemy that skipped ProductNow research", async () => {
    const runChatWithTools = mock(async (input: { ownedTools: ToolsInput }) => {
      await executeTool(input.ownedTools, SUBMIT_ENEMY_TOOL_ID, {
        description: "A warden beast.",
        maxHitPoints: 30,
        name: "Warden Beast",
        pattern: [
          {
            amount: 6,
            kind: "attack",
            text: "Deal 6 damage to the player.",
          },
        ],
        scene: "One full-body warden beast facing left.",
      });
      return {
        text: "Done",
        toolErrors: [],
        toolResults: [
          {
            result: portrait("/tmp/not-read"),
            toolCallId: "image-1",
            toolName: "generate-image",
          },
        ],
      };
    });
    const agent = new EnemyAgent(
      { runAssetClassAgentChat: runChatWithTools } as never,
      { saveGeneratedEnemy: mock(async () => ({ id: "unused" })) } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a warden beast" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof Error ? error.message : "").toContain(
      "without consulting ProductNow",
    );
  });
});

/**
 * @param filePath - Stand-in path; this result is not read from disk
 * @returns A generate-image payload the enemy reader accepts
 */
function portrait(filePath: string) {
  return {
    aspectRatio: "3:4",
    imageSize: "1K",
    images: [
      {
        filePath,
        name: "Moss Antler",
        notes: "A feral Coreborn with moss-covered antlers.",
      },
    ],
    theme: "Moss and bone. Soft watercolor on paper.",
    usedFirstImageAsReference: false,
  };
}

/**
 * @returns An abort coordinator that never stops a run
 */
function idleAbort() {
  return {
    run: async <Result>(
      _generationId: string,
      operation: (signal: AbortSignal) => Promise<Result>,
    ) => operation(new AbortController().signal),
    stop: async () => true,
  };
}

/**
 * Executes one request-scoped Mastra tool in a unit test.
 * @param tools - Tools supplied to the enemy agent
 * @param id - Tool id
 * @param input - Tool payload
 * @returns Tool result
 */
async function executeTool(
  tools: ToolsInput,
  id: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const tool = tools[id] as {
    execute?: (payload: Record<string, unknown>) => Promise<unknown>;
  };
  if (tool.execute === undefined) {
    throw new Error(`Tool ${id} has no execute function.`);
  }
  return tool.execute(input);
}
