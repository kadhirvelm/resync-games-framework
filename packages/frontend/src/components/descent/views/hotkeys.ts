/** Keyboard actions the desktop shell handles. */
export type HotkeyAction =
  | { type: "build" }
  | { type: "camera"; x: number; y: number }
  | { type: "close" }
  | { type: "fullscreen" }
  | { type: "hotkeys" }
  | { type: "idle" }
  | { type: "pause" }
  | { type: "recall" }
  | { type: "release" }
  | { type: "selectCamp" }
  | { type: "train" };

/** The key fields the mapper reads. */
export interface HotkeyInput {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
}

/** Camera step in screen pixels. */
export const CAMERA_STEP = 72;

/**
 * Maps a key to a shell action.
 * @param input - Key and modifiers
 * @returns The action, or null when the shell ignores the key
 */
export function hotkeyFromInput(input: HotkeyInput): HotkeyAction | null {
  if (input.altKey || input.ctrlKey || input.metaKey) return null;
  const key = input.key.length === 1 ? input.key.toLowerCase() : input.key;
  if (key === "ArrowLeft" || key === "a") {
    return { type: "camera", x: -CAMERA_STEP, y: 0 };
  }
  if (key === "ArrowRight" || key === "d") {
    return { type: "camera", x: CAMERA_STEP, y: 0 };
  }
  if (key === "ArrowUp" || key === "w") {
    return { type: "camera", x: 0, y: -CAMERA_STEP };
  }
  if (key === "ArrowDown" || key === "s") {
    return { type: "camera", x: 0, y: CAMERA_STEP };
  }
  if (input.repeat) return null;
  if (key === "b") return { type: "build" };
  if (key === "t") return { type: "train" };
  if (key === "r") return { type: "recall" };
  if (key === "g") return { type: "release" };
  if (key === "h") return { type: "selectCamp" };
  if (key === "f") return { type: "fullscreen" };
  if (key === ".") return { type: "idle" };
  if (key === " ") return { type: "pause" };
  if (key === "Escape") return { type: "close" };
  if (key === "?") return { type: "hotkeys" };
  return null;
}

/** Rows in the controls dialog: mouse first, then keys. */
export const HOTKEY_ROWS = [
  { action: "Select", key: "Click / drag" },
  { action: "Select all of a type on screen", key: "Double-click" },
  { action: "Add to selection", key: "Shift+click" },
  { action: "Move / gather / build / attack", key: "Right-click" },
  { action: "Queue a waypoint", key: "Shift+right-click" },
  { action: "Send / queue from the minimap", key: "Right-click / Shift+click" },
  { action: "Build menu", key: "B" },
  { action: "Build category", key: "Q W / A S" },
  { action: "Building (key on its button)", key: "Q W E / A S D / Z X C" },
  { action: "Back to categories", key: "Backspace" },
  { action: "Idle villager", key: "." },
  { action: "Camp", key: "H" },
  { action: "Train", key: "T" },
  { action: "Shelter / return", key: "R / G" },
  { action: "Pan", key: "WASD / arrows" },
  { action: "Rotate", key: "Q / E" },
  { action: "Pause", key: "Space" },
  { action: "Fullscreen", key: "F" },
  { action: "Close / controls", key: "Esc / ?" },
] as const;
