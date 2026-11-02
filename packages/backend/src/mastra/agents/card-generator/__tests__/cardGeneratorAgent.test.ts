import { afterEach, describe, expect, mock, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentTool } from "@resync-game-framework/api";
import sharp from "sharp";
import { LORE_DOCUMENT_ID } from "src/asset-classes/playable-card/playableCardSpec";
import { PLAYABLE_CARD_STORAGE } from "src/asset-classes/playable-card/playableCardStorage";
import {
  SEARCH_LORE_TOOL_ID,
  SUBMIT_PLAYABLE_CARD_TOOL_ID,
} from "src/asset-classes/playable-card/playableCardTools";
import { readPlayableCard } from "src/asset-classes/playable-card/readPlayableCards";
import { MockRedisService } from "src/infra/redis/__tests__/mockRedis.module";
import type { RedisService } from "src/infra/redis/redis.service";
import { ProductNowMcpService } from "src/product-now-mcp/product-now-mcp.service";
import { GenerationAbortCoordinator } from "../../generationAbort.coordinator";
import { GenerationCancelledException } from "../../generationCancelled";
import { CardGeneratorAgent } from "../cardGeneratorAgent";

const GENERATION_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

const loreExcerpt =
  "The earliest recorded Coreborn bond belongs to Licensed Climber Tamsin Korr on floor 4.";

const validCard = {
  aetherCost: 2,
  description:
    "Tamsin Korr weakened a newly condensed Coreborn on floor 4, and the bond held after the Trial window closed.",
  effects: [
    {
      amount: 8,
      chainsFrom: "",
      kind: "attack",
      text: "Deal 8 damage to one enemy.",
    },
  ],
  name: "Korr's First Bond",
  scene: "A climber kneeling beside a condensing spirit of vines on stone.",
};

