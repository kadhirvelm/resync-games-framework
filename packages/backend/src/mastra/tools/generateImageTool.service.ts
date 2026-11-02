import { readFile, unlink } from "node:fs/promises";
import { extname } from "node:path";
import { createTool } from "@mastra/core/tools";
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { AgentTool } from "@resync-game-framework/api";
import sharp from "sharp";
import {
  GenerationCancelledException,
  isGenerationAbort,
  throwIfAborted,
} from "src/mastra/agents/generationCancelled";
import { ModelService } from "src/model/model.service";
import type {
  ImageGenerationConfig,
  InputFile,
} from "src/model/types/modelRequestTypes";
import { z } from "zod";

/** Image models the generate-image tool calls. The agent picks the provider, not the model id. */
export const GENERATE_IMAGE_MODELS = {
  gemini: "gemini-3-pro-image",
  "open-ai": "gpt-image-2.5-sunburst",
} as const;

const IMAGE_PROVIDERS = ["gemini", "open-ai"] as const;
const ASPECT_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"] as const;
const IMAGE_SIZES = ["1K", "2K"] as const;

type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

/** Attempts per image when the model returns an unusable file. */
const MAX_IMAGE_ATTEMPTS = 2;

const MIN_IMAGE_EDGE_PX = 64;

const MAX_IMAGES_PER_CALL = 8;

const imageRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).describe("Short name for this image."),
  notes: z
    .string()
    .trim()
    .min(1)
    .max(800)
    .optional()
    .describe("What this image shows. Required for card-character stages."),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(8000)
    .describe("Full prompt for this image."),
});

const generateImageInputSchema = z.object({
  aspectRatio: z
    .enum(ASPECT_RATIOS)
    .describe("Width-to-height ratio of every image in this call."),
  imageSize: z
    .enum(IMAGE_SIZES)
    .describe("Size class for every image in this call."),
  images: z
    .array(imageRequestSchema)
    .min(1)
    .max(MAX_IMAGES_PER_CALL)
    .describe("Images to generate, in order."),
  provider: z
    .enum(IMAGE_PROVIDERS)
    .describe(
      "Which image model to call. `open-ai` uses GPT Image. `gemini` uses Gemini image generation.",
    ),
  theme: z
    .string()
    .trim()
    .min(1)
    .max(600)
    .optional()
    .describe("Shared visual theme when these images belong to one set."),
  useFirstImageAsReference: z
    .boolean()
    .describe(
      "When true and more than one image is requested, every later image is edited from the first so the subject stays the same.",
    ),
});

const generatedImageSchema = z.object({
  filePath: z.string(),
  name: z.string(),
  notes: z.string(),
});

const generateImageOutputSchema = z.object({
  aspectRatio: z.enum(ASPECT_RATIOS),
  imageSize: z.enum(IMAGE_SIZES),
  images: z.array(generatedImageSchema),
  model: z.string(),
  provider: z.enum(IMAGE_PROVIDERS),
  theme: z.string(),
  usedFirstImageAsReference: z.boolean(),
});

type GenerateImageInput = z.infer<typeof generateImageInputSchema>;

/**
 * One image returned by the generate-image tool.
 */
export interface GeneratedImage {
  filePath: string;
  name: string;
  notes: string;
}

/**
 * Result of one generate-image tool call.
 */
export type GenerateImageResult = z.infer<typeof generateImageOutputSchema>;

interface ImageAttempt {
  abortSignal?: AbortSignal;
  imageConfig: ImageGenerationConfig;
  prompt: string;
  provider: ImageProvider;
  referenceFilePath?: string;
}

/**
 * Mastra tool that paints images by calling Gemini or OpenAI.
 * One call can paint several images. Later images can reuse the first as a reference.
 */
@Injectable()
export class GenerateImageToolService {
  private readonly logger = new Logger(GenerateImageToolService.name);

  public constructor(private readonly modelService: ModelService) {}

