import { useEffect, useRef } from "react";
import { type HotkeyAction, hotkeyFromInput } from "./hotkeys";

/**
 * Whether the event target is a text field. Hotkeys leave those keys alone.
 * @param target - Event target
 * @returns Whether the player is typing
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Listens for the desktop hotkey stub and forwards actions to the shell.
 * @param onAction - Handles one hotkey. The latest callback is used.
 */
export function useHotkeys(onAction: (action: HotkeyAction) => void): void {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  useEffect(() => {
    /**
     * @param event - Keydown on the window
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = hotkeyFromInput(event);
      if (action === null) return;
      event.preventDefault();
      onActionRef.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
