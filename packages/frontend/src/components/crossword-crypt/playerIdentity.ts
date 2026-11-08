import type { GameRoomPlayerInput } from "@resync-game-framework/api";

const PLAYER_STORAGE_KEY = "crossword-crypt:player";
type IdentityStorage = Pick<Storage, "getItem" | "setItem">;

/** Reads a stable Crossword Crypt browser identity. */
export function readStoredPlayer(
  storage: IdentityStorage,
): GameRoomPlayerInput | null {
  try {
    const value = JSON.parse(
      storage.getItem(PLAYER_STORAGE_KEY) ?? "null",
    ) as Partial<GameRoomPlayerInput> | null;
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.name !== "string"
    )
      return null;
    if (!value.id || !value.name) return null;
    return { id: value.id, name: value.name };
  } catch {
    return null;
  }
}

/** Creates a trimmed identity while retaining this browser's stable id. */
export function playerForName(
  name: string,
  existing: GameRoomPlayerInput | null,
): GameRoomPlayerInput | null {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return null;
  return { id: existing?.id ?? crypto.randomUUID(), name: trimmed };
}

/** Persists a stable identity; blocked storage is non-fatal. */
export function storePlayer(
  storage: IdentityStorage,
  player: GameRoomPlayerInput,
): void {
  try {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
  } catch {
    // A private browser may ask for the name again after refresh.
  }
}
