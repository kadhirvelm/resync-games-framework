import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CULTIVATOR_ART_PARTS,
  type CultivatorArtPart,
  type CultivatorRecord,
  MAX_CULTIVATORS_PER_PLAYER,
  MAX_SAVED_CLIMBS_PER_PLAYER,
  type PlayerServiceApi,
  type PlayerState,
} from "@towers-of-coreborn/api";
import type { Cultivator, Prisma } from "@towers-of-coreborn/database";
import { CARD_CHARACTER_STORAGE } from "src/asset-classes/card-character/cardCharacterStorage";
import { readCardCharacterSet } from "src/asset-classes/card-character/readCardCharacterSets";
import { readSpriteSheet } from "src/asset-classes/sprite-sheet/readSpriteSheets";
import { SPRITE_SHEET_STORAGE } from "src/asset-classes/sprite-sheet/spriteSheetStorage";
import { ConfigurationService } from "src/configuration/configuration.service";
import { PrismaService } from "src/database/prisma.service";
import { readSaveClimbPayload } from "./climbPayload";
import {
  readCultivatorChanges,
  readCultivatorFields,
} from "./cultivatorFields";
import {
  artColumns,
  CultivatorPainter,
  type CultivatorPaintJob,
} from "./cultivatorPainter";
import {
  cultivatorPortraitPrompt,
  cultivatorSpritePrompt,
} from "./cultivatorPrompts";
import { toClimbRecord, toCultivatorRecord } from "./playerRecords";
import { requireUuid } from "./uuid";

type Payload<Key extends keyof PlayerServiceApi> =
  PlayerServiceApi[Key]["payload"];

/**
 * Cultivators and saved climbs for one anonymous browser player. Every query
 * is scoped by player id, so one browser never reads another's rows.
 */
