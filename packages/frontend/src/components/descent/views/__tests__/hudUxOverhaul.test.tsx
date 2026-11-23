/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createAshenGateSim } from "../../logic/ashenGateSlice";
import type { Command } from "../../logic/types";
import { DescentView } from "../DescentView";
import { PlayerScoreboard } from "../PlayerScoreboard";
import { createAshenGatePreview } from "../preview";
import { formatSimClock } from "../status";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Mounted {
  commands: Command[];
  container: HTMLDivElement;
  root: Root;
}

let mounted: Mounted | undefined;

/**
 * Mounts DescentView with a snapshot and captures emitted commands.
 * @param snapshot - Snapshot to render
 * @returns Mounted container, root, and captured commands
 */
async function mountView(
  snapshot = createAshenGatePreview(),
): Promise<Mounted> {
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

/**
 * Dispatches one keydown event on the window.
 * @param key - Key value
 * @param init - Optional keyboard event init
 */
async function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key, ...init }),
    );
  });
}

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => {
    current.root.unmount();
  });
  current.container.remove();
});

describe("Descent HUD & AoE2:DE RTS UX overhaul", () => {
  test("shows persistent idle villager button, Hold tier badge, and elapsed clock in top ResourceBar", async () => {
    const simSnap = createAshenGateSim({ seed: 1 }).snapshot();
    const snapshot = { ...simSnap, tick: 20 * 125 }; // 125s = 02:05
    const { container } = await mountView(snapshot);

    expect(formatSimClock(20 * 125)).toBe("02:05");
    expect(
      container.querySelector('[data-testid="sim-clock"]')?.textContent,
    ).toBe("02:05");
    expect(
      container.querySelector('[data-testid="hold-tier-badge"]')?.textContent,
    ).toBe("Camp");

    const idleBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="idle-villager-button"]',
    );
    expect(idleBtn).not.toBeNull();
    expect(idleBtn?.textContent).toContain(".");
    await act(async () => {
      idleBtn?.click();
    });
    const pressedUnits = container.querySelectorAll(
      '[data-unit-id][aria-pressed="true"]',
    );
    expect(pressedUnits.length).toBe(1);
  });

  test("renders control group tabs, binds buildings, and preserves selection when a recalled group has died", async () => {
    const preview = createAshenGatePreview();
    const { container, root } = await mountView(preview);

    const warden = container.querySelector<HTMLButtonElement>(
      '[data-unit-id="warden-1"]',
    );
    const barracks = container.querySelector<HTMLButtonElement>(
      '[data-building-id="barracks-1"]',
    );
    expect(warden).not.toBeNull();
    expect(barracks).not.toBeNull();

    // Save warden-1 into slot 1 -> tab [1] appears
    await act(async () => {
      warden?.click();
    });
    await press("1", { code: "Digit1", ctrlKey: true });
    const tab1 = container.querySelector<HTMLButtonElement>(
      '[data-control-group="1"]',
    );
    expect(tab1).not.toBeNull();
    expect(tab1?.textContent).toContain("1");

    // Save barracks-1 into slot 2 -> tab [2] appears without clearing slot 1
    await act(async () => {
      barracks?.click();
    });
    await press("2", { code: "Digit2", ctrlKey: true });
    expect(container.querySelector('[data-control-group="2"]')).not.toBeNull();

    // Remove warden-1 from snapshot, select adept-1, recall slot 1 -> selection stays adept-1
    const withoutWarden = {
      ...preview,
      units: preview.units.filter((u) => u.id !== "warden-1"),
    };
    await act(async () => {
      root.render(<DescentView snapshot={withoutWarden} />);
    });
    const adept = container.querySelector<HTMLButtonElement>(
      '[data-unit-id="adept-1"]',
    );
    await act(async () => {
      adept?.click();
    });
    await press("1", { code: "Digit1" });
    expect(adept?.getAttribute("aria-pressed")).toBe("true");
  });

  test("wires Attack-Move (X) and Stop (Z) and clears active modes on H (selectCamp)", async () => {
    const simSnap = createAshenGateSim({ seed: 1 }).snapshot();
    const { commands, container } = await mountView(simSnap);
    const captain = container.querySelector<HTMLButtonElement>(
      '[data-unit-id="ashen-captain"]',
    );
    await act(async () => {
      captain?.click();
    });

    // Command card shows Attack-Move (X) and Stop (Z)
    const attackMoveBtn = container.querySelector(
      '[data-command="attack_move"]',
    );
    const stopBtn = container.querySelector('[data-command="stop"]');
    expect(attackMoveBtn?.textContent).toContain("X");
    expect(stopBtn?.textContent).toContain("Z");

    // Press X -> arms Attack-Move status banner
    await press("x");
    expect(container.textContent).toContain("Attack-Move: left-click");

    // Press H -> selects Camp and clears Attack-Move
    await press("h");
    expect(container.textContent).not.toContain("Attack-Move: left-click");

    // Select captain again and press Z -> emits order_stop
    await act(async () => {
      captain?.click();
    });
    await press("z");
    expect(commands).toContainEqual({
      type: "order_stop",
      unitIds: ["ashen-captain"],
    });
  });

  test("blocks game hotkeys while HotkeyDialog is open and dismisses dialogs on backdrop click", async () => {
    const { container } = await mountView();
    await press("?");
    const controlsDialog = container.querySelector('[aria-label="Controls"]');
    expect(controlsDialog).not.toBeNull();

    // Pressing H while HotkeyDialog is open should NOT select Camp
    await press("h");
    expect(container.querySelector('[aria-label="Controls"]')).not.toBeNull();

    // Clicking backdrop dismisses the dialog
    const backdrop = controlsDialog?.parentElement;
    expect(backdrop).not.toBeNull();
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Controls"]')).toBeNull();
  });

  test("keeps building placement armed when clicking invalid ground", async () => {
    const { commands, container } = await mountView();
    const villager = container.querySelector<HTMLButtonElement>(
      '[data-unit-id="villager-1"]',
    );
    await act(async () => {
      villager?.click();
    });
    await press("b");
    await press("q"); // Military
    await press("q"); // Barracks

    // Click outside map bounds (invalid ground: negative coordinates)
    const map = container.querySelector<HTMLElement>(
      "[data-testid=descent-map]",
    );
    if (map === null) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 100,
        right: 900,
        toJSON() {
          return {};
        },
        top: 100,
        width: 800,
        x: 100,
        y: 100,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    expect(commands).toHaveLength(0);
    // Placement status stays armed
    expect(container.textContent).toContain("Barracks · Shift-click");
  });

  test("PlayerScoreboard can collapse and expand", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { commands: [], container, root };

    await act(async () => {
      root.render(
        <PlayerScoreboard
          localPlayerId="p1"
          players={[
            {
              color: "#f2c14e",
              id: "p1",
              name: "Aria",
              score: { cultivation: 5, economy: 10, military: 5, total: 20 },
              slotIndex: 0,
            },
          ]}
        />,
      );
    });

    expect(
      container.querySelectorAll("[data-testid=player-score-row]"),
    ).toHaveLength(1);
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="scoreboard-toggle"]',
    );
    expect(toggle).not.toBeNull();
    await act(async () => {
      toggle?.click();
    });
    expect(
      container.querySelectorAll("[data-testid=player-score-row]"),
    ).toHaveLength(0);
    await act(async () => {
      toggle?.click();
    });
    expect(
      container.querySelectorAll("[data-testid=player-score-row]"),
    ).toHaveLength(1);
  });
});
