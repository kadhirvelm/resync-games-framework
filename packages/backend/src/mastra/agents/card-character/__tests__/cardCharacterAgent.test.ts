import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { MockRedisService } from "src/infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "src/infra/redis/redis.service";
import { GenerationAbortCoordinator } from "../../generationAbort.coordinator";
import { GenerationCancelledException } from "../../generationCancelled";
import {
  CardCharacterAgent,
  CardCharacterAgentTool,
} from "../cardCharacterAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

describe("CardCharacterAgent", () => {
  let tempDirectory = "";

  afterEach(async () => {
    if (tempDirectory !== "") {
      await rm(tempDirectory, { force: true, recursive: true });
      tempDirectory = "";
    }
  });

  test("gives ProductNow research and generate-image to the coordinator", async () => {
    const runGenerationCoordinator = mock(
      async (input: {
        instructions: string;
        maxSteps?: number;
        supportingToolIds?: string[];
        toolId: string;
        tools: unknown;
      }) => {
        expect(input.tools).toBe(CardCharacterAgentTool);
        expect(input.toolId).toBe(CardCharacterAgentTool.GenerateImage);
        expect(CardCharacterAgentTool.ConsultProductNow).toBe(
          "consult-productnow",
        );
        expect(input.maxSteps).toBe(4);
        expect(input.supportingToolIds).toEqual([
          CardCharacterAgentTool.ConsultProductNow,
        ]);
        expect(input.instructions).toContain("`consult-productnow`");
        expect(input.instructions).toContain("read the Lore document");
        expect(input.instructions).toContain("`generate-image`");
        expect(input.instructions).toContain("facing right");
        expect(input.instructions).toContain("Pure white background");
        expect(input.instructions).toContain("Full body from head to feet");
        expect(input.instructions).toContain("Soft watercolor on paper");
        return {
          text: "Workshop Apprentice through Clockwork Sovereign.",
          toolOutput: imageSet("/tmp/not-read"),
        };
      },
    );
    const saveGeneratedPortraits = mock(async () => ({ setId: "set-1" }));
    const agent = new CardCharacterAgent(
      { runGenerationCoordinator } as never,
      { saveGeneratedPortraits } as never,
      idleAbort() as never,
    );

    const result = await agent.query({
      generationId: GENERATION_ID,
      prompt: "a soot-covered inventor who builds clockwork wings",
    });

    expect(runGenerationCoordinator).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      setId: "set-1",
      summary: "Workshop Apprentice through Clockwork Sovereign.",
    });
    expect(saveGeneratedPortraits).toHaveBeenCalledTimes(1);
  });

  test("deletes generated files when the tool result is not a character set", async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), "card-character-agent-"));
    const filePath = join(tempDirectory, `${randomUUID()}.png`);
    await sharp({
      create: {
        background: { alpha: 1, b: 10, g: 10, r: 10 },
        channels: 4,
        height: 64,
        width: 64,
      },
    })
      .png()
      .toFile(filePath);
    const runGenerationCoordinator = mock(async () => ({
      text: "only one image",
      toolOutput: {
        images: [{ filePath, name: "Lone", notes: "Not a set." }],
      },
    }));
    const agent = new CardCharacterAgent(
      { runGenerationCoordinator } as never,
      {
        saveGeneratedPortraits: mock(async () => ({ setId: "unused" })),
      } as never,
      idleAbort() as never,
    );

    const error = await agent
      .query({ generationId: GENERATION_ID, prompt: "a knight" })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    if (!(error instanceof Error)) {
      throw new Error("expected the character set to be rejected");
    }
    expect(error.message).toContain("generate-image");
    expect(await fileExists(filePath)).toBe(false);
  });

  test("abort stops the coordinator signal", async () => {
    const redis = new MockRedisService();
    const runs = new GenerationAbortCoordinator(
      redis as unknown as RedisService,
    );
    await runs.onModuleInit();
    let signal: AbortSignal | undefined;
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = () => {
        resolve();
      };
    });
    const runGenerationCoordinator = async (input: {
      abortSignal?: AbortSignal;
    }) => {
      signal = input.abortSignal;
      markStarted();
      return new Promise((_resolve, reject) => {
        input.abortSignal?.addEventListener("abort", () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    };
    const agent = new CardCharacterAgent(
      { runGenerationCoordinator } as never,
      {
        saveGeneratedPortraits: mock(async () => ({ setId: "unused" })),
      } as never,
      runs,
    );

    const pending = agent.query({
      generationId: GENERATION_ID,
      prompt: "a knight",
    });
    await started;
    await agent.abort(GENERATION_ID);
    const error = await pending.then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(signal?.aborted).toBe(true);
    expect(error instanceof GenerationCancelledException).toBe(true);
    await runs.onModuleDestroy();
  });
});

/**
 * @param filePath - Stand-in path; this result is not read from disk
 * @returns A generate-image payload the card-character reader accepts
 */
function imageSet(filePath: string) {
  return {
    aspectRatio: "3:4",
    imageSize: "1K",
    images: [1, 2, 3, 4].map((level) => ({
      filePath: `${filePath}-${level}`,
      name: `Stage ${level}`,
      notes: `Stage ${level} changes gear.`,
    })),
    theme: "Brass and soot.",
    usedFirstImageAsReference: true,
  };
}

/**
 * @param filePath - Path that may have been deleted
 * @returns Whether the file is still on disk
 */
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