describe("CardGeneratorAgent", () => {
  const savedCardIds: string[] = [];

  afterEach(async () => {
    for (const cardId of savedCardIds.splice(0)) {
      await rm(PLAYABLE_CARD_STORAGE.filePath(cardId), {
        force: true,
        recursive: true,
      });
    }
  });

  test("searches the Lore document, then saves the card from generate-image", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "playable-card-image-"));
    const portraitPath = await createPortrait(tempDirectory, 96, 128);
    const searchArguments: unknown[] = [];
    const callTool = mock(
      async (_sessionId: string, name: string, args: unknown) => {
        expect(name).toBe("search");
        searchArguments.push(args);
        return loreEnvelope();
      },
    );
    const runChatWithTools = mock(async (input: ChatInput) => {
      expect(input.tools[AgentTool.ConsultProductNow]).toBeDefined();
      expect(input.tools[AgentTool.GenerateImage]).toBeDefined();
      expect(input.tools[SEARCH_LORE_TOOL_ID]).toBeDefined();
      expect(input.tools[SUBMIT_PLAYABLE_CARD_TOOL_ID]).toBeDefined();
      expect(input.agentConfig.instructions).toContain("`consult-productnow`");
      expect(input.agentConfig.instructions).toContain(
        "`ff1b04a0-b440-4746-9a1a-cd25fba0c32b`",
      );
      expect(input.agentConfig.instructions).toContain("`generate-image`");
      expect(input.agentConfig.instructions).toContain("Watercolor on paper");
      expect(input.prompt).toContain("first Coreborn bond");

      await requireTool(input.tools, SEARCH_LORE_TOOL_ID).execute(
        { query: "Coreborn bond" },
        {},
      );
      const submitted = await requireTool(
        input.tools,
        SUBMIT_PLAYABLE_CARD_TOOL_ID,
      ).execute(validCard, {});
      expect(submitted).toEqual({ accepted: true, message: "Card accepted." });

      return imageChat(portraitPath);
    });

    try {
      const agent = new CardGeneratorAgent(
        agentService(runChatWithTools),
        { callTool } as unknown as ProductNowMcpService,
        idleAbort() as unknown as GenerationAbortCoordinator,
      );
      const { cardId } = await agent.query({
        generationId: GENERATION_ID,
        prompt: "a card about the first Coreborn bond",
        sessionId: "session-1",
      });
      savedCardIds.push(cardId);

      expect(searchArguments).toEqual([
        {
          folderId: "e12d636b-aaa5-4b8e-b8a9-9a5b3d840dba",
          query: "Coreborn bond",
          resultType: "documents",
          searchScope: "workspace",
        },
      ]);
      const card = await readPlayableCard(
        PLAYABLE_CARD_STORAGE.rootPath(),
        cardId,
        "https://backend.test/static/playable-cards",
      );
      expect(card?.name).toBe("Korr's First Bond");
      expect(card?.aetherCost).toBe(2);
      expect(card?.effects[0]?.text).toBe("Deal 8 damage to one enemy.");
      expect(card?.loreSources[0]?.excerpt).toBe(loreExcerpt);
      expect(card?.imageUrl).toBe(
        `https://backend.test/static/playable-cards/${cardId}/card.webp`,
      );
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  test("rejects a card submitted before any Lore passage matches", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "playable-card-retry-"));
    const portraitPath = await createPortrait(tempDirectory, 96, 128);
    let searches = 0;
    const callTool = mock(async () => {
      searches += 1;
      if (searches === 1) {
        return { sources: [] };
      }
      return loreEnvelope();
    });
    const runChatWithTools = mock(async (input: ChatInput) => {
      const submit = requireTool(input.tools, SUBMIT_PLAYABLE_CARD_TOOL_ID);
      const search = requireTool(input.tools, SEARCH_LORE_TOOL_ID);
      const tooEarly = await submit.execute(validCard, {});
      expect(tooEarly).toEqual({
        accepted: false,
        message:
          "Search the Lore document and use a returned passage before submitting.",
      });
      await search.execute({ query: "cards" }, {});
      await search.execute({ query: "Tamsin Korr Coreborn" }, {});
      const accepted = await submit.execute(validCard, {});
      expect(accepted).toEqual({ accepted: true, message: "Card accepted." });
      return imageChat(portraitPath);
    });

    try {
      const agent = new CardGeneratorAgent(
        agentService(runChatWithTools),
        { callTool } as unknown as ProductNowMcpService,
        idleAbort() as unknown as GenerationAbortCoordinator,
      );
      const { cardId } = await agent.query({
        generationId: GENERATION_ID,
        prompt: "a card about Tamsin Korr",
        sessionId: "session-1",
      });
      savedCardIds.push(cardId);
      expect(callTool).toHaveBeenCalledTimes(2);
    } finally {
      await rm(tempDirectory, { force: true, recursive: true });
    }
  });

  test("removes the card directory when the portrait is unusable", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "playable-card-tiny-"));
    const portraitPath = await createPortrait(tempDirectory, 8, 8);
    const runChatWithTools = mock(async (input: ChatInput) => {
      await requireTool(input.tools, SEARCH_LORE_TOOL_ID).execute(
        { query: "Coreborn" },
        {},
      );
      await requireTool(input.tools, SUBMIT_PLAYABLE_CARD_TOOL_ID).execute(
        validCard,
        {},
      );
      return imageChat(portraitPath);
    });
    const before = new Set(await listCardIds());
    const agent = new CardGeneratorAgent(
      agentService(runChatWithTools),
      {
        callTool: mock(async () => loreEnvelope()),
      } as unknown as ProductNowMcpService,
      idleAbort() as unknown as GenerationAbortCoordinator,
    );

    const error = await agent
      .query({
        generationId: GENERATION_ID,
        prompt: "a Coreborn card",
        sessionId: "session-1",
      })
      .then(
        () => undefined,
        (caught: unknown) => caught,
      );

    if (!(error instanceof Error)) {
      throw new Error("expected painting to fail");
    }
    expect(error.message).toContain("below 64px");
    const after = await listCardIds();
    for (const cardId of after) {
      expect(before.has(cardId)).toBe(true);
    }
    await rm(tempDirectory, { force: true, recursive: true });
  });

  test("abort stops the chat before a card is stored", async () => {
    const redis = new MockRedisService();
    const runs = new GenerationAbortCoordinator(
      redis as unknown as RedisService,
    );
    await runs.onModuleInit();
    let markStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = () => {
        resolve();
      };
    });
    const runChatWithTools = async (input: ChatInput) => {
      markStarted();
      return new Promise((_resolve, reject) => {
        const fail = () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        };
        if (input.abortSignal?.aborted === true) {
          fail();
          return;
        }
        input.abortSignal?.addEventListener("abort", fail);
      });
    };
    const before = new Set(await listCardIds());
    const agent = new CardGeneratorAgent(
      agentService(runChatWithTools),
      {
        callTool: mock(async () => loreEnvelope()),
      } as unknown as ProductNowMcpService,
      runs,
    );

    const pending = agent.query({
      generationId: GENERATION_ID,
      prompt: "a Coreborn card",
      sessionId: "session-1",
    });
    await started;
    await agent.abort(GENERATION_ID);
    const error = await pending.then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error instanceof GenerationCancelledException).toBe(true);
    const after = await listCardIds();
    for (const cardId of after) {
      expect(before.has(cardId)).toBe(true);
    }
    await runs.onModuleDestroy();
  });
});

