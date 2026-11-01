import { describe, expect, mock, test } from "bun:test";
import type { ToolsInput } from "@mastra/core/agent";
import { SUBMIT_SPRITE_SHEET_TOOL_ID } from "src/asset-classes/sprite-sheet/spriteSheetTools";
import { SpriteSheetAgent, SpriteSheetAgentTool } from "../spriteSheetAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

const DESIGN = {
  attackEffect: "a compact amber spark burst",
  attackMove: "an overhead hammer smash",
  costumeAndPalette: "soot-black apron, brass goggles, rust and amber palette",
  defendMove: "raises a riveted forge shield",
  description: "A forge-keeper of the Spire who fights with a smithing hammer.",
  facing: "right",
  name: "Ember Smith",
  prop: "a short smithing hammer",
  silhouette: "stocky, broad shoulders, short legs",
};

describe("SpriteSheetAgent", () => {
  test("researches lore, returns exact prompts from submission, and saves the painted pair", async () => {
    let submitted: unknown;
    const runAssetClassAgentChat = mock(
      async (input: {
        instructions: string;
        maxSteps: number;
        ownedTools: ToolsInput;
      }) => {
        expect(SpriteSheetAgentTool.GenerateImage).toBe("generate-image");
        expect(input.maxSteps).toBe(6);
        expect(input.instructions).toContain("`consult-productnow`");
        expect(input.instructions).toContain("`submit-sprite-sheet`");
        expect(input.instructions).toContain("useFirstImageAsReference: true");
        submitted = await executeTool(
          input.ownedTools,
          SUBMIT_SPRITE_SHEET_TOOL_ID,
          DESIGN,
        );
        return {
          text: "Ember Smith is ready.",
          toolErrors: [],
          toolResults: [
            {
              result: { answer: "Forge-keepers tend the Spire's furnaces." },
              toolCallId: "lore-1",
              toolName: SpriteSheetAgentTool.ConsultProductNow,
            },
            {
              result: paintedPair(),
              toolCallId: "image-1",
              toolName: "generate-image",
            },
          ],
        };
      },
    );
    const saveGeneratedSpriteSheet = mock(
      async (input: {
        draft: { facing: string };
        images: { anchor: { filePath: string }; sheet: { filePath: string } };
      }) => {
        expect(input.draft.facing).toBe("right");
        expect(input.images.anchor.filePath).toBe("/tmp/anchor.png");
        expect(input.images.sheet.filePath).toBe("/tmp/sheet.png");
        return { id: "sheet-1" };
      },
    );
    const agent = new SpriteSheetAgent(
      { runAssetClassAgentChat } as never,
      { saveGeneratedSpriteSheet } as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "a forge-keeper with a hammer",
    });

    expect(result).toEqual({ id: "sheet-1", summary: "Ember Smith is ready." });
    expect(saveGeneratedSpriteSheet).toHaveBeenCalledTimes(1);
    expect((submitted as { accepted: boolean }).accepted).toBe(true);
    expect((submitted as { sheetPrompt: string }).sheetPrompt).toContain(
      "Row 1 idle, Row 2 attack, Row 3 defend, Row 4 hurt",
    );
  });

  test("rejects a sheet that was not painted from the anchor", async () => {
    const runAssetClassAgentChat = mock(
      async (input: { ownedTools: ToolsInput }) => {
        await executeTool(
          input.ownedTools,
          SUBMIT_SPRITE_SHEET_TOOL_ID,
          DESIGN,
        );
        return {
          text: "Done",
          toolErrors: [],
          toolResults: [
            {
              result: { answer: "lore" },
              toolCallId: "lore-1",
              toolName: SpriteSheetAgentTool.ConsultProductNow,
            },
            {
              result: { ...paintedPair(), usedFirstImageAsReference: false },
              toolCallId: "image-1",
              toolName: "generate-image",
            },
          ],
        };
      },
    );
    const agent = new SpriteSheetAgent(
      { runAssetClassAgentChat } as never,
      {
        saveGeneratedSpriteSheet: mock(async () => ({ id: "unused" })),
      } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a forge-keeper" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof Error ? error.message : "").toContain(
      "painted from the anchor",
    );
  });

  test("rejects a run that skipped ProductNow research", async () => {
    const runAssetClassAgentChat = mock(
      async (input: { ownedTools: ToolsInput }) => {
        await executeTool(
          input.ownedTools,
          SUBMIT_SPRITE_SHEET_TOOL_ID,
          DESIGN,
        );
        return {
          text: "Done",
          toolErrors: [],
          toolResults: [
            {
              result: paintedPair(),
              toolCallId: "image-1",
              toolName: "generate-image",
            },
          ],
        };
      },
    );
    const agent = new SpriteSheetAgent(
      { runAssetClassAgentChat } as never,
      {
        saveGeneratedSpriteSheet: mock(async () => ({ id: "unused" })),
      } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a forge-keeper" })
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
 * @returns A generate-image payload with an anchor and a sheet painted from it
 */
function paintedPair() {
  return {
    aspectRatio: "4:3",
    imageSize: "2K",
    images: [
      {
        filePath: "/tmp/anchor.png",
        name: "Ember Smith anchor",
        notes: "A stocky forge-keeper with a smithing hammer.",
      },
      {
        filePath: "/tmp/sheet.png",
        name: "Ember Smith sheet",
        notes: "Idle, attack, defend, and hurt rows for Ember Smith.",
      },
    ],
    theme:
      "Rust and amber. High-resolution pixel-art game sprite on pure white.",
    usedFirstImageAsReference: true,
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
 * @param tools - Tools supplied to the sprite-sheet agent
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
