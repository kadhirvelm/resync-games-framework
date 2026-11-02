import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import type { AssetClassStorage } from "src/asset-classes/shared/assetClassStorage";
import { MockRedisService } from "src/infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "src/infra/redis/redis.service";
import { buildPublicAssetUrlPath } from "src/library/publicAssetsRoot";
import { GenerationCancelledException } from "src/mastra/agents/generationCancelled";
import { DungeonService } from "../dungeon.service";
import { DungeonAssetLookup } from "../dungeonAssetLookup";
import { readStoredDungeonBlueprint } from "../dungeonBlueprint";
import { DungeonBlueprintStore } from "../dungeonBlueprintStore";
import { DungeonInFlightStore } from "../dungeonInFlightStore";

const SLOT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CARD_SLOT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ASSET_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

let root: string | undefined;

afterEach(async () => {
  if (root !== undefined) {
    await rm(root, { force: true, recursive: true });
    root = undefined;
  }
});

describe("DungeonService", () => {
  test("saves a planned package as JSON", async () => {
    const { service } = await createService({
      plan: async () => ({
        slots: [
          {
            id: SLOT_ID,
            kind: "enemy" as const,
            prompt: "A moss bell that hunts by sound",
            title: "Moss bell",
          },
        ],
        summary: "A drowned belfry.",
      }),
    });

    const blueprint = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );

    expect(blueprint.summary).toBe("A drowned belfry.");
    expect(blueprint.slots[0]?.status).toBe("planned");
    expect(blueprint.slots[0]?.prompt).toBe("A moss bell that hunts by sound");
    expect(blueprint.jsonUrl.endsWith("/dungeon.json")).toBe(true);
    const stored = await readStoredDungeonBlueprint(root ?? "", blueprint.id);
    expect(stored?.prompt).toBe("A drowned bell tower");
  });

  test("runs one slot, records it in Redis, and writes the asset id", async () => {
    const enemyQuery = mock(async () => ({ id: ASSET_ID, summary: "beast" }));
    const { inflight, service } = await createService({ enemyQuery });
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );
    const slotId = planned.slots[0]?.id;
    if (slotId === undefined) {
      throw new Error("Planned package has no slot.");
    }
    let seenWhileRunning = 0;
    enemyQuery.mockImplementation(async () => {
      seenWhileRunning = (await inflight.list()).length;
      return { id: ASSET_ID, summary: "beast" };
    });

    const filled = await service.generateSlot(
      {
        dungeonId: planned.id,
        generationId: "11111111-1111-4111-8111-111111111111",
        slotId,
      },
      "session-1",
    );

    expect(seenWhileRunning).toBe(1);
    expect(filled.slots[0]?.status).toBe("ready");
    expect(filled.slots[0]?.assetId).toBe(ASSET_ID);
    expect(filled.slots[0]?.preview?.title).toBe("Moss bell");
    expect(await inflight.list()).toEqual([]);
    expect(enemyQuery).toHaveBeenCalledTimes(1);
  });

  test("runs a slot through the durable queue handler", async () => {
    const { queueCalls, service } = await createService({ withQueue: true });
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );

    const filled = await service.generateSlot(
      {
        dungeonId: planned.id,
        generationId: "11111111-1111-4111-8111-111111111111",
        slotId: planned.slots[0]?.id ?? "",
      },
      "session-1",
    );

    expect(queueCalls()).toBe(1);
    expect(filled.slots[0]?.status).toBe("ready");
    expect(filled.slots[0]?.assetId).toBe(ASSET_ID);
  });

  test("associates an existing asset into the package file", async () => {
    const { service } = await createService();
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );
    const slotId = planned.slots[0]?.id ?? "";

    const linked = await service.associate({
      assetId: ASSET_ID,
      dungeonId: planned.id,
      slotId,
    });

    expect(linked.slots[0]?.status).toBe("ready");
    expect(linked.slots[0]?.assetId).toBe(ASSET_ID);
    const stored = await readStoredDungeonBlueprint(root ?? "", planned.id);
    expect(stored?.slots[0]?.assetId).toBe(ASSET_ID);
  });

  test("leaves a later card planned when the previous level is not ready", async () => {
    const { service } = await createService({
      plan: async () => ({
        slots: [
          {
            characterSlotId: SLOT_ID,
            id: CARD_SLOT_ID,
            kind: "playable-card" as const,
            level: 2,
            prompt: "The same bell strike, harder",
            title: "Bell strike II",
          },
        ],
        summary: "Cards only.",
      }),
      progressionFor: async () => {
        throw new BadRequestException(
          "Attach or generate level 1 before level 2.",
        );
      },
    });
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );

    const error = await service
      .generateSlot(
        {
          dungeonId: planned.id,
          generationId: "11111111-1111-4111-8111-111111111111",
          slotId: CARD_SLOT_ID,
        },
        "session-1",
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof BadRequestException).toBe(true);
    const stored = await readStoredDungeonBlueprint(root ?? "", planned.id);
    expect(stored?.slots[0]?.status).toBe("planned");
  });

  test("returns a stopped slot to planned and clears Redis", async () => {
    const { inflight, service } = await createService({
      enemyQuery: async () => {
        throw new GenerationCancelledException();
      },
    });
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );
    const slotId = planned.slots[0]?.id ?? "";

    const error = await service
      .generateSlot(
        {
          dungeonId: planned.id,
          generationId: "11111111-1111-4111-8111-111111111111",
          slotId,
        },
        "session-1",
      )
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    expect(error instanceof GenerationCancelledException).toBe(true);
    expect(await inflight.list()).toEqual([]);
    const stored = await readStoredDungeonBlueprint(root ?? "", planned.id);
    expect(stored?.slots[0]?.status).toBe("planned");
    expect(stored?.slots[0]?.generationId).toBeUndefined();
  });

  test("fails a generating slot that has no Redis run", async () => {
    const { service } = await createService({
      plan: async () => ({
        slots: [
          {
            id: SLOT_ID,
            kind: "enemy" as const,
            prompt: "A moss bell",
            title: "Moss bell",
          },
        ],
        summary: "One enemy.",
      }),
    });
    const planned = await service.generate(
      { generationId: GENERATION_ID, prompt: "A drowned bell tower" },
      "session-1",
    );
    const stored = await readStoredDungeonBlueprint(root ?? "", planned.id);
    if (stored === undefined) {
      throw new Error("Package was not written.");
    }
    const slot = stored.slots[0];
    if (slot === undefined) {
      throw new Error("Package has no slot.");
    }
    stored.slots[0] = {
      ...slot,
      generationId: "11111111-1111-4111-8111-111111111111",
      status: "generating",
    };
    const { writeStoredDungeonBlueprint } = await import("../dungeonBlueprint");
    await writeStoredDungeonBlueprint(root ?? "", stored);

    const listed = await service.list();

    expect(listed.dungeons[0]?.slots[0]?.status).toBe("failed");
    expect(listed.dungeons[0]?.slots[0]?.error).toBe(
      "Generation stopped before it finished.",
    );
  });
});

