import { Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import Redis from "ioredis";
import Redlock from "redlock";
import { ConfigurationService } from "src/configuration/configuration.service";

/**
 * Redis service that wraps ioredis client for pub/sub and data operations.
 * Provides a centralized Redis connection for the application.
 */
@Injectable()
export class RedisService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly subscriber: Redis;
  private readonly publisher: Redis;
  private readonly redlock: Redlock;

  constructor(configuration: ConfigurationService) {
    const host = configuration.get("REDIS_HOST");
    const port = configuration.get("REDIS_PORT");

    this.logger.log(`Connecting to Redis at ${host}:${port}`);

    // Main client for data operations
    this.client = new Redis({
      host,
      port,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(`Redis connection retry attempt ${times}`);
        return delay;
      },
    });

    // Separate connections for pub/sub (required by Redis)
    this.subscriber = new Redis({ host, port });
    this.publisher = new Redis({ host, port });

    this.redlock = new Redlock([this.client], {
      retryCount: 10,
      retryDelay: 100,
      retryJitter: 50,
    });

    this.client.on("connect", () => {
      this.logger.log("Redis client connected");
    });

    this.client.on("error", (err) => {
      this.logger.error("Redis client error:", err);
    });

    this.subscriber.on("error", (err) => {
      this.logger.error("Redis subscriber error:", err);
    });

    this.publisher.on("error", (err) => {
      this.logger.error("Redis publisher error:", err);
    });
  }

  /**
   * Get the main Redis client for data operations
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get the subscriber client for pub/sub
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get the publisher client for pub/sub
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  /**
   * Returns the Redis address for components that must own dedicated clients.
   * @returns Host and port shared by the application Redis clients
   */
  getConnectionAddress(): { host: string; port: number } {
    return {
      host: this.client.options.host ?? "localhost",
      port: this.client.options.port ?? 6379,
    };
  }

  // === Data Operations ===

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(
    key: string,
    value: string,
    ttlSeconds?: number,
  ): Promise<string | null> {
    if (ttlSeconds) {
      return this.client.set(key, value, "EX", ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.client.exists(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  // === Distributed Locking ===

  /**
   * Acquires a distributed Redis lock for the duration of the callback.
   * Uses the Redlock algorithm — safe across multiple server nodes.
   * Throws if the lock cannot be acquired after retries.
   *
   * @param keys - One or more Redis keys to lock (use descriptive prefixes like `lock:yjs:...`)
   * @param durationMs - Maximum lock duration in milliseconds; auto-released when the callback returns
   * @param fn - Async callback to run exclusively under the lock
   */
  async withLock<T>(
    keys: string[],
    durationMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.redlock.using(keys, durationMs, () => fn());
  }

  // === Hash Operations ===

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.client.hdel(key, ...fields);
  }

  async hlen(key: string): Promise<number> {
    return this.client.hlen(key);
  }

  async hkeys(key: string): Promise<string[]> {
    return this.client.hkeys(key);
  }

  async hvals(key: string): Promise<string[]> {
    return this.client.hvals(key);
  }

  // === Set Operations ===

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.client.sismember(key, member);
  }

  // === Pub/Sub Operations ===

  async publish(channel: string, message: string): Promise<number> {
    return this.publisher.publish(channel, message);
  }

  async subscribe(
    channel: string,
    callback: (message: string) => void,
  ): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on("message", (ch, msg) => {
      if (ch === channel) {
        callback(msg);
      }
    });
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  // === Lifecycle ===

  async onApplicationShutdown() {
    this.logger.log("Disconnecting Redis clients");

    await Promise.allSettled([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);

    this.logger.log("Redis clients disconnected");
  }
}