interface ChatTool {
  execute: (input: unknown, context: unknown) => Promise<unknown>;
}

/**
 * @param tools - Tools the chat mock received
 * @param id - Tool id the test is about to call
 * @returns That tool
 */
function requireTool(tools: Record<string, ChatTool>, id: string): ChatTool {
  const tool = tools[id];
  if (tool === undefined) {
    throw new Error(`Missing tool ${id}.`);
  }
  return tool;
}

interface ChatInput {
  abortSignal?: AbortSignal;
  agentConfig: {
    instructions: string;
  };
  prompt: string;
  tools: Record<string, ChatTool>;
}

/**
 * @param runChatWithTools - Stand-in for the Mastra chat
 * @returns The agent dependencies the card generator calls
 */
function agentService(
  runChatWithTools: (input: ChatInput) => Promise<unknown>,
) {
  return {
    runAssetClassAgentChat: (input: {
      abortSignal?: AbortSignal;
      instructions: string;
      ownedTools?: Record<string, ChatTool>;
      prompt: string;
    }) =>
      runChatWithTools({
        abortSignal: input.abortSignal,
        agentConfig: { instructions: input.instructions },
        prompt: input.prompt,
        tools: {
          [AgentTool.ConsultProductNow]: {} as ChatTool,
          [AgentTool.GenerateImage]: {} as ChatTool,
          ...(input.ownedTools ?? {}),
        },
      }),
  } as never;
}

/**
 * @param filePath - Portrait the fake generate-image call returned
 * @returns A finished chat with one image result
 */
function imageChat(filePath: string) {
  return {
    text: "Korr's First Bond is ready.",
    toolErrors: [],
    toolResults: [
      {
        result: { answer: loreExcerpt },
        toolCallId: "lore-1",
        toolName: AgentTool.ConsultProductNow,
      },
      {
        result: {
          aspectRatio: "3:4",
          imageSize: "1K",
          images: [
            {
              filePath,
              name: validCard.name,
              notes: validCard.scene,
            },
          ],
        },
        toolCallId: "image-1",
        toolName: AgentTool.GenerateImage,
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
 * @returns Directory names currently under the playable-card static root
 */
async function listCardIds(): Promise<string[]> {
  try {
    return await readdir(PLAYABLE_CARD_STORAGE.rootPath());
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

/**
 * @returns A ProductNow search envelope that includes one Lore passage and one design-doc passage
 */
function loreEnvelope() {
  return {
    content: [
      {
        text: JSON.stringify({
          sources: [
            {
              document: {
                documentId: "4d910971-c925-497c-b7b7-f2a269367289",
              },
              excerpts: [{ content: "Status effects are cut from scope." }],
              title: "Towers of Coreborn",
              url: "https://app.productnow.ai/design",
            },
            {
              document: { documentId: LORE_DOCUMENT_ID, name: "Lore" },
              excerpts: [{ content: loreExcerpt }],
              title: "Lore",
              url: "https://app.productnow.ai/lore",
            },
          ],
        }),
        type: "text",
      },
    ],
  };
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
) {
  const filePath = join(directory, `${randomUUID()}.png`);
  await sharp({
    create: {
      background: { alpha: 1, b: 80, g: 120, r: 40 },
      channels: 4,
      height,
      width,
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}
