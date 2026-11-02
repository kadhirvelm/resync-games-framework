import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTool } from "@mastra/core/tools";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  AgentTool,
  AUDIO_CUE_SECONDS,
  AUDIO_CUES,
  AUDIO_ROLES,
} from "@towers-of-coreborn/api";
import { ElevenLabsClient } from "src/asset-classes/audio/elevenLabsClient";
import { z } from "zod";

const generateAudioInputSchema = z.object({
  cue: z
    .enum(AUDIO_CUES)
    .describe(
      "Where the clip plays: attack, room, camp, battle, boss, victory, defeat, or reward.",
    ),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe(
      "Sound-design prompt for ElevenLabs. Describe materials, space, and gesture. No vocals.",
    ),
  role: z
    .enum(AUDIO_ROLES)
    .describe(
      "effect for a one-shot, ambience for a room loop, music for an instrumental bed.",
    ),
  title: z.string().trim().min(1).max(60).describe("Short display name."),
});

const generateAudioOutputSchema = z.object({
  cue: z.enum(AUDIO_CUES),
  design: z.string(),
  durationSeconds: z.number(),
  filePath: z.string(),
  loop: z.boolean(),
  role: z.enum(AUDIO_ROLES),
  title: z.string(),
});

/**
 * Shared registry tool that renders one clip with ElevenLabs and leaves the
 * mp3 in a temp file for the audio agent to publish.
 */
@Injectable()
export class GenerateAudioToolService {
  public constructor(private readonly elevenLabs: ElevenLabsClient) {}

  /**
   * @returns The shared Mastra generate-audio tool
   */
  public createTool() {
    return createTool({
      description:
        "Render one game audio clip with ElevenLabs. Call it once per asset. Effects and ambience are sound effects; music is an instrumental bed with no vocals.",
      execute: async (
        input: z.infer<typeof generateAudioInputSchema>,
        context,
      ) => {
        try {
          const rendered = await this.elevenLabs.generate(
            {
              cue: input.cue,
              prompt: input.prompt,
              role: input.role,
            },
            context?.abortSignal,
          );
          const filePath = join(tmpdir(), `toc-audio-${randomUUID()}.mp3`);
          await writeFile(filePath, rendered.bytes);
          return {
            cue: input.cue,
            design: input.prompt,
            durationSeconds: AUDIO_CUE_SECONDS[input.cue],
            filePath,
            loop: input.role !== "effect",
            role: input.role,
            title: input.title,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new InternalServerErrorException(message);
        }
      },
      id: AgentTool.GenerateAudio,
      inputSchema: generateAudioInputSchema,
      outputSchema: generateAudioOutputSchema,
    });
  }
}
