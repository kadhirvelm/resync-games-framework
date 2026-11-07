import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { GenerationAbortCoordinator } from "../../generationAbort.coordinator";
import {
  BattleBackgroundAgent,
  BattleBackgroundAgentTool,
} from "../battleBackgroundAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

describe("BattleBackgroundAgent", () => {
  let tempDirectory = "";

  afterEach(async () => {
    if (tempDirectory !== "") {
      await rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = "";
    }
  });

  test("gives the registered generate-image tool to the coordinator", async () => {
    const runGenerationCoordinator = mock(
      async (input: {
        instructions: string;
        maxSteps?: number;
        supportingToolIds?: string[];
        toolId: string;
        tools: unknown;
      }) => {
        expect(input.tools).toBe(BattleBackgroundAgentTool);
        expect(input.toolId).toBe(BattleBackgroundAgentTool.GenerateImage);
        expect(input.instructions).toContain("`consult-productnow`");
        expect(input.instructions).toContain("read the Lore document");
        expect(input.instructions).toContain("`generate-image`");
        expect(input.maxSteps).toBe(4);
        expect(input.supportingToolIds).toEqual([
          BattleBackgroundAgentTool.ConsultProductNow,
        ]);
        expect(input.instructions).toContain("soft watercolor painting");
        expect(input.instructions).toContain("left third");
        return {
          text: "Moon Gate Terrace is ready.",
          toolOutput: backgroundImage("/tmp/not-read"),
        };
      },
    );
    const saved: unknown[] = [];
    const saveGeneratedBackground = mock(async (input: unknown) => {
      saved.push(input);
      return { id: "room-1" };
    });
    const agent = new BattleBackgroundAgent(
      { runGenerationCoordinator } as never,
      { saveGeneratedBackground } as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "a moon gate over a quiet garden",
    });

    expect(runGenerationCoordinator).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      id: "room-1",
      summary: "Moon Gate Terrace is ready.",
    });
    expect(saved).toEqual([
      {
        id: GENERATION_ID,
        image: backgroundImage("/tmp/not-read").images[0],
        sourcePrompt: "a moon gate over a quiet garden",
      },
    ]);
  });

  test("deletes the painting when it is not one wide room", async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "battle-background-agent-"));
    const filePath = join(tempDirectory, `${randomUUID()}.png`);
    await sharp({
      create: {
        background: { alpha: 1, b: 10, g: 40, r: 10 },
        channels: 4,
        height: 64,
        width: 64,
      },
    })
      .png()
      .toFile(filePath);
    const runGenerationCoordinator = mock(async () => ({
      text: "two rooms",
      toolOutput: {
        images: [
          {
            filePath,
            name: "Gate",
            notes: "A jade gate with hanging vines and gray stone.",
          },
        ],
      },
    }));
    const agent = new BattleBackgroundAgent(
      { runGenerationCoordinator } as never,
      {
        saveGeneratedBackground: mock(async () => ({ id: "unused" })),
      } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a gate" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    if (!(error instanceof Error)) {
      throw new Error("expected the background to be rejected");
    }
    expect(error.message).toContain("generate-image");
    expect(await fileExists(filePath)).toBe(false);
  });
});

/**
 * @param filePath - Stand-in path; this result is not read from disk
 * @returns A generate-image payload the battle-background reader accepts
 */
function backgroundImage(filePath: string) {
  return {
    aspectRatio: "16:9",
    imageSize: "2K",
    images: [
      {
        filePath,
        name: "Moon Gate Terrace",
        notes: "A broken moon gate above a quiet jade garden of gray stone.",
      },
    ],
  };
}

/**
 * @returns An abort coordinator that never stops a run
 */
function idleAbort(): Pick<GenerationAbortCoordinator, "run" | "stop"> {
  return {
    run: async (_generationId, operation) =>
      operation(new AbortController().signal),
    stop: async () => true,
  };
}

/**
 * @param filePath - Path that may have been deleted
 * @returns Whether the file is still on disk
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
