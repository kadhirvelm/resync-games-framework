import { Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  AgentTool,
  AUDIO_CUE_SECONDS,
  AUDIO_CUES,
  AUDIO_ROLES,
  type AudioCue,
  type AudioRole,
} from "@resync-game-framework/api";
import {
  AudioAssetWriter,
  deleteAudioFile,
} from "src/asset-classes/audio/audioAssetWriter";
import { AUDIO_AGENT_INSTRUCTIONS } from "src/asset-classes/audio/audioPrompt";
import { AUDIO_STORAGE } from "src/asset-classes/audio/audioStorage";
import { ElevenLabsClient } from "src/asset-classes/audio/elevenLabsClient";
import { readAudioClip } from "src/asset-classes/audio/readAudioClips";
import { ConfigurationService } from "src/configuration/configuration.service";
import { ResyncGameFrameworkAgentService } from "src/mastra/shared/resyncGameFrameworkAgent.service";
import { z } from "zod";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";
import { throwIfAborted } from "../generationCancelled";
import type { QueryableAgent } from "../queryableAgent";

/**
 * Registered tools this agent calls.
 * Add a member, set to an {@link AgentTool} value, to give the agent that tool.
 */
export enum AudioAgentTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  ConsultProductNow = AgentTool.ConsultProductNow,
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateAudio = AgentTool.GenerateAudio,
}

/** Tool set for batch renders that deliberately do not use workspace lore. */
enum AudioRenderTool {
  // biome-ignore lint/style/useLiteralEnumMembers: value is the shared AgentTool id
  GenerateAudio = AgentTool.GenerateAudio,
}

/** Consult ProductNow, then render. Four steps covers both calls and a reply. */
const AUDIO_COORDINATOR_STEPS = 4;

const generatedAudioSchema = z.object({
  cue: z.enum(AUDIO_CUES),
  design: z.string().trim().min(1),
  durationSeconds: z.number().positive(),
  filePath: z.string().trim().min(1),
  loop: z.boolean(),
  role: z.enum(AUDIO_ROLES),
  title: z.string().trim().min(1).max(60),
});

/** Input for one audio query. */
export interface AudioAgentInput {
  /** Where the clip plays, when the caller already knows */
  cue?: AudioCue;
  /** Client id used to stop this run and to name the stored folder */
  generationId: string;
  /** Whether the file should loop, when the caller already knows */
  loop?: boolean;
  /** Natural-language description of the clip */
  prompt: string;
  /** Effect, ambience, or music, when the caller already knows */
  role?: AudioRole;
  /** Whether ProductNow lore may be consulted. Defaults to true. */
  useLore?: boolean;
}

/** Result of one audio query. */
export interface AudioAgentResult {
  /** Folder name of the stored clip */
  id: string;
  /** The agent's closing text */
  summary: string;
}

/**
 * Audio agent. Call {@link AudioAgent.query} with a sound request.
 * It passes {@link AudioAgentTool} to the agent runner, which loads
 * `consult-productnow` and `generate-audio`. The model writes one
 * ElevenLabs prompt, and this service stores the mp3.
 */
