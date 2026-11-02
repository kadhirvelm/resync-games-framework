import { randomUUID } from "node:crypto";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  BadGatewayException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { ProductNowMcpTool } from "@resync-game-framework/api";
import { ConfigurationService } from "../configuration/configuration.service";
import { ProductNowOAuthClientProvider } from "./productNowOAuthClient.provider";
import { ProductNowOAuthSessionStore } from "./productNowOAuthSession.store";

interface ProductNowConnection {
  client: Client;
  provider: ProductNowOAuthClientProvider;
  transport: StreamableHTTPClientTransport;
}

interface CachedProductNowTools {
  expiresAt: number;
  tools: ProductNowMcpTool[];
}

const PRODUCT_NOW_RATE_LIMIT_ATTEMPTS = 5;
const PRODUCT_NOW_RATE_LIMIT_BASE_DELAY_MS = 750;
const PRODUCT_NOW_TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Owns ProductNow's MCP OAuth lifecycle and authenticated tool calls.
 */
@Injectable()
export class ProductNowMcpService {
  private readonly logger = new Logger(ProductNowMcpService.name);
  private readonly operationTails = new Map<string, Promise<void>>();
  private readonly toolCache = new Map<string, CachedProductNowTools>();
  private readonly toolListRequests = new Map<
    string,
    Promise<{ tools: ProductNowMcpTool[] }>
  >();

  public constructor(
    private readonly configurationService: ConfigurationService,
    private readonly sessionStore: ProductNowOAuthSessionStore,
  ) {}

  /**
   * Starts OAuth discovery and returns ProductNow's browser authorization URL.
   * @param sessionId - Opaque browser session identifier
   * @param returnTo - Validated frontend path to return to after OAuth
   * @returns URL where the browser should be redirected
   */
  public async beginAuthorization(
    sessionId: string,
    returnTo?: string,
  ): Promise<URL> {
    await this.sessionStore.update(sessionId, (session) => ({
      discoveryState: session.discoveryState,
      oauthState: randomUUID(),
      returnTo,
    }));

    const connection = this.createConnection(sessionId);
    try {
      await connection.client.connect(connection.transport);
    } catch (error) {
      await this.closeConnection(connection);
      if (!(error instanceof UnauthorizedError)) {
        throw new BadGatewayException(
          `Unable to start ProductNow OAuth: ${this.getErrorMessage(error)}`,
        );
      }
      if (!connection.provider.authorizationUrl) {
        throw new BadGatewayException(
          "ProductNow did not provide an OAuth authorization URL",
        );
      }
      return connection.provider.authorizationUrl;
    }

    await this.closeConnection(connection);
    throw new BadGatewayException(
      "ProductNow accepted an unauthenticated MCP connection",
    );
  }

  /**
   * Calls one ProductNow MCP tool for the connected browser.
   * @param sessionId - Opaque browser session identifier
   * @param name - MCP tool name
   * @param toolArguments - JSON arguments accepted by the tool
   * @returns Raw MCP tool result
   */
  public async callTool(
    sessionId: string,
    name: string,
    toolArguments?: Record<string, unknown>,
    abortSignal?: AbortSignal,
  ): Promise<unknown> {
    return this.withConnectedClient(
      sessionId,
      async (client) =>
        client.callTool({ arguments: toolArguments, name }, undefined, {
          signal: abortSignal,
        }),
      abortSignal,
    );
  }

  /**
   * Removes all ProductNow credentials for one browser.
   * @param sessionId - Opaque browser session identifier
   */
  public async disconnect(sessionId: string): Promise<void> {
    this.toolCache.delete(sessionId);
    this.toolListRequests.delete(sessionId);
    await this.sessionStore.delete(sessionId);
  }

