import { describe, expect, test } from "bun:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type {
  AgentAssetGenerationStatus,
  AssetGenerationPayload,
  AudioGenerationPayload,
} from "@resync-game-framework/api";
import { AgentAssetGenerationService } from "../agentAssetGeneration.service";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

/**
 * Builds the service with small spies for each dispatch target.
 * @param status - Optional queue status returned by the polling stub
 * @returns Service under test and its captured dispatch call
 */
function createHarness(status?: AgentAssetGenerationStatus) {
  const calls: { kind?: string; payload?: unknown; target?: string } = {};
  const queue = {
    getStatus: async () => status,
  };
  const promptService = (target: string) => ({
    enqueue: async (payload: AssetGenerationPayload) => {
      calls.payload = payload;
      calls.target = target;
    },
  });
  const audio = {
    enqueue: async (payload: AudioGenerationPayload) => {
      calls.payload = payload;
      calls.target = "audio";
    },
  };
  const threeD = {
    start: async (payload: Record<string, unknown>) => {
      calls.kind = String(payload.kind);
      calls.payload = payload;
      calls.target = "three-d";
    },
  };
  return {
    calls,
    service: new AgentAssetGenerationService(
      queue as never,
      audio as never,
      promptService("battle-background") as never,
      promptService("card-character") as never,
      promptService("enemy") as never,
      promptService("playable-card") as never,
      promptService("sprite-sheet") as never,
      promptService("static-image") as never,
      threeD as never,
    ),
  };
}

describe("AgentAssetGenerationService", () => {
  test("creates an id and queues prompt-only assets without waiting", async () => {
    const { calls, service } = createHarness();

    const accepted = await service.enqueue({
      assetClass: "static-image",
      prompt: "A seamless moonlit stone texture",
    });

    expect(calls.target).toBe("static-image");
    expect(calls.payload).toEqual({
      generationId: accepted.jobId,
      prompt: "A seamless moonlit stone texture",
    });
    expect(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        accepted.jobId,
      ),
    ).toBe(true);
    expect(accepted.statusUrl).toBe(
      `/agent/assets/generations/${accepted.jobId}`,
    );
  });

  test("preserves audio options and a caller-supplied id", async () => {
    const { calls, service } = createHarness();

    const accepted = await service.enqueue({
      assetClass: "audio",
      cue: "battle",
      generationId: GENERATION_ID,
      loop: true,
      prompt: "Driving ritual drums",
      role: "music",
      useLore: false,
    });

    expect(accepted.jobId).toBe(GENERATION_ID);
    expect(calls.target).toBe("audio");
    expect(calls.payload).toEqual({
      cue: "battle",
      generationId: GENERATION_ID,
      loop: true,
      prompt: "Driving ritual drums",
      role: "music",
      useLore: false,
    });
  });

  test("maps each 3D asset class to the workshop kind", async () => {
    const { calls, service } = createHarness();

    await service.enqueue({
      assetClass: "three-d-character",
      generationId: GENERATION_ID,
      prompt: "A low-poly stone guardian",
      provider: "design",
      useLore: false,
    });

    expect(calls.target).toBe("three-d");
    expect(calls.kind).toBe("character");
  });

  test("rejects unsupported classes and expired job ids", async () => {
    const { service } = createHarness();

    expect(
      service.enqueue({
        assetClass: "video",
        prompt: "Not supported",
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(service.status(GENERATION_ID)).rejects.toThrow(NotFoundException);
  });

  test("rejects malformed prompt and audio option fields", async () => {
    const { service } = createHarness();

    expect(
      service.enqueue({
        assetClass: "static-image",
        prompt: 42,
      } as never),
    ).rejects.toThrow("Generation prompt must be a string");
    expect(
      service.enqueue({
        assetClass: "audio",
        cue: "opening",
        prompt: "A short sting",
      } as never),
    ).rejects.toThrow("Audio cue must be one of");
  });
});
