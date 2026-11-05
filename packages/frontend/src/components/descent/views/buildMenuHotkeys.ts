/**
 * Grid hotkeys for the villager build menu, laid out like an RTS command
 * grid: each key sits where its button sits on screen. B opens the menu,
 * one key picks a category, one more picks the building.
 */

/** Category keys, matching the menu's two-by-two category grid. */
export const BUILD_CATEGORY_KEYS = ["Q", "W", "A", "S"] as const;

/** Building keys, matching the menu's three-column building grid. */
export const BUILD_OPTION_KEYS = [
  "Q",
  "W",
  "E",
  "A",
  "S",
  "D",
  "Z",
  "X",
  "C",
] as const;

/** Which page of the build menu is open. */
export type BuildMenuLevel = "buildings" | "categories";

/** What a key does while the build menu is open. */
export type BuildMenuKeyAction =
  | { index: number; type: "choose" }
  | { type: "back" }
  /** A grid key with no button behind it: eat it so the camera stays put. */
  | { type: "swallow" };

/** The key fields the build menu reads. */
export interface BuildMenuKeyInput {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
}

/**
 * @param level - Open page of the menu
 * @param index - Button position on that page
 * @returns The key shown on that button, or undefined past the grid
 */
export function buildMenuKeyFor(
  level: BuildMenuLevel,
  index: number,
): string | undefined {
  const keys = level === "categories" ? BUILD_CATEGORY_KEYS : BUILD_OPTION_KEYS;
  return keys[index];
}

/**
 * Maps a key press to a build menu action. Every grid key belongs to the menu
 * while it is open, even one with no button, so W or Q never pan or turn the
 * camera behind it. Esc and B are left to the shell, which closes the menu.
 * @param input - Key and modifiers
 * @param level - Open page of the menu
 * @param count - Buttons on that page
 * @returns The action, or null when the menu leaves the key alone
 */
export function buildMenuKeyAction(
  input: BuildMenuKeyInput,
  level: BuildMenuLevel,
  count: number,
): BuildMenuKeyAction | null {
  if (input.altKey || input.ctrlKey || input.metaKey) return null;
  if (input.key === "Backspace") {
    return level === "buildings" ? { type: "back" } : { type: "swallow" };
  }
  if (input.key.length !== 1) return null;
  const keys: readonly string[] =
    level === "categories" ? BUILD_CATEGORY_KEYS : BUILD_OPTION_KEYS;
  const key = input.key.toUpperCase();
  const index = keys.indexOf(key);
  if (index < 0) {
    // Keep camera keys from leaking through on the smaller category grid.
    return BUILD_OPTION_KEYS.includes(key as never)
      ? { type: "swallow" }
      : null;
  }
  if (input.repeat || index >= count) return { type: "swallow" };
  return { index, type: "choose" };
}
