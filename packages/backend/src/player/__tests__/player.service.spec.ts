import { describe, expect, mock, test } from "bun:test";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ConfigurationService } from "src/configuration/configuration.service";
import type { PrismaService } from "src/database/prisma.service";
import type { CultivatorPainter } from "../cultivatorPainter";
import { PlayerService, readParts } from "../player.service";

const PLAYER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAYER_ID = "22222222-2222-4222-8222-222222222222";
const CULTIVATOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIMB_ID = "4f1c0b2e-6a7d-4c8e-9f10-123456789abc";

/**
 * @param change - Columns to override
 * @returns A stored cultivator with no art
 */
function cultivatorRow(change: Record<string, unknown> = {}) {
  return {
    appearance: "Silver hair and a jade pin.",
    createdAt: new Date(0),
    id: CULTIVATOR_ID,
    name: "Lin Wei",
    paintingStartedAt: null,
    playerId: PLAYER_ID,
    portraitError: null,
    portraitRunId: null,
    portraitSetId: null,
    portraitStatus: "none",
    spriteError: null,
    spriteRunId: null,
    spriteSheetId: null,
    spriteStatus: "none",
    title: "Keeper of Ash",
    updatedAt: new Date(0),
    ...change,
  };
}

/**
 * @param options - Stored cultivator and climb owner
 * @returns The service with stubbed Prisma and painter
 */
function createService(
  options: {
    climbOwner?: string;
    cultivator?: ReturnType<typeof cultivatorRow> | null;
  } = {},
) {
  const cultivator =
    options.cultivator === undefined ? cultivatorRow() : options.cultivator;
  const update = mock(async ({ data }: { data: Record<string, unknown> }) => ({
    ...cultivatorRow(),
    ...data,
  }));
  const upsert = mock(async () => ({ id: CLIMB_ID, updatedAt: new Date(5) }));
  const prisma = {
    client: {
      climb: {
        count: async () => 0,
        findUnique: async () =>
          options.climbOwner ? { playerId: options.climbOwner } : null,
        upsert,
      },
      cultivator: {
        findFirst: async ({ where }: { where: { playerId: string } }) =>
          cultivator && cultivator.playerId === where.playerId
            ? cultivator
            : null,
        update,
      },
      player: { upsert: async () => ({}) },
    },
  } as unknown as PrismaService;
  const painter = {
    start: mock(() => undefined),
    stop: mock(async () => undefined),
  } as unknown as CultivatorPainter;
  const configuration = {
    get: () => "https://api.example.com",
  } as unknown as ConfigurationService;
  return {
    painter,
    service: new PlayerService(prisma, painter, configuration),
    update,
    upsert,
  };
}

/**
 * @returns A valid save request
 */
function climbPayload() {
  return {
    ascension: 0,
    cultivatorId: CULTIVATOR_ID,
    floorCount: 8,
    floorIndex: 1,
    id: CLIMB_ID,
    snapshot: { run: {} },
    towerId: "built-in",
    towerTitle: "The Jade Spire",
  };
}

describe("PlayerService.paintCultivator", () => {
  test("marks both parts painting and starts one job each", async () => {
    const { painter, service, update } = createService();
    const record = await service.paintCultivator(
      PLAYER_ID,
      { cultivatorId: CULTIVATOR_ID },
      "session",
    );
    expect(record.portrait.status).toBe("painting");
    expect(record.sprite.status).toBe("painting");
    const data = update.mock.calls[0]?.[0].data;
    expect(data?.portraitRunId).toEqual(expect.any(String));
    expect(data?.spriteRunId).not.toBe(data?.portraitRunId);
    const [, jobs, session] = (painter.start as ReturnType<typeof mock>).mock
      .calls[0] as [string, { part: string; prompt: string }[], string];
    expect(jobs.map((job) => job.part)).toEqual(["portrait", "sprite"]);
    expect(jobs[0]?.prompt).toContain("Name: Lin Wei");
    expect(session).toBe("session");
  });

  test("refuses a part that is already painting", async () => {
    const { service } = createService({
      cultivator: cultivatorRow({
        paintingStartedAt: new Date(),
        spriteRunId: "run",
        spriteStatus: "painting",
      }),
    });
    await expect(
      service.paintCultivator(
        PLAYER_ID,
        { cultivatorId: CULTIVATOR_ID, parts: ["sprite"] },
        "session",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  test("refuses to paint without an appearance", async () => {
    const { service } = createService({
      cultivator: cultivatorRow({ appearance: "  " }),
    });
    await expect(
      service.paintCultivator(
        PLAYER_ID,
        { cultivatorId: CULTIVATOR_ID },
        "session",
      ),
    ).rejects.toThrow(BadRequestException);
  });

  test("hides another player's cultivator", async () => {
    const { service } = createService({
      cultivator: cultivatorRow({ playerId: OTHER_PLAYER_ID }),
    });
    await expect(
      service.paintCultivator(
        PLAYER_ID,
        { cultivatorId: CULTIVATOR_ID },
        "session",
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("PlayerService.saveClimb", () => {
  test("creates a climb for the player's cultivator", async () => {
    const { service, upsert } = createService();
    expect(await service.saveClimb(PLAYER_ID, climbPayload())).toEqual({
      id: CLIMB_ID,
      updatedAt: new Date(5).toISOString(),
    });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  test("will not overwrite a climb another player owns", async () => {
    const { service, upsert } = createService({ climbOwner: OTHER_PLAYER_ID });
    await expect(service.saveClimb(PLAYER_ID, climbPayload())).rejects.toThrow(
      NotFoundException,
    );
    expect(upsert).toHaveBeenCalledTimes(0);
  });
});

describe("readParts", () => {
  test("defaults to both parts and drops repeats", () => {
    expect(readParts(undefined)).toEqual(["portrait", "sprite"]);
    expect(readParts(["sprite", "sprite"])).toEqual(["sprite"]);
  });

  test("rejects unknown or empty parts", () => {
    expect(() => readParts(["hat"])).toThrow();
    expect(() => readParts([])).toThrow();
  });
});
