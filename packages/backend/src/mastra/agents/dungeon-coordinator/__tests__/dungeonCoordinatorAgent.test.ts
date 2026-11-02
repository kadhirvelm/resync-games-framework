import { describe, expect, mock, test } from "bun:test";
import type { ToolsInput } from "@mastra/core/agent";
import { AgentTool } from "@resync-game-framework/api";
import { GenerationAbortCoordinator } from "../../generationAbort.coordinator";
import {
  DungeonCoordinatorAgent,
  PLAN_DUNGEON_BACKGROUND_TOOL_ID,
  PLAN_DUNGEON_CARD_TOOL_ID,
  PLAN_DUNGEON_CHARACTER_TOOL_ID,
  PLAN_DUNGEON_ENEMY_TOOL_ID,
} from "../dungeonCoordinatorAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

describe("DungeonCoordinatorAgent", () => {
  test("records prompts and does not create assets", async () => {
    const runChatWithTools = mock(
      async (input: {
        agentConfig: { maxSteps?: number; toolCallConcurrency?: number };
        timeoutMs?: number;
        tools: ToolsInput;
      }) => {
        await planFullDungeon(input.tools);
        expect(input.tools[AgentTool.ConsultProductNow]).toBeDefined();
        expect(input.timeoutMs).toBe(10 * 60 * 1000);
        expect(input.agentConfig.maxSteps).toBe(26);
        expect(input.agentConfig.toolCallConcurrency).toBe(1);
        return {
          text: "A drowned belfry.",
          toolErrors: [],
          toolResults: [],
        };
      },
    );
    const agent = new DungeonCoordinatorAgent(
      agentService(runChatWithTools) as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "A dungeon in a drowned bell tower",
      sessionId: "session-1",
    });

    expect(result.summary).toBe("A drowned belfry.");
    expect(
      result.slots.filter((slot) => slot.kind === "battle-background"),
    ).toHaveLength(2);
    expect(
      result.slots.filter((slot) => slot.kind === "card-character"),
    ).toHaveLength(3);
    expect(result.slots.filter((slot) => slot.kind === "enemy")).toHaveLength(
      2,
    );
    const cards = result.slots.filter((slot) => slot.kind === "playable-card");
    expect(cards).toHaveLength(12);
    const firstCharacter = result.slots.find(
      (slot) => slot.kind === "card-character",
    );
    const line = cards.filter(
      (slot) => slot.characterSlotId === firstCharacter?.id,
    );
    expect(line.map((slot) => slot.level)).toEqual([1, 2, 3, 4]);
    expect(line[0]?.prompt).toContain("signature bell");
    const sprites = result.slots.filter((slot) => slot.kind === "sprite-sheet");
    expect(sprites).toHaveLength(5);
    const firstSprite = sprites.find(
      (slot) => slot.ownerSlotId === firstCharacter?.id,
    );
    expect(firstSprite?.prompt).toBe("Mara swings a bell hammer");
    expect(firstSprite?.title).toBe("Mara sprite");
    expect(result.slots.indexOf(firstSprite as never)).toBe(
      result.slots.indexOf(line[3] as never) + 1,
    );
    const enemies = result.slots.filter((slot) => slot.kind === "enemy");
    for (const enemy of enemies) {
      const enemySprite = sprites.find((slot) => slot.ownerSlotId === enemy.id);
      expect(enemySprite?.prompt).toBe(`${enemy.title} lunges and recoils`);
      expect(enemySprite?.title).toBe(`${enemy.title} sprite`);
      expect(result.slots.indexOf(enemySprite as never)).toBe(
        result.slots.indexOf(enemy) + 1,
      );
    }
  });

  test("rejects a plan when the fixed prompt counts are incomplete", async () => {
    const runChatWithTools = mock(async (input: { tools: ToolsInput }) => {
      await executeTool(input.tools, PLAN_DUNGEON_BACKGROUND_TOOL_ID, {
        prompt: "A flooded chamber",
        title: "Chamber",
      });
      await executeTool(input.tools, PLAN_DUNGEON_CHARACTER_TOOL_ID, {
        prompt: "A bell warden",
        spritePrompt: "The warden raises a bell shield",
        title: "Warden",
      });
      return { text: "Incomplete", toolErrors: [], toolResults: [] };
    });
    const agent = new DungeonCoordinatorAgent(
      agentService(runChatWithTools) as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({
        generationId: GENERATION_ID,
        prompt: "An incomplete dungeon",
        sessionId: "session-1",
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof Error).toBe(true);
    expect((error as Error).message).toContain("exactly 2 backgrounds");
  });

  test("returns the prompts when the coordinator stream fails after they are recorded", async () => {
    const runChatWithTools = mock(async (input: { tools: ToolsInput }) => {
      await planFullDungeon(input.tools);
      throw new Error(
        "Agent dungeon-coordinator-agent stream failed: finish reason error",
      );
    });
    const agent = new DungeonCoordinatorAgent(
      agentService(runChatWithTools) as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "A dungeon in a drowned bell tower",
      sessionId: "session-1",
    });

    expect(result.slots).toHaveLength(24);
    expect(result.summary).toBe("The dungeon prompts are ready.");
  });
});

