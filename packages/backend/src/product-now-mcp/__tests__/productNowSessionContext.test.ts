import { describe, expect, test } from "bun:test";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { lastValueFrom, Observable } from "rxjs";
import type { ProductNowMcpService } from "../product-now-mcp.service";
import {
  ProductNowSessionInterceptor,
  readActiveProductNowSession,
} from "../productNowSessionContext";

/**
 * Resolver that treats a cookie session as connected and can fall back to storage.
 * @param storedSessionId - Session id returned when the cookie is absent
 * @returns Service stub
 */
function createSessions(
  storedSessionId?: string,
): Pick<ProductNowMcpService, "resolveConnectedSessionId"> {
  return {
    resolveConnectedSessionId: async (sessionId) =>
      sessionId ?? storedSessionId,
  };
}

describe("ProductNowSessionInterceptor", () => {
  test("keeps the session cookie available while the request runs", async () => {
    const interceptor = new ProductNowSessionInterceptor(
      createSessions() as ProductNowMcpService,
    );
    let seen = "";
    const context = {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () =>
          ({
            headers: { cookie: "resync_productnow_session=session-1" },
          }) as Request,
      }),
    } as ExecutionContext;
    const next: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          void Promise.resolve().then(() => {
            seen = readActiveProductNowSession() ?? "";
            subscriber.next(seen);
            subscriber.complete();
          });
        }),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe("session-1");
    expect(seen).toBe("session-1");
    expect(readActiveProductNowSession()).toBeUndefined();
  });

  test("uses the stored connection when the request has no session cookie", async () => {
    const interceptor = new ProductNowSessionInterceptor(
      createSessions("stored-session") as ProductNowMcpService,
    );
    let seen = "";
    const context = {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }) as Request,
      }),
    } as ExecutionContext;
    const next: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          seen = readActiveProductNowSession() ?? "";
          subscriber.next(seen);
          subscriber.complete();
        }),
    };

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toBe("stored-session");
    expect(seen).toBe("stored-session");
  });

  test("leaves the session unset when the browser has not connected", async () => {
    const interceptor = new ProductNowSessionInterceptor(
      createSessions() as ProductNowMcpService,
    );
    let seen: string | undefined = "set";
    const context = {
      getType: () => "http",
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }) as Request,
      }),
    } as ExecutionContext;
    const next: CallHandler = {
      handle: () =>
        new Observable((subscriber) => {
          seen = readActiveProductNowSession();
          subscriber.next(undefined);
          subscriber.complete();
        }),
    };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(seen).toBeUndefined();
  });
});
