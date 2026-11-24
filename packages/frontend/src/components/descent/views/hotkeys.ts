import type { ControlGroupSlot } from "./controlGroups";

/** A control-group assignment, extension, or recall keyboard action. */
export interface ControlGroupHotkeyAction {
  mode: "add" | "recall" | "save";
  slot: ControlGroupSlot;
  type: "controlGroup";
}

/** Keyboard actions the desktop shell handles. */
export type HotkeyAction =
  | { type: "attack_move" }
  | { type: "build" }
  | { type: "camera"; x: number; y: number }
  | ControlGroupHotkeyAction
  | { type: "close" }
  | { type: "disband" }
  | { type: "fullscreen" }
  | { type: "hotkeys" }
  | { type: "idle" }
  | { type: "meditate" }
  | { type: "pause" }
  | { type: "qi_art" }
  | { type: "recall" }
  | { type: "release" }
  | { type: "selectCamp" }
  | { type: "stop" }
  | { type: "train" };

/** The key fields the mapper reads. */
export interface HotkeyInput {
  altKey: boolean;
  /** Physical key code, needed for shifted number-row punctuation. */
  code?: string;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey?: boolean;
}

/** Camera step in screen pixels. */
export const CAMERA_STEP = 72;

/**
 * Resolves a number-row or numeric key to a control-group slot.
 * @param key - Keyboard event key, which may be shifted punctuation
 * @param code - Physical keyboard code, when supplied by the browser
 * @returns Slots 1 through 9, or null for every other key
 */
function controlGroupSlotFromKey(
  key: string,
  code: string | undefined,
): ControlGroupSlot | null {
  if (/^[1-9]$/.test(key)) return Number(key) as ControlGroupSlot;
  if (code !== undefined && /^Digit[1-9]$/.test(code)) {
    return Number(code.slice(-1)) as ControlGroupSlot;
  }
  return null;
}

/**
 * Maps a key to a shell action.
 * @param input - Key and modifiers
 * @returns The action, or null when the shell ignores the key
 */
export function hotkeyFromInput(input: HotkeyInput): HotkeyAction | null {
  const groupSlot = controlGroupSlotFromKey(input.key, input.code);
  if (groupSlot !== null) {
    if (input.metaKey || input.repeat) return null;
    const saveModifier = input.ctrlKey || input.altKey;
    if (saveModifier && input.shiftKey === true) return null;
    if (input.ctrlKey && input.altKey) return null;
    if (saveModifier) {
      return { mode: "save", slot: groupSlot, type: "controlGroup" };
    }
    if (input.shiftKey === true) {
      return { mode: "add", slot: groupSlot, type: "controlGroup" };
    }
    return { mode: "recall", slot: groupSlot, type: "controlGroup" };
  }
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
  if (key === "Delete") return { type: "disband" };
  if (key === "x") return { type: "attack_move" };
  if (key === "z") return { type: "stop" };
  if (key === "b") return { type: "build" };
  if (key === "c") return { type: "qi_art" };
  if (key === "m") return { type: "meditate" };
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
  { action: "Save control group", key: "Ctrl+1–9 / Alt+1–9" },
  { action: "Add selection to control group", key: "Shift+1–9" },
  { action: "Recall group / double-tap to center", key: "1–9" },
  { action: "Move / gather / build / attack", key: "Right-click" },
  { action: "Attack-move", key: "X" },
  { action: "Stop", key: "Z" },
  { action: "Disband units / cancel construction", key: "Delete" },
  { action: "Queue a waypoint", key: "Shift+right-click" },
  { action: "Send / queue from the minimap", key: "Right-click / Shift+click" },
  { action: "Build menu", key: "B" },
  { action: "Place multiple buildings", key: "Shift+click" },
  { action: "Unleash Cultivator Qi Art", key: "C" },
  { action: "Toggle Cultivator Meditation", key: "M" },
  { action: "Build category", key: "Q W E R" },
  {
    action: "Building (key on its button)",
    key: "Q W E R T / A S D F G / Z X C V",
  },
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