/**
 * Builds a dungeon service against a temporary package folder.
 * @param options - Stand-ins for the planner, agents, and asset lookup
 * @returns The service and its Redis flight store
 */
async function createService(options?: {
  enemyQuery?: (input: { generationId: string; prompt: string }) => Promise<{
    id: string;
    summary: string;
  }>;
  plan?: () => Promise<{
    slots: Array<{
      characterSlotId?: string;
      id: string;
      kind: "enemy" | "playable-card";
      level?: number;
      prompt: string;
      title: string;
    }>;
    summary: string;
  }>;
  progressionFor?: () => Promise<undefined>;
  withQueue?: boolean;
}) {
  root = await mkdtemp(join(tmpdir(), "dungeon-service-"));
  const redis = new MockRedisService();
  const inflight = new DungeonInFlightStore(redis as unknown as RedisService);
  const plan =
    options?.plan ??
    (async () => ({
      slots: [
        {
          id: SLOT_ID,
          kind: "enemy" as const,
          prompt: "A moss bell that hunts by sound",
          title: "Moss bell",
        },
      ],
      summary: "A drowned belfry.",
    }));
  const assets = {
    progressionFor: options?.progressionFor ?? (async () => undefined),
    read: async () => ({
      preview: {
        imageUrl: "http://localhost:3001/static/enemies/enemy.webp",
        subtitle: "12 HP",
        title: "Moss bell",
      },
    }),
  } as unknown as DungeonAssetLookup;
  const slotGenerator = {
    abort: async () => false,
    generate: async (input: { generationId: string; prompt: string }) => {
      const result = await (
        options?.enemyQuery ?? (async () => ({ id: ASSET_ID, summary: "" }))
      )({
        generationId: input.generationId,
        prompt: input.prompt,
      });
      return result.id;
    },
    prepare: async (
      slot: {
        kind: string;
        prompt: string;
      },
      slots: unknown[],
    ) => ({
      progression: await assets.progressionFor(slot as never, slots as never),
      prompt: slot.prompt,
      slot,
    }),
  };
  const configuration = { get: () => "http://localhost:3001" };
  const blueprints = new DungeonBlueprintStore(
    configuration as never,
    redis as unknown as RedisService,
    assets,
    storageAt(root),
  );
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  let queued = 0;
  const generationQueue = options?.withQueue
    ? {
        cancel: async () => false,
        enqueueAndWait: async (
          name: string,
          _generationId: string,
          payload: unknown,
        ) => {
          queued += 1;
          const handler = handlers.get(name);
          if (!handler) throw new Error(`Missing queue handler ${name}`);
          return handler(payload);
        },
        isInProgress: async () => false,
        register: (
          name: string,
          handler: (payload: unknown) => Promise<unknown>,
        ) => {
          handlers.set(name, handler);
        },
      }
    : undefined;
  const service = new DungeonService(
    { abort: async () => true, query: plan } as never,
    slotGenerator as never,
    inflight,
    assets,
    blueprints,
    generationQueue as never,
  );
  service.onModuleInit();
  return { inflight, queueCalls: () => queued, service };
}

/**
 * @param directory - Temporary package root
 * @returns Storage helpers pointed at that directory
 */
function storageAt(directory: string): AssetClassStorage {
  return {
    directoryName: "dungeons",
    filePath: (...segments) => join(directory, ...segments),
    publicPath: (...segments) =>
      buildPublicAssetUrlPath("dungeons", ...segments),
    publicUrl: (backendBaseUrl, ...segments) =>
      `${backendBaseUrl.replace(/\/$/, "")}${buildPublicAssetUrlPath("dungeons", ...segments)}`,
    rootPath: () => directory,
  };
}
