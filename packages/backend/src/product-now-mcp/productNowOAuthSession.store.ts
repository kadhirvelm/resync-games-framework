import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigurationService } from "../configuration/configuration.service";
import { PrismaService } from "../database/prisma.service";

/** OAuth state persisted for one browser session. */
export interface ProductNowOAuthSession {
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
  discoveryState?: OAuthDiscoveryState;
  oauthState?: string;
  /** Frontend path to return to after OAuth finishes */
  returnTo?: string;
  tokens?: OAuthTokens;
}

/**
 * Persists encrypted ProductNow OAuth credentials in Postgres.
 * Rows stay until the browser disconnects, so a Redis restart does not
 * force another ProductNow login.
 */
@Injectable()
export class ProductNowOAuthSessionStore {
  private readonly encryptionKey: Buffer;
  private readonly logger = new Logger(ProductNowOAuthSessionStore.name);

  public constructor(
    configurationService: ConfigurationService,
    private readonly prisma: PrismaService,
  ) {
    this.encryptionKey = this.decodeEncryptionKey(
      configurationService.get("MCP_OAUTH_ENCRYPTION_KEY"),
    );
  }

  /**
   * Deletes one browser's ProductNow OAuth session.
   * @param sessionId - Opaque browser session identifier
   */
  public async delete(sessionId: string): Promise<void> {
    await this.prisma.client.productNowOAuthSession.deleteMany({
      where: { id: sessionId },
    });
  }

  /**
   * Reads and decrypts one browser's ProductNow OAuth session.
   * An unreadable payload, including one encrypted with a previous key, is
   * deleted so the browser can connect again.
   * @param sessionId - Opaque browser session identifier
   * @returns Stored session, or an empty session when none exists
   */
  public async get(sessionId: string): Promise<ProductNowOAuthSession> {
    const row = await this.prisma.client.productNowOAuthSession.findUnique({
      where: { id: sessionId },
    });

    if (!row) {
      return {};
    }

    try {
      return JSON.parse(this.decrypt(row.payload)) as ProductNowOAuthSession;
    } catch (error) {
      this.logger.warn(
        `Discarding unreadable ProductNow OAuth session: ${this.describeError(error)}`,
      );
      await this.delete(sessionId);
      return {};
    }
  }

  /**
   * Updates one browser's OAuth session.
   * @param sessionId - Opaque browser session identifier
   * @param updateSession - Function that returns the next session value
   * @returns Updated session
   */
  public async update(
    sessionId: string,
    updateSession: (session: ProductNowOAuthSession) => ProductNowOAuthSession,
  ): Promise<ProductNowOAuthSession> {
    const nextSession = updateSession(await this.get(sessionId));
    const payload = this.encrypt(JSON.stringify(nextSession));
    const connected = Boolean(nextSession.tokens);
    await this.prisma.client.productNowOAuthSession.upsert({
      create: { connected, id: sessionId, payload },
      update: { connected, payload },
      where: { id: sessionId },
    });
    return nextSession;
  }

  /**
   * Finds the newest browser session that still has ProductNow tokens.
   * API calls from another site do not include the session cookie, so callers
   * use this row instead of asking the user to connect again.
   * @returns Session id, or undefined when nothing is connected
   */
  public async findLatestConnectedSessionId(): Promise<string | undefined> {
    const row = await this.prisma.client.productNowOAuthSession.findFirst({
      orderBy: { updatedAt: "desc" },
      where: { connected: true },
    });
    return row?.id;
  }

  /**
   * Decodes and validates the configured AES-256 key.
   * @param encodedKey - Base64-encoded key material
   * @returns Exactly 32 bytes of key material
   */
  private decodeEncryptionKey(encodedKey: string): Buffer {
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== 32) {
      throw new Error(
        "MCP_OAUTH_ENCRYPTION_KEY must contain exactly 32 random bytes encoded as base64",
      );
    }
    return key;
  }

  /**
   * Formats an error for session-store logs.
   * @param error - Caught decryption or parse failure
   * @returns Message safe to log
   */
  private describeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return "Unknown session read failure";
  }

  /**
   * Decrypts an authenticated session payload.
   * @param encryptedValue - Versioned AES-GCM payload
   * @returns Plaintext JSON
   */
  private decrypt(encryptedValue: string): string {
    const [version, initializationVector, authenticationTag, ciphertext] =
      encryptedValue.split(".");
    if (
      version !== "v1" ||
      !initializationVector ||
      !authenticationTag ||
      !ciphertext
    ) {
      throw new Error("Invalid encrypted ProductNow OAuth session");
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(initializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }

  /**
   * Encrypts and authenticates a session payload.
   * @param plaintext - Session JSON
   * @returns Versioned AES-GCM payload
   */
  private encrypt(plaintext: string): string {
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      initializationVector,
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);

    return [
      "v1",
      initializationVector.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }
}
