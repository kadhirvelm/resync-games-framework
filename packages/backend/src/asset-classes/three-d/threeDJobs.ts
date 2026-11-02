import { ConflictException, HttpException, Injectable } from "@nestjs/common";
import type { ThreeDJob } from "@towers-of-coreborn/api";
import { RedisService } from "src/infra/redis/redis.service";

const JOB_KEY_PREFIX = "three-d:job:";

/** Redis journal for refresh-safe 3D jobs and global workshop quotas. */
@Injectable()
export class ThreeDJobs {
  public constructor(private readonly redis: RedisService) {}
  /** @returns Recent jobs, newest first, without blocking Redis with `KEYS`. */
  public async list(): Promise<ThreeDJob[]> {
    const entries = await this.scanJobKeys();
    const values = await Promise.all(entries.map((key) => this.redis.get(key)));
    return values
      .filter((value): value is string => value !== null)
      .map((value) => JSON.parse(value) as ThreeDJob)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  /** @returns A job with this id, or null when no deduplication record exists. */
  public async get(id: string): Promise<ThreeDJob | null> {
    const value = await this.redis.get(`${JOB_KEY_PREFIX}${id}`);
    return value ? JSON.parse(value) : null;
  }
  /** Persists one job for 24 hours. */
  public async put(job: ThreeDJob): Promise<void> {
    await this.redis.set(
      `${JOB_KEY_PREFIX}${job.generationId}`,
      JSON.stringify(job),
      86400,
    );
  }
  /** Atomically deduplicates jobs and admits at most twelve Meshy requests per hour. */
  public async admit(job: ThreeDJob): Promise<boolean> {
    return this.redis.withLock(["three-d:admission"], 5000, async () => {
      const existing = await this.get(job.generationId);
      if (existing) {
        if (
          existing.prompt !== job.prompt ||
          existing.requestHash !== job.requestHash ||
          existing.kind !== job.kind ||
          existing.provider !== job.provider ||
          existing.prototypeId !== job.prototypeId ||
          existing.slotId !== job.slotId
        )
          throw new ConflictException(
            "Generation id already belongs to another request.",
          );
        return false;
      }
      const running = (await this.list()).filter(
        (entry) => entry.state === "running",
      );
      if (
        job.prototypeId &&
        running.some(
          (entry) =>
            entry.prototypeId === job.prototypeId &&
            entry.slotId === job.slotId,
        )
      )
        throw new ConflictException(
          "This prototype slot is already generating.",
        );
      if (job.provider === "meshy") {
        const key = `three-d:meshy-hour:${Math.floor(Date.now() / 3600000)}`;
        const count = await this.redis.getClient().incr(key);
        await this.redis.expire(key, 7200);
        if (count > 12)
          throw new HttpException(
            "Meshy hourly workshop quota reached (12 models).",
            429,
          );
      }
      await this.put(job);
      return true;
    });
  }
  /** Merges progress without losing package ownership or prior status. */
  public async progress(
    id: string,
    stage: string,
    progress: number,
    providerJobId?: string,
  ): Promise<void> {
    await this.redis.withLock([`three-d:job-lock:${id}`], 5000, async () => {
      const job = await this.get(id);
      if (job?.state !== "running") return;
      const providerJobIds = [
        ...new Set([
          ...(job.providerJobIds ?? []),
          ...(providerJobId ? [providerJobId] : []),
        ]),
      ];
      await this.put({
        ...job,
        progress,
        providerJobIds,
        providerSubmissionPending: providerJobId
          ? undefined
          : job.providerSubmissionPending,
        stage,
      });
    });
  }

  /** Journals a potentially billable submission before the network request starts. */
  public async submitting(
    id: string,
    phase: "preview" | "refine",
  ): Promise<void> {
    await this.redis.withLock([`three-d:job-lock:${id}`], 5000, async () => {
      const job = await this.get(id);
      if (job?.state !== "running")
        throw new ConflictException("Generation is no longer active.");
      if (job.providerSubmissionPending)
        throw new ConflictException(
          "A prior Meshy submission has an unknown result. Inspect the provider dashboard before starting a new job.",
        );
      await this.put({ ...job, providerSubmissionPending: phase });
    });
  }

  /**
   * Atomically applies a terminal state so late provider progress cannot revive it.
   * @param id - Generation id
   * @param patch - Complete, failed, or cancelled job fields
   */
  public async finish(
    id: string,
    patch: Pick<ThreeDJob, "stage" | "state"> &
      Partial<Pick<ThreeDJob, "asset" | "error" | "progress">>,
  ): Promise<void> {
    await this.redis.withLock([`three-d:job-lock:${id}`], 5000, async () => {
      const job = await this.get(id);
      if (job?.state !== "running") return;
      await this.put({ ...job, ...patch });
    });
  }

  /** @returns Every Redis key in the 3D job namespace via incremental SCAN. */
  private async scanJobKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const [nextCursor, page] = await this.redis
        .getClient()
        .scan(cursor, "MATCH", `${JOB_KEY_PREFIX}*`, "COUNT", 100);
      cursor = nextCursor;
      keys.push(...page);
    } while (cursor !== "0");
    return keys;
  }
}
