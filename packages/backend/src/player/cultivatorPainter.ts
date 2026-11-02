import { Injectable, Logger } from "@nestjs/common";
import type { CultivatorArtPart } from "@resync-game-framework/api";
import type { Prisma } from "@resync-game-framework/database";
import { PrismaService } from "src/database/prisma.service";
import { CardCharacterAgent } from "src/mastra/agents/card-character/cardCharacterAgent";
import { GenerationCancelledException } from "src/mastra/agents/generationCancelled";
import { SpriteSheetAgent } from "src/mastra/agents/sprite-sheet/spriteSheetAgent";
import { runWithProductNowSession } from "src/product-now-mcp/productNowSessionContext";

/** Longest failure message kept on a cultivator. */
const ERROR_MAX_LENGTH = 300;

/** Column values for one part of a cultivator. Undefined leaves a column alone. */
export interface ArtColumnChange {
  assetId?: string | null;
  error?: string | null;
  runId?: string | null;
  status?: string;
}

/**
 * Maps a part's change onto its own columns.
 * @param part - Portrait or sprite
 * @param change - Values to write
 * @returns Prisma update data for that part
 */
export function artColumns(
  part: CultivatorArtPart,
  change: ArtColumnChange,
): Prisma.CultivatorUpdateManyMutationInput {
  if (part === "portrait") {
    return {
      portraitError: change.error,
      portraitRunId: change.runId,
      portraitSetId: change.assetId,
      portraitStatus: change.status,
    };
  }
  return {
    spriteError: change.error,
    spriteRunId: change.runId,
    spriteSheetId: change.assetId,
    spriteStatus: change.status,
  };
}

/** One part to paint. */
export interface CultivatorPaintJob {
  part: CultivatorArtPart;
  prompt: string;
  /** Generation id for the agent run; also guards the row update */
  runId: string;
}

/**
 * Runs the card-character and sprite-sheet agents for a cultivator in the
 * background and writes each result back to its row. A result only lands
 * while the row still names that run, so a stop, a newer run, or a deleted
 * cultivator makes a late result a no-op.
 */
@Injectable()
export class CultivatorPainter {
  private readonly logger = new Logger(CultivatorPainter.name);

  public constructor(
    private readonly characters: CardCharacterAgent,
    private readonly sprites: SpriteSheetAgent,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Starts every job without waiting for it.
   * @param cultivatorId - Cultivator being painted
   * @param jobs - Parts to paint
   * @param sessionId - ProductNow session the agents read the Lore with
   */
  public start(
    cultivatorId: string,
    jobs: readonly CultivatorPaintJob[],
    sessionId: string,
  ): void {
    runWithProductNowSession(sessionId, () => {
      for (const job of jobs) {
        void this.paint(cultivatorId, job);
      }
    });
  }

  /**
   * Stops agent runs on whichever process holds them.
   * @param runs - Part and generation id of each run to stop
   */
  public async stop(
    runs: readonly Pick<CultivatorPaintJob, "part" | "runId">[],
  ): Promise<void> {
    await Promise.all(
      runs.map((run) =>
        run.part === "portrait"
          ? this.characters.abort(run.runId)
          : this.sprites.abort(run.runId),
      ),
    );
  }

  /**
   * Runs one job and records how it ended.
   * @param cultivatorId - Cultivator being painted
   * @param job - Part, prompt, and run id
   */
  private async paint(
    cultivatorId: string,
    job: CultivatorPaintJob,
  ): Promise<void> {
    try {
      const assetId = await this.runAgent(job);
      await this.record(cultivatorId, job, {
        assetId,
        error: null,
        runId: null,
        status: "ready",
      });
    } catch (error) {
      await this.recordFailure(cultivatorId, job, error);
    }
  }

  /**
   * @param job - Part, prompt, and run id
   * @returns The stored asset id
   */
  private async runAgent(job: CultivatorPaintJob): Promise<string> {
    if (job.part === "portrait") {
      const result = await this.characters.query({
        generationId: job.runId,
        prompt: job.prompt,
      });
      return result.setId;
    }
    const result = await this.sprites.query({
      generationId: job.runId,
      prompt: job.prompt,
    });
    return result.id;
  }

  /**
   * A stop puts the part back to whatever it had before; any other error
   * marks it failed with the reason.
   * @param cultivatorId - Cultivator being painted
   * @param job - Part, prompt, and run id
   * @param error - Why the run ended
   */
  private async recordFailure(
    cultivatorId: string,
    job: CultivatorPaintJob,
    error: unknown,
  ): Promise<void> {
    if (error instanceof GenerationCancelledException) {
      await this.restore(cultivatorId, job);
      return;
    }
    this.logger.warn(
      `Cultivator ${job.part} painting failed: ${describeError(error)}`,
    );
    await this.record(cultivatorId, job, {
      error: describeError(error).slice(0, ERROR_MAX_LENGTH),
      runId: null,
      status: "failed",
    });
  }

  /**
   * @param cultivatorId - Cultivator being painted
   * @param job - The stopped job
   */
  private async restore(
    cultivatorId: string,
    job: CultivatorPaintJob,
  ): Promise<void> {
    const row = await this.prisma.client.cultivator.findUnique({
      where: { id: cultivatorId },
    });
    if (!row) {
      return;
    }
    const assetId =
      job.part === "portrait" ? row.portraitSetId : row.spriteSheetId;
    await this.record(cultivatorId, job, {
      error: null,
      runId: null,
      status: assetId ? "ready" : "none",
    });
  }

  /**
   * Writes a part's columns while the row still names this run.
   * @param cultivatorId - Cultivator being painted
   * @param job - The job whose run id guards the write
   * @param change - Values to write
   */
  private async record(
    cultivatorId: string,
    job: CultivatorPaintJob,
    change: ArtColumnChange,
  ): Promise<void> {
    const runColumn = job.part === "portrait" ? "portraitRunId" : "spriteRunId";
    try {
      await this.prisma.client.cultivator.updateMany({
        data: artColumns(job.part, change),
        where: { id: cultivatorId, [runColumn]: job.runId },
      });
    } catch (error) {
      this.logger.error(
        `Could not record cultivator ${job.part}: ${describeError(error)}`,
      );
    }
  }
}

/**
 * @param error - Anything thrown
 * @returns A readable message
 */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "Painting failed.";
}
