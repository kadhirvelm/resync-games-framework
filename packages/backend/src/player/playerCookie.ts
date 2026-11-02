import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { productNowSessionCookieOptions } from "src/product-now-mcp/productNowSessionCookie";
import { isUuid } from "./uuid";

/** Cookie that names the browser's anonymous player. */
export const PLAYER_COOKIE_NAME = "toc_player";

/**
 * Reads the player cookie.
 * @param request - Incoming Express request
 * @returns The player id when the cookie holds a valid one
 */
export function readPlayerId(request: Request): string | undefined {
  const prefix = `${PLAYER_COOKIE_NAME}=`;
  const match = (request.headers.cookie?.split(";") ?? [])
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  if (!match) {
    return undefined;
  }
  const value = decodeURIComponent(match.slice(prefix.length));
  // Player ids are server-made UUIDs. Anything else in the cookie is ignored.
  return isUuid(value) ? value : undefined;
}

/**
 * Reads the player cookie, or makes a new player id and sets the cookie on
 * the response. The cookie uses the same attributes as the ProductNow
 * session cookie so it rides along on credentialed API calls.
 * @param request - Incoming Express request; Express links its response as `request.res`
 * @param backendApiUrl - Public backend origin, which decides `Secure` and `SameSite`
 * @returns The browser's player id
 */
export function resolvePlayerId(
  request: Request,
  backendApiUrl: string,
): string {
  const existing = readPlayerId(request);
  if (existing) {
    return existing;
  }
  const playerId = randomUUID();
  request.res?.cookie(
    PLAYER_COOKIE_NAME,
    playerId,
    productNowSessionCookieOptions(backendApiUrl),
  );
  return playerId;
}
