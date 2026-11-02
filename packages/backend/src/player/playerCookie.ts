import { randomUUID } from "node:crypto";
import type { Request } from "express";
import { productNowSessionCookieOptions } from "src/product-now-mcp/productNowSessionCookie";
import { isUuid } from "./uuid";

/** Cookie that names the browser's anonymous player. */
export const PLAYER_COOKIE_NAME = "resync_player";

/** Previous player cookie, still accepted so an existing browser keeps its player. */
const LEGACY_PLAYER_COOKIE_NAME = "toc_player";

/**
 * Reads one cookie value from a raw `Cookie` header.
 * @param cookieHeader - Raw `Cookie` header value
 * @param name - Cookie name
 * @returns The decoded value when that cookie is present
 */
function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  const prefix = `${name}=`;
  const match = (cookieHeader?.split(";") ?? [])
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));
  if (!match) {
    return undefined;
  }
  const value = decodeURIComponent(match.slice(prefix.length));
  return value === "" ? undefined : value;
}

/**
 * Reads a player id from one named cookie.
 * @param cookieHeader - Raw `Cookie` header value
 * @param name - Cookie name
 * @returns The player id when that cookie holds a valid one
 */
function readPlayerCookie(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  const value = readCookieValue(cookieHeader, name);
  // Player ids are server-made UUIDs. Anything else in the cookie is ignored.
  return value && isUuid(value) ? value : undefined;
}

/**
 * Reads the player cookie.
 * @param request - Incoming Express request
 * @returns The player id when the cookie holds a valid one
 */
export function readPlayerId(request: Request): string | undefined {
  return (
    readPlayerCookie(request.headers.cookie, PLAYER_COOKIE_NAME) ??
    readPlayerCookie(request.headers.cookie, LEGACY_PLAYER_COOKIE_NAME)
  );
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
  const current = readPlayerCookie(request.headers.cookie, PLAYER_COOKIE_NAME);
  if (current) {
    return current;
  }
  const legacy = readPlayerCookie(
    request.headers.cookie,
    LEGACY_PLAYER_COOKIE_NAME,
  );
  const playerId = legacy ?? randomUUID();
  request.res?.cookie(
    PLAYER_COOKIE_NAME,
    playerId,
    productNowSessionCookieOptions(backendApiUrl),
  );
  return playerId;
}