  /**
   * Exchanges ProductNow's authorization code and verifies the MCP connection.
   * @param sessionId - Opaque browser session identifier
   * @param authorizationCode - OAuth authorization code
   * @param oauthState - State returned by ProductNow
   * @returns The frontend path saved when OAuth started, if any
   */
  public async finishAuthorization(
    sessionId: string,
    authorizationCode: string,
    oauthState: string,
  ): Promise<{ returnTo?: string }> {
    const session = await this.sessionStore.get(sessionId);
    if (!session.oauthState || session.oauthState !== oauthState) {
      throw new UnauthorizedException("Invalid ProductNow OAuth state");
    }

    const connection = this.createConnection(sessionId);
    try {
      await connection.transport.finishAuth(authorizationCode);
      await connection.client.connect(connection.transport);
      await connection.client.listTools();
      await this.sessionStore.update(sessionId, (updatedSession) => ({
        ...updatedSession,
        oauthState: undefined,
        returnTo: undefined,
      }));
      return { returnTo: session.returnTo };
    } catch (error) {
      throw new BadGatewayException(
        `Unable to finish ProductNow OAuth: ${this.getErrorMessage(error)}`,
      );
    } finally {
      await this.closeConnection(connection);
    }
  }

  /**
   * Builds the OAuth provider used for metadata, discovery, and token storage.
   * @param sessionId - Opaque browser session identifier
   * @returns Provider bound to the browser session
   */
  public createProvider(sessionId: string): ProductNowOAuthClientProvider {
    return new ProductNowOAuthClientProvider(sessionId, this.sessionStore, {
      backendApiUrl: this.configurationService.get("BACKEND_API_URL"),
      frontendUrl: this.configurationService.get("FRONTEND_URL"),
    });
  }

  /**
   * Reports whether the browser has ProductNow OAuth tokens.
   * @param sessionId - Opaque browser session identifier
   * @returns True when tokens are stored
   */
  public async isConnected(sessionId: string): Promise<boolean> {
    return Boolean((await this.sessionStore.get(sessionId)).tokens);
  }

  /**
   * Picks the ProductNow session for this request.
   * A cookie wins when that browser is connected. Otherwise the newest stored
   * connection is used, because cross-site API calls omit the session cookie.
   * @param sessionId - Session id from the cookie, when the browser sent one
   * @returns Connected session id, or undefined when ProductNow is not connected
   */
  public async resolveConnectedSessionId(
    sessionId: string | undefined,
  ): Promise<string | undefined> {
    if (sessionId && (await this.isConnected(sessionId))) {
      return sessionId;
    }
    return this.sessionStore.findLatestConnectedSessionId();
  }

  /**
   * Lists tools available to the connected ProductNow user.
   * @param sessionId - Opaque browser session identifier
   * @returns ProductNow MCP tool declarations
   */
  public async listTools(
    sessionId: string,
  ): Promise<{ tools: ProductNowMcpTool[] }> {
    const cached = this.toolCache.get(sessionId);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return { tools: cached.tools };
    }

    const pending = this.toolListRequests.get(sessionId);
    if (pending !== undefined) {
      return pending;
    }

