import { UnauthorizedException } from "@nestjs/common";
import type { CookieOptions, Request } from "express";

/** Cookie that binds a browser to its ProductNow OAuth session. */
export const PRODUCT_NOW_SESSION_COOKIE_NAME = "toc_productnow_session";

/** How long the browser keeps the session id. The credential row has no expiry. */
const SESSION_COOKIE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 400;

/**
 * Cookie attributes for the ProductNow session id.
 * HTTPS APIs use `SameSite=None` so the frontend origin includes the cookie
 * on credentialed API calls. Browsers reject `SameSite=None` without `Secure`,
 * so plain HTTP stays `Lax`.
 * @param backendApiUrl - Public backend origin
 * @returns Options passed to `response.cookie`
 */
export function productNowSessionCookieOptions(
  backendApiUrl: string,
): CookieOptions {
  const secure = backendApiUrl.startsWith("https://");
  return {
    httpOnly: true,
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
    path: "/",
    sameSite: secure ? "none" : "lax",
    secure,
  };
}

/**
 * Reads the ProductNow session cookie.
 * @param request - Incoming Express request
 * @returns The session id when the cookie is present
 */
export function readProductNowSessionId(request: Request): string | undefined {
  return readProductNowSessionIdFromCookieHeader(request.headers.cookie);
}

/**
 * Reads the ProductNow session id from a raw `Cookie` header, such as a
 * Socket.IO handshake's `client.handshake.headers.cookie`.
 * @param cookieHeader - Raw `Cookie` header value
 * @returns The session id when the cookie is present
 */
export function readProductNowSessionIdFromCookieHeader(
  cookieHeader: string | undefined,
): string | undefined {
  const cookies = cookieHeader?.split(";") ?? [];
  const prefix = `${PRODUCT_NOW_SESSION_COOKIE_NAME}=`;
  const match = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  if (!match) {
    return undefined;
  }
  const value = decodeURIComponent(match.slice(prefix.length));
  if (value === "") {
    return undefined;
  }
  return value;
}

/**
 * Reads the ProductNow session cookie or rejects the request.
 * @param request - Incoming Express request
 * @returns Browser session identifier
 * @throws UnauthorizedException when the browser has not started a ProductNow session
 */
export function requireProductNowSessionId(request: Request): string {
  const sessionId = readProductNowSessionId(request);
  if (!sessionId) {
    throw new UnauthorizedException("Connect ProductNow first");
  }
  return sessionId;
}
