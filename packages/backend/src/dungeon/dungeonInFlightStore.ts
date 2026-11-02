import { Injectable } from "@nestjs/common";
import {
  DUNGEON_SLOT_KINDS,
  type DungeonInFlightJob,
} from "@towers-of-coreborn/api";
import { RedisService } from "src/infra/redis/redis.service";
import { z } from "zod";

/** Redis hash of slot generations that have not finished. Field is the generation id. */
const IN_FLIGHT_KEY = "dungeon:inflight";

/** A slot run older than this is no longer treated as in flight. */
export const DUNGEON_IN_FLIGHT_MAX_AGE_MS = 20 * 60 * 1000;

const inflightSchema = z.object({
  dungeonId: z.string().min(1),
  generationId: z.string().min(1),
  kind: z.enum(DUNGEON_SLOT_KINDS),
  prompt: z.string().min(1),
  slotId: z.string().min(1),
  startedAt: z.string().min(1),
});

/**
 * Stores dungeon slot runs in Redis so a refreshed workshop can show them again.
 */
@Injectable()
export class DungeonInFlightStore {
  public constructor(private readonly redis: RedisService) {}

  /**
   * Drops one run. A missing run is left unchanged.
   * @param generationId - Client id of the run
   */
  public async delete(generationId: string): Promise<void> {
    await this.redis.hdel(IN_FLIGHT_KEY, generationId);
  }

  /**
   * @param generationId - Client id of the run
   * @returns Stored run, or undefined when no slot owns it
   */
  public async get(
    generationId: string,
  ): Promise<DungeonInFlightJob | undefined> {
    const value = await this.redis.hget(IN_FLIGHT_KEY, generationId);
    return value ? readJob(value) : undefined;
  }

  /**
   * @returns Runs currently recorded, skipping values that are not jobs
   */
  public async list(): Promise<DungeonInFlightJob[]> {
    const values = await this.redis.hvals(IN_FLIGHT_KEY);
    const jobs: DungeonInFlightJob[] = [];
    for (const value of values) {
      const job = readJob(value);
      if (job !== undefined) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  /**
   * Records a run. A second record with the same generation id replaces the first.
   * @param job - The slot run to show after a refresh
   */
  public async put(job: DungeonInFlightJob): Promise<void> {
    await this.redis.hset(IN_FLIGHT_KEY, job.generationId, JSON.stringify(job));
  }
}

/**
 * @param value - Redis hash value
 * @returns The job, or undefined when the value is not a job
 */
function readJob(value: string): DungeonInFlightJob | undefined {
  try {
    const parsed = inflightSchema.safeParse(JSON.parse(value));
    if (!parsed.success) {
      return undefined;
    }
    return parsed.data;
  } catch {
    return undefined;
  }
}