    const request = this.loadAndCacheTools(sessionId);
    this.toolListRequests.set(sessionId, request);
    try {
      return await request;
    } finally {
      if (this.toolListRequests.get(sessionId) === request) {
        this.toolListRequests.delete(sessionId);
      }
    }
  }

  /**
   * Loads ProductNow's tool declarations and caches them for later agent runs.
   * @param sessionId - Opaque browser session identifier
   * @returns ProductNow MCP tool declarations
   */
  private async loadAndCacheTools(
    sessionId: string,
  ): Promise<{ tools: ProductNowMcpTool[] }> {
    const result = await this.withConnectedClient(sessionId, async (client) => {
      const { tools } = await client.listTools();
      return {
        tools: tools.map((tool) => ({
          description: tool.description,
          inputSchema: tool.inputSchema,
          name: tool.name,
        })),
      };
    });
    this.toolCache.set(sessionId, {
      expiresAt: Date.now() + PRODUCT_NOW_TOOL_CACHE_TTL_MS,
      tools: result.tools,
    });
    return result;
  }

  /**
   * Closes a client without masking the original operation result.
   * @param connection - Active or partially active MCP connection
   */
  private async closeConnection(
    connection: ProductNowConnection,
  ): Promise<void> {
    await connection.client.close().catch(() => undefined);
  }

  /**
   * Constructs an MCP client and OAuth-aware HTTP transport.
   * @param sessionId - Opaque browser session identifier
   * @returns Client connection parts
   */
  private createConnection(sessionId: string): ProductNowConnection {
    const provider = this.createProvider(sessionId);
    const transport = new StreamableHTTPClientTransport(
      new URL(this.configurationService.get("PRODUCTNOW_MCP_URL")),
      { authProvider: provider },
    );
    const client = new Client(
      { name: "resync-game-framework", version: "1.0.0" },
      { capabilities: {} },
    );
    return { client, provider, transport };
  }

  /**
   * Converts unknown thrown values to safe diagnostic text.
   * @param error - Thrown value
   * @returns Error message
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Connects with stored credentials, runs an MCP operation, and closes the client.
   * @param sessionId - Opaque browser session identifier
   * @param operation - MCP operation to run
   * @returns Operation result
   */
  private async withConnectedClient<T>(
    sessionId: string,
    operation: (client: Client) => Promise<T>,
    abortSignal?: AbortSignal,
  ): Promise<T> {
    if (!(await this.isConnected(sessionId))) {
      throw new UnauthorizedException(
        "Connect ProductNow before using its tools",
      );
    }

    return this.serializeSessionOperation(sessionId, async () => {
      let lastError: unknown;
      for (
        let attempt = 1;
        attempt <= PRODUCT_NOW_RATE_LIMIT_ATTEMPTS;
        attempt += 1
      ) {
        throwIfSignalAborted(abortSignal);
        const connection = this.createConnection(sessionId);
        try {
          await connection.client.connect(connection.transport);
          return await operation(connection.client);
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            throw new UnauthorizedException(
              "The ProductNow session expired; reconnect ProductNow",
            );
          }
          throwIfSignalAborted(abortSignal);
          lastError = error;
          if (
            !isProductNowRateLimitError(error) ||
            attempt === PRODUCT_NOW_RATE_LIMIT_ATTEMPTS
          ) {
            break;
          }
          const delayMs =
            PRODUCT_NOW_RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1);
          this.logger.warn(
            `ProductNow rate limited an MCP request; retrying in ${delayMs}ms (${attempt}/${PRODUCT_NOW_RATE_LIMIT_ATTEMPTS})`,
          );
          await abortableDelay(delayMs, abortSignal);
        } finally {
          await this.closeConnection(connection);
        }
      }

      throw new BadGatewayException(
        `ProductNow MCP request failed: ${this.getErrorMessage(lastError)}`,
      );
    });
  }

  /**
   * Runs ProductNow operations for one browser session in order, preventing
   * concurrent dungeon children from creating a burst of MCP connections.
   * @param sessionId - Opaque browser session identifier
   * @param operation - Work to run after earlier session operations finish
   * @returns The operation result
   */
  private async serializeSessionOperation<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.operationTails.get(sessionId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.operationTails.set(sessionId, tail);
    try {
      return await result;
    } finally {
      if (this.operationTails.get(sessionId) === tail) {
        this.operationTails.delete(sessionId);
      }
    }
  }
}

/**
 * Detects ProductNow throttling errors emitted through the MCP HTTP transport.
 * @param error - Error thrown while connecting or calling an MCP tool
 * @returns Whether retrying after a delay is appropriate
 */
export function isProductNowRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b429\b|too many requests|throttl|rate[ -]?limit/i.test(message);
}

/**
 * Stops immediately when a caller cancelled an MCP request.
 * @param signal - Optional cancellation signal
 */
function throwIfSignalAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw (
      signal.reason ??
      new DOMException("The operation was aborted", "AbortError")
    );
  }
}

/**
 * Waits between throttled requests while remaining cancellable.
 * @param delayMs - Delay duration
 * @param signal - Optional cancellation signal
 */
async function abortableDelay(
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal === undefined) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(
        signal.reason ??
          new DOMException("The operation was aborted", "AbortError"),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
    }
  });
}