@Injectable()
export class PlayerService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly painter: CultivatorPainter,
    private readonly configurationService: ConfigurationService,
  ) {}

  /**
   * @param playerId - Browser's player
   * @returns Cultivators, oldest first, and saved climbs, newest first
   */
  public async state(playerId: string): Promise<PlayerState> {
    await this.ensurePlayer(playerId);
    const [cultivators, climbs] = await Promise.all([
      this.prisma.client.cultivator.findMany({
        orderBy: { createdAt: "asc" },
        where: { playerId },
      }),
      this.prisma.client.climb.findMany({
        orderBy: { updatedAt: "desc" },
        where: { playerId },
      }),
    ]);
    return {
      climbs: climbs.map(toClimbRecord),
      cultivators: await Promise.all(
        cultivators.map((row) => this.toRecord(row)),
      ),
    };
  }

  /**
   * @param playerId - Browser's player
   * @param payload - Name, title, and appearance
   * @returns The new cultivator, with no art yet
   * @throws BadRequestException when a field is invalid or the roster is full
   */
  public async createCultivator(
    playerId: string,
    payload: Payload<"createCultivator">,
  ): Promise<CultivatorRecord> {
    const fields = readCultivatorFields(payload);
    await this.ensurePlayer(playerId);
    const count = await this.prisma.client.cultivator.count({
      where: { playerId },
    });
    if (count >= MAX_CULTIVATORS_PER_PLAYER) {
      throw new BadRequestException(
        `You can keep up to ${MAX_CULTIVATORS_PER_PLAYER} cultivators. Release one first.`,
      );
    }
    const row = await this.prisma.client.cultivator.create({
      data: { ...fields, playerId },
    });
    return this.toRecord(row);
  }

  /**
   * @param playerId - Browser's player
   * @param payload - Cultivator id and the fields to change
   * @returns The updated cultivator
   * @throws NotFoundException when the player has no such cultivator
   */
  public async updateCultivator(
    playerId: string,
    payload: Payload<"updateCultivator">,
  ): Promise<CultivatorRecord> {
    const row = await this.requireCultivator(playerId, payload?.cultivatorId);
    const changes = readCultivatorChanges(payload);
    const updated = await this.prisma.client.cultivator.update({
      data: changes,
      where: { id: row.id },
    });
    return this.toRecord(updated);
  }

  /**
   * Removes a cultivator, its climbs, and stops any painting it has running.
   * The painted files stay in the workshop gallery.
   * @param playerId - Browser's player
   * @param payload - Cultivator id
   * @returns Whether a cultivator was removed
   */
  public async deleteCultivator(
    playerId: string,
    payload: Payload<"deleteCultivator">,
  ): Promise<{ deleted: boolean }> {
    const cultivatorId = requireUuid(payload?.cultivatorId, "Cultivator id");
    const row = await this.prisma.client.cultivator.findFirst({
      where: { id: cultivatorId, playerId },
    });
    if (!row) {
      return { deleted: false };
    }
    await this.painter.stop(runningJobs(row));
    const result = await this.prisma.client.cultivator.deleteMany({
      where: { id: cultivatorId, playerId },
    });
    return { deleted: result.count > 0 };
  }

  /**
   * Marks the requested parts as painting and starts their agents in the
   * background. Read {@link PlayerService.state} to follow them.
   * @param playerId - Browser's player
   * @param payload - Cultivator id and which parts to paint
   * @param sessionId - ProductNow session the agents read the Lore with
   * @returns The cultivator with those parts painting
   * @throws BadRequestException when the appearance is blank or a part is already painting
   */
  public async paintCultivator(
    playerId: string,
    payload: Payload<"paintCultivator">,
    sessionId: string,
  ): Promise<CultivatorRecord> {
    const row = await this.requireCultivator(playerId, payload?.cultivatorId);
    if (row.appearance.trim() === "") {
      throw new BadRequestException(
        "Describe how your cultivator looks before painting them.",
      );
    }
    const parts = readParts(payload?.parts);
    const current = await this.toRecord(row);
    const busy = parts.filter((part) => current[part].status === "painting");
    if (busy.length > 0) {
      throw new BadRequestException(
        `The ${busy.join(" and ")} ${busy.length > 1 ? "are" : "is"} still being painted.`,
      );
    }

    const jobs: CultivatorPaintJob[] = parts.map((part) => ({
      part,
      prompt:
        part === "portrait"
          ? cultivatorPortraitPrompt(row)
          : cultivatorSpritePrompt(row),
      runId: randomUUID(),
    }));
    const data: Prisma.CultivatorUpdateInput = {
      paintingStartedAt: new Date(),
    };
    for (const job of jobs) {
      Object.assign(
        data,
        artColumns(job.part, {
          error: null,
          runId: job.runId,
          status: "painting",
        }),
      );
    }
    const updated = await this.prisma.client.cultivator.update({
      data,
      where: { id: row.id },
    });
    this.painter.start(row.id, jobs, sessionId);
    return this.toRecord(updated);
  }

  /**
   * Stops a cultivator's painting runs and puts each part back to what it
   * had before, without waiting for the agents to notice.
   * @param playerId - Browser's player
   * @param payload - Cultivator id
   * @returns The cultivator after the stop
   */
  public async stopPainting(
    playerId: string,
    payload: Payload<"stopPainting">,
  ): Promise<CultivatorRecord> {
    const row = await this.requireCultivator(playerId, payload?.cultivatorId);
    const running = runningJobs(row);
    await this.painter.stop(running);
    const data: Prisma.CultivatorUpdateInput = {};
    for (const { part } of running) {
      const assetId =
        part === "portrait" ? row.portraitSetId : row.spriteSheetId;
      Object.assign(
        data,
        artColumns(part, {
          error: null,
          runId: null,
          status: assetId ? "ready" : "none",
        }),
      );
    }
    const updated = await this.prisma.client.cultivator.update({
      data,
      where: { id: row.id },
    });
    return this.toRecord(updated);
  }

  /**
   * Creates or replaces a saved climb. A climb id another player owns is
   * treated as missing.
   * @param playerId - Browser's player
   * @param payload - Climb summary and snapshot
   * @returns The climb id and when it was saved
   * @throws NotFoundException when the cultivator or climb belongs to someone else
   * @throws BadRequestException when the player already has too many saved climbs
   */
  public async saveClimb(
    playerId: string,
    payload: Payload<"saveClimb">,
  ): Promise<{ id: string; updatedAt: string }> {
    const climb = readSaveClimbPayload(payload);
    await this.requireCultivator(playerId, climb.cultivatorId);
    const existing = await this.prisma.client.climb.findUnique({
      select: { playerId: true },
      where: { id: climb.id },
    });
    if (existing && existing.playerId !== playerId) {
      throw new NotFoundException("That climb could not be found.");
    }
    if (!existing) {
      await this.requireClimbRoom(playerId);
    }
    const data = {
      ascension: climb.ascension,
      cultivatorId: climb.cultivatorId,
      floorCount: climb.floorCount,
      floorIndex: climb.floorIndex,
      snapshot: climb.snapshot as Prisma.InputJsonObject,
      towerId: climb.towerId,
      towerTitle: climb.towerTitle,
    };
    const saved = await this.prisma.client.climb.upsert({
      create: { ...data, id: climb.id, playerId },
      update: data,
      where: { id: climb.id },
    });
    return { id: saved.id, updatedAt: saved.updatedAt.toISOString() };
  }

  /**
   * @param playerId - Browser's player
   * @param payload - Climb id
   * @returns Whether a climb was removed
   */
  public async deleteClimb(
    playerId: string,
    payload: Payload<"deleteClimb">,
  ): Promise<{ deleted: boolean }> {
    const climbId = requireUuid(payload?.climbId, "Climb id");
    const result = await this.prisma.client.climb.deleteMany({
      where: { id: climbId, playerId },
    });
    return { deleted: result.count > 0 };
  }

  /**
   * Stops every painting run and removes the player with all their
   * cultivators and climbs.
   * @param playerId - Browser's player
   * @returns The empty state
   */
  public async erase(playerId: string): Promise<PlayerState> {
    const cultivators = await this.prisma.client.cultivator.findMany({
      where: { playerId },
    });
    await this.painter.stop(cultivators.flatMap(runningJobs));
    await this.prisma.client.player.deleteMany({ where: { id: playerId } });
    return { climbs: [], cultivators: [] };
  }

  /**
   * @param playerId - Browser's player
   */
  private async ensurePlayer(playerId: string): Promise<void> {
    await this.prisma.client.player.upsert({
      create: { id: playerId },
      update: {},
      where: { id: playerId },
    });
  }

  /**
   * @param playerId - Browser's player
   * @throws BadRequestException when no more climbs can be saved
   */
  private async requireClimbRoom(playerId: string): Promise<void> {
    const count = await this.prisma.client.climb.count({
      where: { playerId },
    });
    if (count >= MAX_SAVED_CLIMBS_PER_PLAYER) {
      throw new BadRequestException(
        `You can keep up to ${MAX_SAVED_CLIMBS_PER_PLAYER} climbs saved. Finish or abandon one first.`,
      );
    }
  }

  /**
   * @param playerId - Browser's player
   * @param cultivatorId - Id from the request body
   * @returns The player's cultivator
   * @throws NotFoundException when the player has no such cultivator
   */
  private async requireCultivator(
    playerId: string,
    cultivatorId: unknown,
  ): Promise<Cultivator> {
    const row = await this.prisma.client.cultivator.findFirst({
      where: { id: requireUuid(cultivatorId, "Cultivator id"), playerId },
    });
    if (!row) {
      throw new NotFoundException("That cultivator could not be found.");
    }
    return row;
  }

  /**
   * @param row - Stored cultivator
   * @returns The cultivator with its portrait set and sprite sheet read from disk
   */
  private async toRecord(row: Cultivator): Promise<CultivatorRecord> {
    const backendUrl = this.configurationService.get("BACKEND_API_URL");
    const [portraitSet, spriteSheet] = await Promise.all([
      row.portraitSetId
        ? readCardCharacterSet(
            CARD_CHARACTER_STORAGE.rootPath(),
            row.portraitSetId,
            CARD_CHARACTER_STORAGE.publicUrl(backendUrl),
          )
        : undefined,
      row.spriteSheetId
        ? readSpriteSheet(
            SPRITE_SHEET_STORAGE.rootPath(),
            row.spriteSheetId,
            SPRITE_SHEET_STORAGE.publicUrl(backendUrl),
          )
        : undefined,
    ]);
    return toCultivatorRecord(row, { portraitSet, spriteSheet }, Date.now());
  }
}

/**
 * @param parts - Parts from the request body
 * @returns The requested parts without repeats, or both when none were named
 * @throws BadRequestException when a part is unknown
 */
export function readParts(parts: unknown): CultivatorArtPart[] {
  if (parts === undefined || parts === null) {
    return [...CULTIVATOR_ART_PARTS];
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new BadRequestException("Name at least one part to paint.");
  }
  const known = CULTIVATOR_ART_PARTS as readonly unknown[];
  if (!parts.every((part) => known.includes(part))) {
    throw new BadRequestException("Parts must be portrait or sprite.");
  }
  return CULTIVATOR_ART_PARTS.filter((part) => parts.includes(part));
}

/**
 * @param row - Stored cultivator
 * @returns Each part whose row still names a running agent
 */
function runningJobs(
  row: Cultivator,
): Pick<CultivatorPaintJob, "part" | "runId">[] {
  const runs: Pick<CultivatorPaintJob, "part" | "runId">[] = [];
  if (row.portraitStatus === "painting" && row.portraitRunId) {
    runs.push({ part: "portrait", runId: row.portraitRunId });
  }
  if (row.spriteStatus === "painting" && row.spriteRunId) {
    runs.push({ part: "sprite", runId: row.spriteRunId });
  }
  return runs;
}
