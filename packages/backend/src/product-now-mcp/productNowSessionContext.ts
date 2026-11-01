import { AsyncLocalStorage } from "node:async_hooks";
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { from, Observable, switchMap } from "rxjs";
import { ProductNowMcpService } from "./product-now-mcp.service";
import { readProductNowSessionId } from "./productNowSessionCookie";

/**
 * Mastra request-context key for the browser's ProductNow session.
 * Tools read this when a caller sets it on the agent run.
 */
export const PRODUCT_NOW_SESSION_REQUEST_KEY = "productNowSessionId";

const productNowSessionStorage = new AsyncLocalStorage<string>();

/**
 * Reads the ProductNow session bound to the current request, if one was set.
 * @returns Browser session id, or `undefined` outside a ProductNow request
 */
export function readActiveProductNowSession(): string | undefined {
  return productNowSessionStorage.getStore();
}

/**
 * Reads the ProductNow session for an agent tool call. The Mastra request
 * context wins; otherwise the session bound to the current HTTP request.
 * @param requestContext - Mastra request context for the tool call, if any
 * @returns Browser session id, or `undefined` when none is available
 */
export function readProductNowSessionForTool(
  requestContext: { getRaw(key: string): unknown } | undefined,
): string | undefined {
  const fromRequest = requestContext?.getRaw(PRODUCT_NOW_SESSION_REQUEST_KEY);
  if (typeof fromRequest === "string" && fromRequest !== "") {
    return fromRequest;
  }
  const active = readActiveProductNowSession();
  if (active !== undefined && active !== "") {
    return active;
  }
  return undefined;
}

/**
 * Runs `fn` with a ProductNow session available to agent tools.
 * @param sessionId - Browser session that holds the ProductNow OAuth tokens
 * @param fn - Work that may call ProductNow tools
 * @returns Whatever `fn` returns
 */
export function runWithProductNowSession<T>(sessionId: string, fn: () => T): T {
  return productNowSessionStorage.run(sessionId, fn);
}

/**
 * Reads the connected ProductNow session for this request or rejects it.
 * @returns Browser session identifier
 * @throws UnauthorizedException when ProductNow is not connected
 */
export function requireActiveProductNowSession(): string {
  const sessionId = readActiveProductNowSession();
  if (!sessionId) {
    throw new UnauthorizedException("Connect ProductNow first");
  }
  return sessionId;
}

/**
 * Binds the connected ProductNow session for the rest of an HTTP request.
 * Agent tools read it with {@link readActiveProductNowSession} instead of
 * asking the model for a token.
 */
@Injectable()
export class ProductNowSessionInterceptor implements NestInterceptor {
  public constructor(
    private readonly productNowMcpService: ProductNowMcpService,
  ) {}

  /**
   * Stores the connected ProductNow session while the route handler runs.
   * The cookie session is used when it has tokens. Otherwise the newest
   * connection stored in Postgres is used.
   * @param context - Nest execution context
   * @param next - Remainder of the request pipeline
   * @returns The handler's response stream
   */
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    return from(
      this.productNowMcpService.resolveConnectedSessionId(
        readProductNowSessionId(request),
      ),
    ).pipe(switchMap((sessionId) => this.bindSession(sessionId, next)));
  }

  /**
   * Runs the rest of the request with a ProductNow session bound.
   * @param sessionId - Connected session, or undefined when none exists
   * @param next - Remainder of the request pipeline
   * @returns The handler's response stream
   */
  private bindSession(
    sessionId: string | undefined,
    next: CallHandler,
  ): Observable<unknown> {
    if (sessionId === undefined) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      const subscription = productNowSessionStorage.run(sessionId, () =>
        next.handle().subscribe(subscriber),
      );
      return () => subscription.unsubscribe();
    });
  }
}
