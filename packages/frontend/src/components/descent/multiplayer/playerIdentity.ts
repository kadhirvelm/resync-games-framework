import type { GameRoomPlayerInput } from "@resync-game-framework/api";

const PLAYER_STORAGE_KEY = "descent:player";
type IdentityStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * Reads a stable Descent multiplayer identity from storage.
 * @param storage - Browser localStorage or compatible mock
 * @returns Stored player identity or `null` when absent
 */
export function readDescentPlayer(
  storage: IdentityStorage,
): GameRoomPlayerInput | null {
  try {
    const raw = storage.getItem(PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameRoomPlayerInput> | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.name !== "string"
    ) {
      return null;
    }
    if (!parsed.id || !parsed.name.trim()) return null;
    return { id: parsed.id, name: parsed.name.trim() };
  } catch {
    return null;
  }
}

/**
 * Creates or updates a Descent player identity while keeping the browser's
 * stable player id.
 * @param name - Display name entered by the player
 * @param existing - Prior identity, if any
 * @returns Validated player identity
 */
export function buildDescentPlayer(
  name: string,
  existing: GameRoomPlayerInput | null,
): GameRoomPlayerInput {
  const trimmed = name.trim().slice(0, 32) || "Commander";
  const id =
    existing?.id ??
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `descent-${Math.random().toString(36).slice(2, 10)}`);
  return { id, name: trimmed };
}

/**
 * Persists a Descent player identity; blocked storage is non-fatal.
 * @param storage - Browser localStorage or compatible mock
 * @param player - Player identity to save
 */
export function saveDescentPlayer(
  storage: IdentityStorage,
  player: GameRoomPlayerInput,
): void {
  try {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
  } catch {
    // Private browsing may block storage; in-memory identity still works.
  }
}

/**
 * Loads or generates a ready-to-use Descent player identity in the browser.
 * @returns Stable player id and display name
 */
export function loadOrCreateDescentPlayer(): GameRoomPlayerInput {
  if (typeof window === "undefined") {
    return { id: "descent-ssr", name: "Commander" };
  }
  const existing = readDescentPlayer(window.localStorage);
  if (existing !== null) return existing;
  const fresh = buildDescentPlayer("Commander", null);
  saveDescentPlayer(window.localStorage, fresh);
  return fresh;
}
