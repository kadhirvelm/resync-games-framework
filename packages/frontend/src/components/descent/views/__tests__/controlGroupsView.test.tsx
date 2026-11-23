/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, jest, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DescentView } from "../DescentView";
import { createAshenGatePreview } from "../preview";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedView {
  container: HTMLDivElement;
  root: Root;
}

/**
 * Mounts Descent with its deterministic preview snapshot.
 * @returns The rendered root and its container
 */
async function mountView(): Promise<MountedView> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DescentView snapshot={createAshenGatePreview()} />);
  });
  return { container, root };
}

/**
 * Finds one rendered unit token.
 * @param container - Mounted shell
 * @param id - Unit id
 * @returns The unit's selectable button
 */
function unitButton(container: ParentNode, id: string): HTMLButtonElement {
  const button = container.querySelector(`[data-unit-id="${id}"]`);
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing unit ${id}`);
  }
  return button;
}

/**
 * Clicks a unit, optionally holding Shift to extend the selection.
 * @param container - Mounted shell
 * @param id - Unit id
 * @param shiftKey - Whether to toggle rather than replace selection
 */
async function clickUnit(
  container: ParentNode,
  id: string,
  shiftKey = false,
): Promise<void> {
  await act(async () => {
    unitButton(container, id).dispatchEvent(
      new MouseEvent("click", { bubbles: true, shiftKey }),
    );
  });
}

/**
 * Sends one keydown through the shell's real window listener.
 * @param key - Keyboard event key
 * @param init - Modifier and physical-code overrides
 */
async function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key, ...init }),
    );
  });
}

describe("DescentView control groups", () => {
  let mounted: MountedView | undefined;

  afterEach(async () => {
    jest.restoreAllMocks();
    if (mounted === undefined) return;
    const current = mounted;
    mounted = undefined;
    await act(async () => {
      current.root.unmount();
    });
    current.container.remove();
  });

  test("saves, recalls, extends, and double-tap-centers selected units", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    mounted = await mountView();
    const { container } = mounted;
    const villager = unitButton(container, "villager-1");
    const warden = unitButton(container, "warden-1");
    const adept = unitButton(container, "adept-1");
    const world = container.querySelector<HTMLElement>(
      "[data-testid=descent-world]",
    );
    expect(world?.style.transform).toBe("translate(0px, 0px)");

    await clickUnit(container, "villager-1");
    await clickUnit(container, "warden-1", true);
    expect(villager.getAttribute("aria-pressed")).toBe("true");
    expect(warden.getAttribute("aria-pressed")).toBe("true");
    const primaryBeforeSave = container.querySelector(
      '[aria-label="Unit panel"] h3',
    )?.textContent;
    await press("1", { code: "Digit1", ctrlKey: true });

    await clickUnit(container, "adept-1");
    expect(villager.getAttribute("aria-pressed")).toBe("false");
    expect(warden.getAttribute("aria-pressed")).toBe("false");
    await press("1", { code: "Digit1" });
    expect(villager.getAttribute("aria-pressed")).toBe("true");
    expect(warden.getAttribute("aria-pressed")).toBe("true");
    expect(adept.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector('[aria-label="Unit panel"] h3')?.textContent,
    ).toBe(primaryBeforeSave);
    expect(world?.style.transform).toBe("translate(0px, 0px)");

    await clickUnit(container, "adept-1");
    await press("!", { code: "Digit1", shiftKey: true });
    await clickUnit(container, "villager-1");
    await press("1", { code: "Digit1" });
    expect(villager.getAttribute("aria-pressed")).toBe("true");
    expect(warden.getAttribute("aria-pressed")).toBe("true");
    expect(adept.getAttribute("aria-pressed")).toBe("true");
    expect(world?.style.transform).toBe("translate(0px, 0px)");

    await press("1", { code: "Digit1" });
    expect(world?.style.transform).not.toBe("translate(0px, 0px)");
  });
});
