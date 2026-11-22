/** Query parameter that carries the active Descent multiplayer room code. */
export const DESCENT_ROOM_QUERY_KEY = "room";

const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,12}$/;

/**
 * Reads and normalizes a Descent room code from a URL search string.
 * @param search - `location.search`, with or without the leading `?`
 * @returns Normalized uppercase room code, or `null` when absent or invalid
 */
export function readDescentRoomFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(DESCENT_ROOM_QUERY_KEY);
  if (raw === null) return null;
  const normalized = raw.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Builds a same-origin URL with the Descent room query parameter added,
 * updated, or removed while preserving other query parameters and the hash.
 * @param href - Current absolute address
 * @param roomId - Room code to store, or `null` to clear it
 * @returns Path, query, and hash suitable for `history.replaceState`
 */
export function hrefWithDescentRoom(
  href: string,
  roomId: string | null,
): string {
  const url = new URL(href);
  const normalized = roomId?.trim().toUpperCase() ?? "";
  if (normalized.length > 0) {
    url.searchParams.set(DESCENT_ROOM_QUERY_KEY, normalized);
  } else {
    url.searchParams.delete(DESCENT_ROOM_QUERY_KEY);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Updates the browser address bar to reflect the current Descent room code
 * without adding a new history entry.
 * @param roomId - Active room code, or `null` to remove the parameter
 */
export function syncDescentRoomInUrl(roomId: string | null): void {
  if (typeof window === "undefined") return;
  const next = hrefWithDescentRoom(window.location.href, roomId);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, "", next);
}
