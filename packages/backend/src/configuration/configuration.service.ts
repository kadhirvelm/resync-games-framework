import { Injectable } from "@nestjs/common";

/**
 * Local ProductNow session key used when `MCP_OAUTH_ENCRYPTION_KEY` is unset.
 * Keep this value identical to `MCP_OAUTH_ENCRYPTION_KEY` in
 * `resync-cli/src/constants/defaultEnv.ts`.
 */
const LOCAL_MCP_OAUTH_ENCRYPTION_KEY =
  "yw13/hsuCffB/07HoMSLPJ4y1CdwEWFxSvqAn1/PlYA=";

/**
 * Runtime configuration read from the environment.
 * Only keys the application actually uses belong here.
 */
export interface Configuration {
  ASSET_GENERATION_GLOBAL_CONCURRENCY: number;
  ASSET_GENERATION_QUEUE_NAME: string;
  ASSET_GENERATION_WORKER_CONCURRENCY: number;
  ASSET_GENERATION_WORKER_ENABLED: boolean;
  ELEVENLABS_API_KEY: string;
  MESHY_API_KEY: string;
  THREE_D_MAX_TRIANGLES: number;
  BACKEND_API_URL: string;
  FRONTEND_URL: string;
  DATABASE_HOST_URL: string;
  NODE_ENV: "production" | "development";
  MCP_OAUTH_ENCRYPTION_KEY: string;
  PRODUCTNOW_MCP_URL: string;
  /** ProductNow folder holding each game's lore folder; empty when unset */
  PRODUCTNOW_GAMES_FOLDER_ID: string;
  /** ProductNow document Towers of Coreborn reads as canon; empty when unset */
  PRODUCTNOW_LORE_DOCUMENT_ID: string;
  GEMINI_CREDENTIALS: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
}

@Injectable()
export class ConfigurationService {
  private configuration: Configuration;

  public constructor() {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const backendApiUrl = process.env.BACKEND_API_URL;
    const databaseHostUrl = process.env.DATABASE_HOST_URL;
    const frontendUrl = process.env.FRONTEND_URL;
    const geminiCredentials = process.env.GEMINI_CREDENTIALS;
    const configuredOauthEncryptionKey =
      process.env.MCP_OAUTH_ENCRYPTION_KEY?.trim();
    if (
      !configuredOauthEncryptionKey &&
      process.env.NODE_ENV === "production"
    ) {
      throw new Error(
        "MCP_OAUTH_ENCRYPTION_KEY must be set in production (32 random bytes encoded as base64)",
      );
    }
    const mcpOauthEncryptionKey =
      configuredOauthEncryptionKey || LOCAL_MCP_OAUTH_ENCRYPTION_KEY;
    const openAiApiKey = process.env.OPENAI_API_KEY;
    const productNowMcpUrl =
      process.env.PRODUCTNOW_MCP_URL ?? "https://api.productnow-prod.com/mcp";

    if (anthropicApiKey === undefined) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    if (backendApiUrl === undefined) {
      throw new Error("BACKEND_API_URL is not set");
    }

    if (databaseHostUrl === undefined) {
      throw new Error("DATABASE_HOST_URL is not set");
    }

    if (frontendUrl === undefined) {
      throw new Error("FRONTEND_URL is not set");
    }

    if (geminiCredentials === undefined) {
      throw new Error("GEMINI_CREDENTIALS is not set");
    }

    if (openAiApiKey === undefined) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    this.configuration = {
      ANTHROPIC_API_KEY: anthropicApiKey,
      ASSET_GENERATION_GLOBAL_CONCURRENCY: readPositiveInteger(
        "ASSET_GENERATION_GLOBAL_CONCURRENCY",
        4,
      ),
      ASSET_GENERATION_QUEUE_NAME: readQueueName(),
      ASSET_GENERATION_WORKER_CONCURRENCY: readPositiveInteger(
        "ASSET_GENERATION_WORKER_CONCURRENCY",
        2,
      ),
      ASSET_GENERATION_WORKER_ENABLED: readBoolean(
        "ASSET_GENERATION_WORKER_ENABLED",
        true,
      ),
      BACKEND_API_URL: backendApiUrl,
      DATABASE_HOST_URL: databaseHostUrl,
      ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY?.trim() ?? "",
      FRONTEND_URL: frontendUrl,
      GEMINI_CREDENTIALS: geminiCredentials,
      MCP_OAUTH_ENCRYPTION_KEY: mcpOauthEncryptionKey,
      MESHY_API_KEY: process.env.MESHY_API_KEY?.trim() ?? "",
      NODE_ENV: process.env.NODE_ENV as "production" | "development",
      OPENAI_API_KEY: openAiApiKey,
      PRODUCTNOW_GAMES_FOLDER_ID:
        process.env.PRODUCTNOW_GAMES_FOLDER_ID?.trim() ?? "",
      PRODUCTNOW_LORE_DOCUMENT_ID:
        process.env.PRODUCTNOW_LORE_DOCUMENT_ID?.trim() ?? "",
      PRODUCTNOW_MCP_URL: productNowMcpUrl,
      REDIS_HOST: process.env.REDIS_HOST?.trim() || "localhost",
      REDIS_PORT: readPositiveInteger("REDIS_PORT", 6379),
      THREE_D_MAX_TRIANGLES: Math.min(
        100_000,
        readPositiveInteger("THREE_D_MAX_TRIANGLES", 100_000),
      ),
    };
  }

  /**
   * Returns one configuration value.
   * @param key - Configuration field to read
   * @returns The value stored for that field
   */
  public get<T extends keyof Configuration>(key: T): Configuration[T] {
    return this.configuration[key];
  }
}

/**
 * Reads a positive integer environment value or its local default.
 * @param key - Environment variable name
 * @param fallback - Value used when the variable is absent
 * @returns A validated positive integer
 */
function readPositiveInteger(key: string, fallback: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

/**
 * Reads a strict boolean environment value or its local default.
 * @param key - Environment variable name
 * @param fallback - Value used when the variable is absent
 * @returns Parsed boolean
 */
function readBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${key} must be true or false`);
}

/** @returns A Redis-safe BullMQ queue name for this deployment. */
function readQueueName(): string {
  const value =
    process.env.ASSET_GENERATION_QUEUE_NAME?.trim() || "asset-generation";
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(
      "ASSET_GENERATION_QUEUE_NAME may contain only letters, numbers, underscores, and hyphens",
    );
  }
  return value;
}
