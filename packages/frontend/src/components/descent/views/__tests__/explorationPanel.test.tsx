/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createAshenGateSim } from "../../logic/ashenGateSlice";
import type { Command, SimSnapshot } from "../../logic/types";
import { DescentView } from "../DescentView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  commands: Command[];
  container: HTMLDivElement;
  root: Root;
}

let mounted: Mounted | undefined;

/** Mounts the real Descent HUD against one deterministic snapshot. */
async function mount(snapshot: SimSnapshot): Promise<Mounted> {
  const commands: Command[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DescentView
        onCommand={(command) => commands.push(command)}
        snapshot={snapshot}
      />,
    );
  });
  mounted = { commands, container, root };
  return mounted;
}

/** Clicks an element inside one React act. */
async function click(element: Element): Promise<void> {
  if (!(element instanceof HTMLElement))
    throw new Error("Missing click target");
  await act(async () => {
    element.click();
  });
}

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => current.root.unmount());
  current.container.remove();
});

describe("Exploration HUD", () => {
  test("shows the rumored camp, fixed-strength promise, reward, and inspection", async () => {
    const snapshot = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    }).snapshot();
    const { container } = await mount(snapshot);
    const panel = container.querySelector("[data-testid=exploration-panel]");
    expect(panel?.textContent).toContain("No timed waves");
    expect(panel?.textContent).toContain("Ashen Scavengers");
    expect(panel?.textContent).toContain("+90 Food");
    expect(panel?.textContent).toContain("5 more camps hidden");
    expect(container.querySelector("[data-testid=threat-chip]")).toBeNull();

    const focus = container.querySelector(
      '[aria-label="Focus Ashen Scavengers, Threat 1"]',
    );
    await click(focus as Element);
    const unitPanel = container.querySelector('[aria-label="Unit panel"]');
    expect(unitPanel?.textContent).toContain("Guarded prize");
    expect(unitPanel?.textContent).toContain("Fixed");
    expect(unitPanel?.textContent).toContain("+90 Food");
  });

  test("right-clicking a camp attack-moves the selected army", async () => {
    const snapshot = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    }).snapshot();
    const { commands, container } = await mount(snapshot);
    await click(
      container.querySelector("[data-unit-id=ashen-captain]") as Element,
    );
    const marker = container.querySelector("[data-camp-id=ashen-scavengers]");
    if (!(marker instanceof HTMLElement))
      throw new Error("Missing camp marker");
    await act(async () => {
      marker.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    const camp = marker.getAttribute("data-camp-id");
    expect(camp).toBe("ashen-scavengers");
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      type: "order_attack_move",
      unitIds: ["ashen-captain"],
    });
  });

  test("selecting the Captain exposes proof and the cultivation guide", async () => {
    const snapshot = createAshenGateSim({
      mode: "exploration",
      seed: 7,
      waterways: false,
    }).snapshot();
    const { container } = await mount(snapshot);
    await click(
      container.querySelector("[data-unit-id=ashen-captain]") as Element,
    );
    const panel = container.querySelector('[aria-label="Unit panel"]');
    expect(panel?.textContent).toContain("Proof");
    expect(panel?.textContent).toContain("Next: Fight or Meditate");
    expect(panel?.textContent).toContain("How cultivation works");
  });
});

describe("Siege wave forecast", () => {
  test("shows the next wave and its strength without an Omen Tower", async () => {
    const snapshot = createAshenGateSim({
      seed: 7,
      waterways: false,
    }).snapshot();
    const { container } = await mount(snapshot);
    const chip = container.querySelector("[data-testid=threat-chip]");
    expect(chip?.textContent).toContain("Wave");
    expect(chip?.textContent).toContain("120s");
    await click(chip as Element);
    expect(container.textContent).toContain("Wave 1/5:");
    expect(container.textContent).toContain("Scouts");
    expect(container.textContent).toContain("Base enemy strength");
    expect(container.textContent).toContain(
      "An Omen Tower reveals the army 60s before it arrives.",
    );
  });
});
