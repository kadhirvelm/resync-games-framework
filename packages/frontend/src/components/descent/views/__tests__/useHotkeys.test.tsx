/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { HotkeyAction } from "../hotkeys";
import { useHotkeys } from "../useHotkeys";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

/**
 * Minimal host component for testing `useHotkeys`.
 * @param props - Action handler and enabled flag
 * @returns Empty fragment
 */
function HotkeyHost({
  enabled,
  onAction,
}: {
  enabled?: boolean;
  onAction: (action: HotkeyAction) => void;
}) {
  useHotkeys(onAction, enabled);
  return null;
}

afterEach(async () => {
  if (!mounted) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => {
    current.root.unmount();
  });
  current.container.remove();
});

describe("useHotkeys", () => {
  test("does not preventDefault Space or dispatch actions when disabled", async () => {
    const actions: HotkeyAction[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { container, root };

    await act(async () => {
      root.render(
        <HotkeyHost
          enabled={false}
          onAction={(action) => actions.push(action)}
        />,
      );
    });

    const disabledSpace = new KeyboardEvent("keydown", {
      cancelable: true,
      key: " ",
    });
    window.dispatchEvent(disabledSpace);
    expect(disabledSpace.defaultPrevented).toBe(false);
    expect(actions).toEqual([]);

    await act(async () => {
      root.render(
        <HotkeyHost
          enabled={true}
          onAction={(action) => actions.push(action)}
        />,
      );
    });

    const enabledSpace = new KeyboardEvent("keydown", {
      cancelable: true,
      key: " ",
    });
    window.dispatchEvent(enabledSpace);
    expect(enabledSpace.defaultPrevented).toBe(true);
    expect(actions).toEqual([{ type: "pause" }]);
  });
});