/**
 * @param runChatWithTools - Stand-in for the agent runner
 * @returns The slice of the agent service the planner calls
 */
function agentService(
  runChatWithTools: (input: {
    agentConfig: { maxSteps?: number; toolCallConcurrency?: number };
    timeoutMs?: number;
    tools: ToolsInput;
  }) => Promise<unknown>,
) {
  return {
    runAssetClassAgentChat: (input: {
      maxSteps: number;
      ownedTools?: ToolsInput;
      timeoutMs?: number;
      toolCallConcurrency?: number;
    }) =>
      runChatWithTools({
        agentConfig: {
          maxSteps: input.maxSteps,
          toolCallConcurrency: input.toolCallConcurrency,
        },
        timeoutMs: input.timeoutMs,
        tools: {
          [AgentTool.ConsultProductNow]: { id: AgentTool.ConsultProductNow },
          ...(input.ownedTools ?? {}),
        },
      }),
  };
}

/**
 * Records every prompt a complete dungeon package needs.
 * @param tools - Tools supplied to the planner
 */
async function planFullDungeon(tools: ToolsInput): Promise<void> {
  for (const title of ["Bell chamber", "Bell crown"]) {
    await executeTool(tools, PLAN_DUNGEON_BACKGROUND_TOOL_ID, {
      prompt: `Paint ${title}`,
      title,
    });
  }
  const characterIds: string[] = [];
  for (const title of ["Mara", "Dorn", "Isha"]) {
    const character = await executeTool(tools, PLAN_DUNGEON_CHARACTER_TOOL_ID, {
      prompt: `${title} keeps the bells`,
      spritePrompt: `${title} swings a bell hammer`,
      title,
    });
    characterIds.push(character.characterSlotId ?? "");
  }
  for (const characterSlotId of characterIds) {
    for (let level = 1; level <= 4; level += 1) {
      await executeTool(tools, PLAN_DUNGEON_CARD_TOOL_ID, {
        characterSlotId,
        level,
        prompt: "A signature bell technique",
        title: `Bell ${level}`,
      });
    }
  }
  for (const title of ["Moss bell", "Drowned echo"]) {
    await executeTool(tools, PLAN_DUNGEON_ENEMY_TOOL_ID, {
      prompt: `${title} hunts in the tower`,
      spritePrompt: `${title} lunges and recoils`,
      title,
    });
  }
}

/**
 * Executes one request-scoped Mastra tool in a unit test.
 * @param tools - Tools supplied to the planner
 * @param id - Tool id
 * @param input - Tool payload
 * @returns Tool result
 */
async function executeTool(
  tools: ToolsInput,
  id: string,
  input: Record<string, string | number>,
): Promise<Record<string, string>> {
  const tool = tools[id] as {
    execute?: (payload: Record<string, string | number>) => Promise<unknown>;
  };
  if (tool.execute === undefined) {
    throw new Error(`Tool ${id} has no execute function.`);
  }
  return (await tool.execute(input)) as Record<string, string>;
}

/**
 * @returns An abort coordinator that never cancels
 */
function idleAbort(): Pick<GenerationAbortCoordinator, "run" | "stop"> {
  return {
    run: async (_generationId, operation) =>
      operation(new AbortController().signal),
    stop: async () => true,
  };
}
