import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentTool } from "@resync-game-framework/api";
import sharp from "sharp";
import { ModelService } from "src/model/model.service";
import { ResyncGameFrameworkAgentToolRegistry } from "../../shared/resyncGameFrameworkAgentToolRegistry";
import {
  GENERATE_IMAGE_MODELS,
  GenerateImageToolService,
} from "../generateImageTool.service";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { force: true, recursive: true });
  }
});

describe("GenerateImageToolService", () => {
  test("calls the chosen provider and reuses the first image as a reference", async () => {
    const directory = await makeTempDirectory();
    const calls: Array<Record<string, unknown>> = [];
    const requestTextCompletion = mock(
      async (request: Record<string, unknown>) => {
        calls.push(request);
        return createPortrait(directory, 96, 128);
      },
    );
    const service = new GenerateImageToolService({
      requestTextCompletion,
    } as unknown as ModelService);

    const openAI = await service.generate({
      aspectRatio: "3:4",
      imageSize: "1K",
      images: [
        {
          name: "First",
          notes: "Establishes the subject.",
          prompt: "A portrait.",
        },
        { name: "Second", prompt: "The same subject, stronger." },
      ],
      provider: "open-ai",
      theme: "Warm lamplight.",
      useFirstImageAsReference: true,
    });

    expect(openAI.provider).toBe("open-ai");
    expect(openAI.model).toBe(GENERATE_IMAGE_MODELS["open-ai"]);
    expect(openAI.usedFirstImageAsReference).toBe(true);
    expect(openAI.images[1]?.notes).toBe("");
    expect(calls[0]?.type).toBe("open-ai");
    expect(calls[0]?.schema).toBe("image");
    expect(calls[0]?.model).toBe(GENERATE_IMAGE_MODELS["open-ai"]);
    expect(calls[0]?.imageConfig).toEqual({
      aspectRatio: "3:4",
      imageSize: "1K",
    });
    expect(calls[0]?.inputFiles).toBeUndefined();
    const reference = calls[1]?.inputFiles as
      | Array<{ mimeType: string }>
      | undefined;
    expect(reference).toHaveLength(1);
    expect(reference?.[0]?.mimeType).toBe("image/png");

    calls.length = 0;
    await service.generate({
      aspectRatio: "1:1",
      imageSize: "1K",
      images: [{ name: "Square", prompt: "A square icon." }],
      provider: "gemini",
      useFirstImageAsReference: false,
    });
    expect(calls[0]?.type).toBe("gemini");
    expect(calls[0]?.model).toBe(GENERATE_IMAGE_MODELS.gemini);
    expect(calls[0]?.inputFiles).toBeUndefined();
  });

  test("retries when the first file is too small", async () => {
    const directory = await makeTempDirectory();
    const created: string[] = [];
    const requestTextCompletion = mock(async () => {
      const edge = created.length === 0 ? 8 : 96;
      const filePath = await createPortrait(directory, edge, edge);
      created.push(filePath);
      return filePath;
    });
    const service = new GenerateImageToolService({
      requestTextCompletion,
    } as unknown as ModelService);

    const result = await service.generate({
      aspectRatio: "1:1",
      imageSize: "1K",
      images: [{ name: "Retry", prompt: "A usable image." }],
      provider: "gemini",
      useFirstImageAsReference: false,
    });

    expect(requestTextCompletion).toHaveBeenCalledTimes(2);
    expect(result.images[0]?.filePath).toBe(created[1]);
    const tinyFile = created[0];
    if (tinyFile === undefined) {
      throw new Error("expected a rejected image");
    }
    expect(await fileExists(tinyFile)).toBe(false);
  });

  test("deletes earlier images when a later image fails", async () => {
    const directory = await makeTempDirectory();
    const created: string[] = [];
    const requestTextCompletion = mock(async () => {
      if (created.length > 0) {
        throw new Error("model down");
      }
      const filePath = await createPortrait(directory, 96, 128);
      created.push(filePath);
      return filePath;
    });
    const service = new GenerateImageToolService({
      requestTextCompletion,
    } as unknown as ModelService);

    const error = await service
      .generate({
        aspectRatio: "3:4",
        imageSize: "1K",
        images: [
          { name: "First", prompt: "A portrait." },
          { name: "Second", prompt: "Another portrait." },
        ],
        provider: "open-ai",
        useFirstImageAsReference: true,
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    if (!(error instanceof Error)) {
      throw new Error("expected image generation to fail");
    }
    expect(error.message).toContain("2 attempts");
    expect(requestTextCompletion).toHaveBeenCalledTimes(3);
    const firstPath = created[0];
    if (firstPath === undefined) {
      throw new Error("expected the first image to be created");
    }
    expect(await fileExists(firstPath)).toBe(false);
  });
});

describe("ResyncGameFrameworkAgentToolRegistry", () => {
  test("gives agents the generate-image tool", async () => {
    const directory = await makeTempDirectory();
    const requestTextCompletion = mock(async () =>
      createPortrait(directory, 96, 128),
    );
    const registry = new ResyncGameFrameworkAgentToolRegistry(
      { createTool: () => ({ id: AgentTool.ConsultProductNow }) } as never,
      new GenerateImageToolService({
        requestTextCompletion,
      } as unknown as ModelService),
      { createTool: () => ({ id: AgentTool.GenerateThreeDModel }) } as never,
      { createTool: () => ({ id: AgentTool.RecordProductNowLore }) } as never,
      { createTool: () => ({ id: AgentTool.GenerateAudio }) } as never,
    );

    enum SampleAgentTool {
      // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
      GenerateImage = AgentTool.GenerateImage,
    }

    const tools = registry.buildTools(SampleAgentTool);
    const tool = tools[SampleAgentTool.GenerateImage];
    if (
      tool === undefined ||
      !("execute" in tool) ||
      typeof tool.execute !== "function"
    ) {
      throw new Error("expected generate-image to be registered");
    }

    const result = (await tool.execute(
      {
        aspectRatio: "1:1",
        imageSize: "1K",
        images: [{ name: "Mark", prompt: "A small mark." }],
        provider: "gemini",
        useFirstImageAsReference: false,
      },
      {} as never,
    )) as { model?: string; provider?: string };

    expect(result.model).toBe(GENERATE_IMAGE_MODELS.gemini);
    expect(result.provider).toBe("gemini");
    expect(requestTextCompletion).toHaveBeenCalledTimes(1);
  });

  test("rejects an enum member that is not a catalog tool", () => {
    const registry = new ResyncGameFrameworkAgentToolRegistry(
      { createTool: () => ({ id: AgentTool.ConsultProductNow }) } as never,
      new GenerateImageToolService({
        requestTextCompletion: mock(async () => ""),
      } as unknown as ModelService),
      { createTool: () => ({ id: AgentTool.GenerateThreeDModel }) } as never,
      { createTool: () => ({ id: AgentTool.RecordProductNowLore }) } as never,
      { createTool: () => ({ id: AgentTool.GenerateAudio }) } as never,
    );

    enum SampleAgentTool {
      // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
      GenerateImage = AgentTool.GenerateImage,
      Missing = "not-a-tool",
    }

    let thrown: unknown;
    try {
      registry.buildTools(SampleAgentTool);
    } catch (error) {
      thrown = error;
    }

    expect(thrown instanceof Error).toBe(true);
    if (!(thrown instanceof Error)) {
      return;
    }
    expect(thrown.message).toBe("No tool is registered for Missing.");
  });
});

/**
 * @returns A temp directory removed after the test
 */
async function makeTempDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "generate-image-"));
  directories.push(directory);
  return directory;
}

/**
 * @param directory - Temp directory for the fake model output
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns Path to a PNG
 */
async function createPortrait(
  directory: string,
  width: number,
  height: number,
): Promise<string> {
  const filePath = join(directory, `${randomUUID()}.png`);
  await sharp({
    create: {
      background: { alpha: 1, b: 80, g: 40, r: 20 },
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
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
