import { describe, expect, mock, test } from "bun:test";
import type { PrismaService } from "src/database/prisma.service";
import type { CardCharacterAgent } from "src/mastra/agents/card-character/cardCharacterAgent";
import { GenerationCancelledException } from "src/mastra/agents/generationCancelled";
import type { SpriteSheetAgent } from "src/mastra/agents/sprite-sheet/spriteSheetAgent";
import { CultivatorPainter } from "../cultivatorPainter";

const CULTIVATOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RUN_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";
const SESSION_ID = "session-1";

/** Columns the painter reads and writes. */
type Row = Record<string, unknown>;

/**
 * @param row - Starting cultivator columns
 * @returns Prisma stub over one row, and the updates it was asked for
 */
function createPrisma(row: Row) {
  const updates: { data: Row; where: Row }[] = [];
  const prisma = {
    client: {
      cultivator: {
        findUnique: async () => row,
        updateMany: async ({ data, where }: { data: Row; where: Row }) => {
          updates.push({ data, where });
          const matches = Object.entries(where).every(
            ([key, value]) => row[key] === value,
          );
          if (matches) {
            Object.assign(
              row,
              Object.fromEntries(
                Object.entries(data).filter(([, value]) => value !== undefined),
              ),
            );
          }
          return { count: matches ? 1 : 0 };
        },
      },
    },
  } as unknown as PrismaService;
  return { prisma, row, updates };
}

/**
 * @param agents - Agent query stubs
 * @param row - Starting cultivator columns
 * @returns The painter, its row, and recorded updates
 */
function createPainter(
  agents: {
    character?: () => Promise<{ setId: string; summary: string }>;
    sprite?: () => Promise<{ id: string; summary: string }>;
  },
  row: Row,
) {
  const characters = {
    abort: mock(async () => true),
    query: mock(
      agents.character ?? (async () => ({ setId: "set", summary: "" })),
    ),
  } as unknown as CardCharacterAgent;
  const sprites = {
    abort: mock(async () => true),
    query: mock(agents.sprite ?? (async () => ({ id: "sheet", summary: "" }))),
  } as unknown as SpriteSheetAgent;
  const { prisma, updates } = createPrisma(row);
  return {
    characters,
    painter: new CultivatorPainter(characters, sprites, prisma),
    row,
    sprites,
    updates,
  };
}

/**
 * Lets queued background work finish.
 */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) {
    await Promise.resolve();
  }
}

describe("CultivatorPainter", () => {
  test("records a finished portrait while the row names its run", async () => {
    const { painter, row } = createPainter(
      { character: async () => ({ setId: "set-9", summary: "" }) },
      { id: CULTIVATOR_ID, portraitRunId: RUN_ID, portraitStatus: "painting" },
    );
    painter.start(
      CULTIVATOR_ID,
      [{ part: "portrait", prompt: "Lin", runId: RUN_ID }],
      SESSION_ID,
    );
    await flush();
    expect([row.portraitRunId, row.portraitSetId, row.portraitStatus]).toEqual([
      null,
      "set-9",
      "ready",
    ]);
  });

  test("drops a late result once a newer run took over", async () => {
    const { painter, row } = createPainter(
      { sprite: async () => ({ id: "old-sheet", summary: "" }) },
      { id: CULTIVATOR_ID, spriteRunId: "newer-run", spriteStatus: "painting" },
    );
    painter.start(
      CULTIVATOR_ID,
      [{ part: "sprite", prompt: "Lin", runId: RUN_ID }],
      SESSION_ID,
    );
    await flush();
    expect(row.spriteSheetId).toBeUndefined();
    expect(row.spriteStatus).toBe("painting");
  });

  test("a stopped run puts back the art it had", async () => {
    const { painter, row } = createPainter(
      {
        character: async () => {
          throw new GenerationCancelledException();
        },
      },
      {
        id: CULTIVATOR_ID,
        portraitRunId: RUN_ID,
        portraitSetId: "set-1",
        portraitStatus: "painting",
      },
    );
    painter.start(
      CULTIVATOR_ID,
      [{ part: "portrait", prompt: "Lin", runId: RUN_ID }],
      SESSION_ID,
    );
    await flush();
    expect([row.portraitSetId, row.portraitStatus]).toEqual(["set-1", "ready"]);
  });

  test("a failed run keeps its reason", async () => {
    const { painter, row } = createPainter(
      {
        sprite: async () => {
          throw new Error("The model refused the sheet.");
        },
      },
      { id: CULTIVATOR_ID, spriteRunId: RUN_ID, spriteStatus: "painting" },
    );
    painter.start(
      CULTIVATOR_ID,
      [{ part: "sprite", prompt: "Lin", runId: RUN_ID }],
      SESSION_ID,
    );
    await flush();
    expect([row.spriteError, row.spriteStatus]).toEqual([
      "The model refused the sheet.",
      "failed",
    ]);
  });

  test("stops each run with the agent that owns it", async () => {
    const { characters, painter, sprites } = createPainter({}, {});
    await painter.stop([
      { part: "portrait", runId: "p" },
      { part: "sprite", runId: "s" },
    ]);
    expect(
      (characters.abort as unknown as ReturnType<typeof mock>).mock.calls,
    ).toEqual([["p"]]);
    expect(
      (sprites.abort as unknown as ReturnType<typeof mock>).mock.calls,
    ).toEqual([["s"]]);
  });
});