@Injectable()
export class AudioAgent
  implements QueryableAgent<AudioAgentInput, AudioAgentResult>
{
  public constructor(
    private readonly agents: ResyncGameFrameworkAgentService,
    private readonly writer: AudioAssetWriter,
    private readonly elevenLabs: ElevenLabsClient,
    private readonly configurationService: ConfigurationService,
    private readonly generationAbort: GenerationAbortCoordinator,
  ) {}

  /**
   * Stops an in-flight audio generation on whichever process is running it.
   * @param generationId - Id passed to {@link AudioAgent.query}
   * @returns Whether the stop was recorded
   */
  public abort(generationId: string): Promise<boolean> {
    return this.generationAbort.stop(generationId);
  }

  /**
   * Generates and stores one clip.
   * A finished asset with this id is returned without calling the provider again.
   * @param input - The request and the id that can stop it
   * @returns Stored clip id and the agent's summary
   * @throws InternalServerErrorException when ElevenLabs is not configured or the tool result cannot be stored
   */
  public async query(input: AudioAgentInput): Promise<AudioAgentResult> {
    const existing = await readAudioClip(
      AUDIO_STORAGE.rootPath(),
      input.generationId,
      AUDIO_STORAGE.publicUrl(this.configurationService.get("BACKEND_API_URL")),
    );
    if (existing) {
      return { id: existing.id, summary: existing.design };
    }
    if (!this.elevenLabs.configured()) {
      throw new InternalServerErrorException(
        "ELEVENLABS_API_KEY is not set. Add it to the backend environment to generate audio.",
      );
    }
    return this.generationAbort.run(input.generationId, async (signal) => {
      let toolOutput: unknown;
      try {
        const useLore = input.useLore !== false;
        const result = await this.agents.runGenerationCoordinator({
          abortSignal: signal,
          agentId: "audio-generation-agent",
          instructions: AUDIO_AGENT_INSTRUCTIONS,
          maxSteps: AUDIO_COORDINATOR_STEPS,
          outputLabel: "Audio generation",
          prompt: agentPrompt(input),
          readToolOutput: (raw) => raw,
          supportingToolIds: useLore
            ? [AudioAgentTool.ConsultProductNow]
            : undefined,
          toolId: AudioAgentTool.GenerateAudio,
          tools: useLore ? AudioAgentTool : AudioRenderTool,
        });
        toolOutput = result.toolOutput;
        throwIfAborted(signal);
        const audio = readGeneratedAudio(toolOutput);
        requireRequestedShape(input, audio);
        const saved = await this.writer.save({
          audio,
          id: input.generationId,
          sourcePrompt: input.prompt,
        });
        return { id: saved.id, summary: result.text };
      } catch (error) {
        await deleteAudioFile(filePathOf(toolOutput));
        throw error;
      }
    });
  }
}

/**
 * @param input - Caller constraints plus the creative request
 * @returns The user message, with role and cue pinned when the caller set them
 */
function agentPrompt(input: AudioAgentInput): string {
  const lines = ["Create one game audio asset."];
  if (input.role !== undefined) {
    lines.push(`Role: ${input.role}`);
  }
  if (input.cue !== undefined) {
    lines.push(`Cue: ${input.cue}`);
  }
  if (input.loop !== undefined) {
    lines.push(`Loop: ${input.loop ? "yes" : "no"}`);
  }
  lines.push(
    `Lore lookup: ${input.useLore === false ? "disabled" : "allowed"}`,
  );
  if (input.cue !== undefined) {
    lines.push(`Duration seconds: ${AUDIO_CUE_SECONDS[input.cue]}`);
  }
  lines.push("", "Request:", input.prompt);
  return lines.join("\n");
}

/**
 * @param rawResult - Value returned by the generate-audio tool
 * @returns The temp file and the clip's labels
 * @throws InternalServerErrorException when the tool result is incomplete
 */
function readGeneratedAudio(rawResult: unknown) {
  const parsed = generatedAudioSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new InternalServerErrorException(
      "Audio generation failed: generate-audio must return one titled clip.",
    );
  }
  return parsed.data;
}

/**
 * Keeps a dungeon slot from being filled with a different kind of clip.
 * @param input - What the caller asked for
 * @param audio - What the tool returned
 * @throws InternalServerErrorException when the tool changed the role, cue, or loop
 */
function requireRequestedShape(
  input: AudioAgentInput,
  audio: z.infer<typeof generatedAudioSchema>,
): void {
  if (input.role !== undefined && audio.role !== input.role) {
    throw new InternalServerErrorException(
      `Audio generation returned a ${audio.role} clip. This slot needs a ${input.role} clip.`,
    );
  }
  if (input.cue !== undefined && audio.cue !== input.cue) {
    throw new InternalServerErrorException(
      `Audio generation returned a ${audio.cue} clip. This slot needs a ${input.cue} clip.`,
    );
  }
  if (input.loop !== undefined && audio.loop !== input.loop) {
    throw new InternalServerErrorException(
      `Audio generation returned a ${audio.loop ? "looping" : "one-shot"} clip. This slot needs the other.`,
    );
  }
}

/**
 * @param toolOutput - Tool result, which may be missing when the run failed first
 * @returns The temp path, or an empty string when there is nothing to delete
 */
function filePathOf(toolOutput: unknown): string {
  if (typeof toolOutput !== "object" || toolOutput === null) {
    return "";
  }
  const path = (toolOutput as { filePath?: unknown }).filePath;
  return typeof path === "string" ? path : "";
}
