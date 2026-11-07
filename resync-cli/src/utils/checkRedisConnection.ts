import Redis from "ioredis";
import { logColorMessage } from "./logColorMessage";

export async function checkRedisConnection(
  host: string = "localhost",
  port: number = 6379,
  maxRetries: number = 30,
  retryDelayMs: number = 1000,
): Promise<void> {
  const redis = new Redis({
    host,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    port,
    retryStrategy: () => null, // We'll handle retries manually
  });

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await redis.connect();
      await redis.ping();
      logColorMessage("Redis is ready and connected", "yellow");
      await redis.quit();
      return;
    } catch (_error) {
      if (attempt === maxRetries) {
        await redis.quit();
        throw new Error(
          `Failed to connect to Redis after ${maxRetries} attempts. ` +
            `Make sure Redis is running on ${host}:${port}`,
        );
      }

      if (attempt === 1) {
        logColorMessage(
          `Waiting for Redis to be ready on ${host}:${port}...`,
          "yellow",
        );
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}