  /**
   * Tool definition registered for {@link AgentTool.GenerateImage}.
   * @returns The Mastra tool agents call to generate images
   */
  public createTool() {
    return createTool({
      description:
        "Generate one or more images with Gemini or OpenAI. Set provider to `gemini` or `open-ai`. When useFirstImageAsReference is true, images after the first keep the subject of the first image.",
      execute: async (
        input: GenerateImageInput,
        context?: { abortSignal?: AbortSignal },
      ) => {
        return this.generate(input, context?.abortSignal);
      },
      id: AgentTool.GenerateImage,
      inputSchema: generateImageInputSchema,
      outputSchema: generateImageOutputSchema,
    });
  }

  /**
   * Paints every requested image, in order, through the chosen provider.
   * @param input - Provider, size, and the prompts to paint
   * @param abortSignal - Stops painting when the caller aborts the generation
   * @returns The generated files plus the provider and model that painted them
   * @throws GenerationCancelledException when the caller aborts the generation
   * @throws InternalServerErrorException when an image is still unusable after retries
   */
  public async generate(
    input: GenerateImageInput,
    abortSignal?: AbortSignal,
  ): Promise<GenerateImageResult> {
    const created: string[] = [];

    try {
      const images = await this.generateImages(input, created, abortSignal);
      return {
        aspectRatio: input.aspectRatio,
        imageSize: input.imageSize,
        images,
        model: GENERATE_IMAGE_MODELS[input.provider],
        provider: input.provider,
        theme: input.theme ?? "",
        usedFirstImageAsReference:
          input.useFirstImageAsReference && images.length > 1,
      };
    } catch (error) {
      await deleteImageFiles(created);
      throw error;
    }
  }

  /**
   * @param input - The tool input
   * @param created - File paths to delete if a later image fails
   * @returns Generated images in request order
   */
  private async generateImages(
    input: GenerateImageInput,
    created: string[],
    abortSignal?: AbortSignal,
  ): Promise<GeneratedImage[]> {
    const images: GeneratedImage[] = [];
    let referenceFilePath: string | undefined;
    const imageConfig: ImageGenerationConfig = {
      aspectRatio: input.aspectRatio,
      imageSize: input.imageSize,
    };

    for (const image of input.images) {
      throwIfAborted(abortSignal);
      const filePath = await this.generateWithRetries({
        abortSignal,
        imageConfig,
        prompt: image.prompt,
        provider: input.provider,
        referenceFilePath,
      });
      created.push(filePath);
      if (input.useFirstImageAsReference && referenceFilePath === undefined) {
        referenceFilePath = filePath;
      }
      images.push({
        filePath,
        name: image.name,
        notes: image.notes ?? "",
      });
    }

    return images;
  }

  /**
   * Generates one image, retrying when the file is missing or too small.
   * @param attempt - Prompt, provider, and optional reference
   * @returns Path of a usable image file
   */
  private async generateWithRetries(attempt: ImageAttempt): Promise<string> {
    let lastError: unknown;

    for (let tryNumber = 1; tryNumber <= MAX_IMAGE_ATTEMPTS; tryNumber += 1) {
      throwIfAborted(attempt.abortSignal);
      const result = await this.tryGenerateImage(attempt, lastError);
      if (result.filePath !== undefined) {
        return result.filePath;
      }
      if (isGenerationAbort(result.error, attempt.abortSignal)) {
        throw new GenerationCancelledException();
      }
      lastError = result.error;
      this.logger.warn(
        `Image generation attempt ${tryNumber} failed: ${formatError(lastError)}`,
      );
    }

    throw new InternalServerErrorException(
      `Image generation failed after ${MAX_IMAGE_ATTEMPTS} attempts: ${formatError(lastError)}`,
    );
  }

  /**
   * One provider call. Deletes the file when this attempt cannot be used.
   * @param attempt - Prompt, provider, and optional reference
   * @param previousError - Failure from the prior attempt
   * @returns The saved path, or the error from this attempt
   */
  private async tryGenerateImage(
    attempt: ImageAttempt,
    previousError: unknown,
  ): Promise<{ error?: unknown; filePath?: string }> {
    let generatedPath: string | undefined;

    try {
      generatedPath = await this.requestImage(attempt, previousError);
      await assertUsableImage(generatedPath);
      const filePath = generatedPath;
      generatedPath = undefined;
      return { filePath };
    } catch (error) {
      return { error };
    } finally {
      if (generatedPath !== undefined) {
        await unlink(generatedPath).catch(() => undefined);
      }
    }
  }

