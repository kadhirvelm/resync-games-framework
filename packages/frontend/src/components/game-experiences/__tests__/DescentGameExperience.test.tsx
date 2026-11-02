/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createAshenGateSim } from "@/components/descent/logic/ashenGateSlice";
import { AUTOSAVE_SLOT, saveSlotKey } from "@/components/descent/logic/sim";
import { DescentGameExperience } from "../DescentGameExperience";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedExperience {
  container: HTMLDivElement;
  root: Root;
}

/**
 * Mounts the Descent entry on its title screen.
 * @param onExit - Library navigation callback
 * @returns The mounted title screen
 */
async function mountExperience(onExit = () => {}): Promise<MountedExperience> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<DescentGameExperience onExit={onExit} />);
  });
  return { container, root };
}

/**
 * Finds a button by its visible label.
 * @param scope - DOM scope to search
 * @param label - Text included by the desired button
 * @returns The matching button
 */
function buttonNamed(scope: ParentNode, label: string): HTMLButtonElement {
  const button = [...scope.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

describe("DescentGameExperience", () => {
  let mounted: MountedExperience | undefined;

  afterEach(async () => {
    window.localStorage.removeItem(saveSlotKey(AUTOSAVE_SLOT));
    if (!mounted) return;
    const current = mounted;
    mounted = undefined;
    await act(async () => {
      current.root.unmount();
    });
    current.container.remove();
  });

  test("opens on a title screen and returns to the game library", async () => {
    window.localStorage.removeItem(saveSlotKey(AUTOSAVE_SLOT));
    let exits = 0;
    mounted = await mountExperience(() => {
      exits += 1;
    });

    expect(mounted.container.textContent).toContain("Descent");
    expect(mounted.container.textContent).toContain(
      "Build. Cultivate. Survive.",
    );
    expect(
      mounted.container.querySelector('[data-testid="descent-title-artwork"]'),
    ).toBeTruthy();
    expect(mounted.container.textContent).not.toContain("Continue");

    await act(async () => {
      buttonNamed(mounted?.container ?? document, "All games").click();
    });
    expect(exits).toBe(1);
  });

  test("offers continue when the Ashen Gate autosave is valid", async () => {
    const saved = createAshenGateSim({ seed: 17 });
    window.localStorage.setItem(saveSlotKey(AUTOSAVE_SLOT), saved.serialize());

    mounted = await mountExperience();

    expect(buttonNamed(mounted.container, "Continue")).toBeTruthy();
    expect(buttonNamed(mounted.container, "New game")).toBeTruthy();
    expect(mounted.container.textContent).not.toContain("autosave");
  });
});