  /**
   * Calls Gemini or OpenAI for one image.
   * @param attempt - Prompt, provider, and optional reference file
   * @param previousError - Failure to mention when retrying
   * @returns Temp file path returned by the provider
   */
  private async requestImage(
    attempt: ImageAttempt,
    previousError: unknown,
  ): Promise<string> {
    const prompt = appendRetryNote(attempt.prompt, previousError);
    const reference = await readReferenceImage(attempt.referenceFilePath);
    const inputFiles = reference === undefined ? undefined : [reference];

    if (attempt.provider === "gemini") {
      return this.modelService.requestTextCompletion({
        ...(inputFiles === undefined ? {} : { inputFiles }),
        abortSignal: attempt.abortSignal,
        imageConfig: attempt.imageConfig,
        model: GENERATE_IMAGE_MODELS.gemini,
        prompt,
        schema: "image",
        type: "gemini",
      });
    }

    return this.modelService.requestTextCompletion({
      ...(inputFiles === undefined ? {} : { inputFiles }),
      abortSignal: attempt.abortSignal,
      imageConfig: attempt.imageConfig,
      model: GENERATE_IMAGE_MODELS["open-ai"],
      prompt,
      schema: "image",
      type: "open-ai",
    });
  }
}

/**
 * Deletes generated image files, ignoring paths that are already gone.
 * @param filePaths - Absolute paths returned by the image tool
 */
export async function deleteImageFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map((filePath) => unlink(filePath).catch(() => undefined)),
  );
}

/**
 * Reads `images[].filePath` from a generate-image tool result.
 * @param raw - Value the tool returned, or any other tool payload
 * @returns Absolute paths that should be deleted when the caller rejects the result
 */
export function collectImageFilePaths(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null || !("images" in raw)) {
    return [];
  }

  const { images } = raw;
  if (!Array.isArray(images)) {
    return [];
  }

  const paths: string[] = [];
  for (const image of images) {
    if (typeof image !== "object" || image === null || !("filePath" in image)) {
      continue;
    }
    const { filePath } = image;
    if (typeof filePath !== "string" || filePath.trim() === "") {
      continue;
    }
    paths.push(filePath);
  }
  return paths;
}

/**
 * @param filePath - Image written by the model
 * @throws InternalServerErrorException when the file is missing or smaller than the minimum edge
 */
async function assertUsableImage(filePath: string): Promise<void> {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < MIN_IMAGE_EDGE_PX || height < MIN_IMAGE_EDGE_PX) {
    throw new InternalServerErrorException(
      `Generated image was ${width}x${height}, below ${MIN_IMAGE_EDGE_PX}px.`,
    );
  }
}

/**
 * @param filePath - Reference image from an earlier image in this call
 * @returns Inline image for the provider, or undefined when this image has no reference
 */
async function readReferenceImage(
  filePath: string | undefined,
): Promise<InputFile | undefined> {
  if (filePath === undefined) {
    return undefined;
  }

  const bytes = await readFile(filePath);
  return {
    base64: bytes.toString("base64"),
    description:
      "Reference image. Keep the same subject, and change only what the new prompt asks for.",
    mimeType: mimeTypeForImage(filePath),
  };
}

/**
 * @param filePath - Path whose extension selects the mime type
 * @returns Mime type for a reference upload
 */
function mimeTypeForImage(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

/**
 * @param prompt - The caller's image prompt
 * @param previousError - Failure from the prior attempt
 * @returns The prompt, with a retry note appended when there was a prior failure
 */
function appendRetryNote(prompt: string, previousError: unknown): string {
  if (previousError === undefined) {
    return prompt;
  }
  return `${prompt}\n\nThe previous attempt failed (${formatError(previousError)}). Fix that problem and generate the image again.`;
}

/**
 * @param error - Thrown value from a model or file call
 * @returns A single-line message
 */
function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
