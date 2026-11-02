/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import type { Command } from "../../logic/types";
import { DescentView } from "../DescentView";
import { GLOSSARY, REQUIRED_GLOSSARY_TERMS } from "../glossary";
import type { DescentPresentation } from "../presentation";
import { createAshenGatePreview } from "../preview";

interface Mounted {
  commands: Command[];
  container: HTMLDivElement;
  pauses: boolean[];
  revives: string[];
  root: Root;
  speeds: number[];
}

/**
 * Mounts the shell on a fresh sim snapshot.
 * @param snapshot - Snapshot override
 * @returns The mounted view and the commands it emitted
 */
async function mount(snapshot = createAshenGatePreview()): Promise<Mounted> {
  const commands: Command[] = [];
  const pauses: boolean[] = [];
  const speeds: number[] = [];
  const revives: string[] = [];
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <DescentView
        onCommand={(command) => commands.push(command)}
        onRevive={(heroId) => revives.push(heroId)}
        onSetPaused={(paused) => pauses.push(paused)}
        onSetSpeed={(speed) => speeds.push(speed)}
        snapshot={snapshot}
      />,
    );
  });
  return { commands, container, pauses, revives, root, speeds };
}

/**
 * Clicks a button.
 * @param button - Button to activate
 */
async function click(button: HTMLElement) {
  await act(async () => {
    button.click();
  });
}

/**
 * Finds a button whose text includes the given label.
 * @param scope - DOM scope
 * @param label - Visible label
 * @returns The button
 */
function buttonNamed(scope: ParentNode, label: string): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((element) =>
    element.textContent?.includes(label),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return found;
}

/**
 * @param container - Mounted shell
 * @returns The open dialog
 */
function dialog(container: ParentNode): HTMLElement {
  const found = container.querySelector('[role="dialog"]');
  if (!(found instanceof HTMLElement)) throw new Error("Missing dialog");
  return found;
}

/**
 * @param container - Mounted shell
 * @param id - Unit id
 * @returns The unit token
 */
function unit(container: ParentNode, id: string): HTMLButtonElement {
  const found = container.querySelector(`[data-unit-id="${id}"]`);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing unit ${id}`);
  }
  return found;
}

/**
 * @param container - Mounted shell
 * @param id - Building id
 * @returns The building token
 */
function building(container: ParentNode, id: string): HTMLButtonElement {
  const found = container.querySelector(`[data-building-id="${id}"]`);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing building ${id}`);
  }
  return found;
}

describe("DescentView", () => {
  let mounted: Mounted | undefined;

  afterEach(async () => {
    if (mounted === undefined) return;
    const current = mounted;
    mounted = undefined;
    await act(async () => {
      current.root.unmount();
    });
    current.container.remove();
  });

  test("selects a unit, moves, attacks, and reads the stockpile", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    expect(
      container.querySelector('[data-resource="essence"]')?.textContent,
    ).toBe("40");
    const foodTip = container.querySelector(
      '[aria-label^="Food"] [role="tooltip"]',
    );
    expect(foodTip?.textContent).toContain("Food");
    expect(foodTip?.textContent).toContain("Trains people");
    expect(foodTip?.textContent).toContain("Right-click a grove");
    expect(container.querySelector("[data-testid=pop]")?.textContent).toContain(
      "23/24",
    );
    expect(
      container.querySelector('img[src="/descent/resource-icons/essence.png"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        'img[src="/descent/resource-icons/population.png"]',
      ),
    ).not.toBeNull();
    const foodChip = container.querySelector('[data-resource-chip="food"]');
    if (!(foodChip instanceof HTMLButtonElement)) {
      throw new Error("Missing food resource chip");
    }
    await click(foodChip);
    expect(foodChip.getAttribute("aria-pressed")).toBe("true");
    const resourcePanel = container.querySelector('[aria-label="Unit panel"]');
    expect(resourcePanel?.textContent).toContain("What it is");
    expect(resourcePanel?.textContent).toContain("Meals and preserved stores");
    expect(resourcePanel?.textContent).toContain("What you can do");
    expect(resourcePanel?.textContent).toContain("Trains people");
    expect(resourcePanel?.textContent).toContain("Get more");
    expect(resourcePanel?.textContent).toContain("Right-click a grove");
    expect(buttonNamed(container, "Idle villager").tagName).toBe("BUTTON");
    expect(buttonNamed(container, "Controls").tagName).toBe("BUTTON");
    expect(buttonNamed(container, "Descend").tagName).toBe("BUTTON");
    expect(
      container.querySelector(
        '[data-command="idle"] img[src="/descent/command-icons/idle.png"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-command="descend"] img[src="/descent/command-icons/descend.png"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-testid=descent-minimap]"),
    ).not.toBeNull();

    await click(unit(container, "warden-1"));
    expect(foodChip.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector(
        '[data-command="stop"] img[src="/descent/command-icons/stop.png"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-command="breakthrough"] img[src="/descent/command-icons/breakthrough.png"]',
      ),
    ).not.toBeNull();
    expect(container.querySelector('[data-command="idle"]')).toBeNull();
    expect(container.querySelector('[data-command="hotkeys"]')).toBeNull();
    expect(container.querySelector('[data-command="descend"]')).toBeNull();
    const map = container.querySelector("[data-testid=descent-map]");
    if (!(map instanceof HTMLElement)) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        toJSON() {
          return {};
        },
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 40,
        }),
      );
    });
    expect(commands).toEqual([
      { type: "order_move", unitIds: ["warden-1"], x: 10, y: 5 },
    ]);

    await act(async () => {
      unit(container, "imp-1").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(commands[1]).toEqual({
      targetId: "imp-1",
      type: "order_attack",
      unitIds: ["warden-1"],
    });
  });

  test("navigates build categories, keeps hints, and places a building", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    await click(unit(container, "villager-1"));
    await click(buttonNamed(container, "Build"));
    const buildMenu = container.querySelector('[aria-label="Build menu"]');
    if (!(buildMenu instanceof HTMLElement))
      throw new Error("Missing build menu");
    expect(
      buildMenu.querySelector('[aria-label="Build categories"]'),
    ).not.toBeNull();
    expect(buildMenu.querySelectorAll("li[data-building-type]")).toHaveLength(
      0,
    );
    expect(buttonNamed(buildMenu, "Military")).not.toBeNull();
    expect(buttonNamed(buildMenu, "Cultivation")).not.toBeNull();

    await click(buttonNamed(buildMenu, "Military"));
    expect(
      buildMenu.querySelectorAll("li[data-building-type] svg"),
    ).toHaveLength(1);
    expect(buildMenu.textContent).toContain(
      "Trains Wardens, Hunters, Raiders, Breakers, and Adepts.",
    );
    expect(buildMenu.textContent).not.toContain(
      "Lets trained units attempt cultivation breakthroughs.",
    );
    expect(buildMenu.textContent).toContain("Adjacency");
    expect(buildMenu.querySelector('li[title*="Adjacency"]')).not.toBeNull();

    await click(buttonNamed(buildMenu, "Categories"));
    await click(buttonNamed(buildMenu, "Cultivation"));
    expect(
      buildMenu.querySelectorAll("li[data-building-type] svg"),
    ).toHaveLength(2);
    expect(buildMenu.textContent).toContain(
      "Lets trained units attempt cultivation breakthroughs.",
    );
    expect(buildMenu.textContent).toContain(
      "Summons one powerful Calamity after reaching the Citadel.",
    );
    expect(buildMenu.textContent).toContain("Spirit Vein");
    expect(buildMenu.querySelector('li[title*="Spirit Vein"]')).not.toBeNull();
    expect(buildMenu.textContent).toContain("Citadel tier");
    expect(buttonNamed(buildMenu, "Calamity Altar").disabled).toBe(true);

    await click(buttonNamed(buildMenu, "Categories"));
    await click(buttonNamed(buildMenu, "Military"));
    await click(buttonNamed(buildMenu, "Barracks"));
    const map = container.querySelector("[data-testid=descent-map]");
    if (!(map instanceof HTMLElement)) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        toJSON() {
          return {};
        },
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 80,
          clientY: 40,
        }),
      );
    });
    expect(commands).toEqual([
      {
        builderIds: ["villager-1"],
        buildingType: "barracks",
        type: "place_building",
        x: 10,
        y: 5,
      },
    ]);
  });

  test("shows a training queue and sets a selected building rally point", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    const tracker = container.querySelector('[aria-label="Active training"]');
    expect(tracker?.textContent).toContain("Warden");
    expect(tracker?.textContent).not.toContain("×");
    expect(tracker?.textContent).toContain("40%");
    expect(tracker?.textContent).toContain("+1 queued");
    await click(buttonNamed(tracker ?? container, "Warden"));
    expect(
      container.querySelector('[aria-label="Unit panel"]')?.textContent,
    ).toContain("Barracks");
    await click(building(container, "barracks-1"));
    expect(
      container.querySelector('[aria-label="Training queue"]')?.textContent,
    ).toContain("Warden");
    expect(
      container.querySelector('[aria-label="Training queue"]')?.textContent,
    ).toContain("Hunter");
    expect(
      container.querySelector('[aria-label="Training queue"]')?.textContent,
    ).toContain("40%");
    expect(
      container.querySelector('[aria-label="Training queue"]')?.textContent,
    ).toContain("Queued");
    const cancelHunter = container.querySelector(
      '[aria-label="Training queue"] button[aria-label="Cancel Hunter"]',
    );
    if (!(cancelHunter instanceof HTMLButtonElement)) {
      throw new Error("Missing cancel button for the queued Hunter");
    }
    await click(cancelHunter);
    expect(commands).toEqual([
      {
        buildingId: "barracks-1",
        jobId: "training-2",
        type: "cancel_training",
      },
    ]);
    commands.length = 0;
    const wardenChoice = container.querySelector('[data-unit-class="warden"]');
    expect(wardenChoice?.textContent).toContain("Frontline");
    expect(wardenChoice?.textContent).toContain("anchors the front line");
    expect(
      wardenChoice?.querySelector('img[src="/descent/unit-icons/warden.svg"]'),
    ).not.toBeNull();
    const breakerChoice = container.querySelector(
      '[data-unit-class="breaker"]',
    );
    expect(breakerChoice?.textContent).toContain("Siege");
    expect(breakerChoice?.textContent).toContain("double damage");
    expect(breakerChoice?.hasAttribute("disabled")).toBe(true);
    expect(container.textContent).toContain("Rally 26, 34");
    expect(
      container.querySelector('[data-testid="rally-point"]'),
    ).not.toBeNull();

    await click(buttonNamed(container, "Set rally"));
    const map = container.querySelector("[data-testid=descent-map]");
    if (!(map instanceof HTMLElement)) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        toJSON() {
          return {};
        },
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 80,
          clientY: 40,
        }),
      );
    });
    expect(commands).toEqual([
      {
        buildingId: "barracks-1",
        type: "set_rally_point",
        x: 10,
        y: 5,
      },
    ]);
  });

  test("shift-click queues as many as five and shows the batch cost", async () => {
    const snapshot = createAshenGatePreview();
    const presentation = snapshot.meta.ui as DescentPresentation;
    presentation.pop = { cap: 24, used: 10 };
    const warden = presentation.trainOptions?.find(
      (option) => option.classId === "warden",
    );
    if (warden === undefined) throw new Error("Missing warden training option");
    warden.detail = "Food 30 · Water 15 · 4s";
    warden.food = 30;
    warden.pop = 1;
    warden.seconds = 4;
    warden.water = 15;
    mounted = await mount(snapshot);
    const { commands, container } = mounted;
    await click(building(container, "barracks-1"));
    const choice = container.querySelector('[data-unit-class="warden"]');
    if (!(choice instanceof HTMLButtonElement)) {
      throw new Error("Missing warden training button");
    }
    expect(choice.textContent).toContain("Food 30");
    expect(choice.textContent).not.toContain("Food 120");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    });
    expect(choice.textContent).toContain("×4");
    expect(choice.textContent).toContain("Food 120");
    expect(choice.textContent).toContain("Water 60");
    await act(async () => {
      choice.dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    expect(commands).toContainEqual({
      buildingId: "barracks-1",
      classId: "warden",
      count: 4,
      type: "train_unit",
    });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    });
    expect(choice.textContent).toContain("Food 30");
    expect(choice.textContent).not.toContain("Food 120");
  });

  test("shows a mixed selection as unit-group icons and narrows to one", async () => {
    mounted = await mount();
    const { container } = mounted;
    await click(unit(container, "villager-1"));
    await act(async () => {
      unit(container, "warden-1").dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    const panel = container.querySelector('[aria-label="Unit panel"]');
    const groups = panel?.querySelector('[aria-label="Selected unit groups"]');
    expect(groups).not.toBeNull();
    expect(panel?.textContent).toContain("2 units");
    expect(
      groups?.querySelector('img[src="/descent/unit-icons/warden.svg"]'),
    ).not.toBeNull();
    expect(
      groups?.querySelector('img[src="/descent/unit-icons/villager.svg"]'),
    ).not.toBeNull();
    const wardenGroup = groups?.querySelector('[aria-label="Select 1 Warden"]');
    if (!(wardenGroup instanceof HTMLButtonElement)) {
      throw new Error("Missing Warden group");
    }
    await click(wardenGroup);
    expect(
      container.querySelector('[aria-label="Selected unit groups"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Unit panel"] h3')?.textContent,
    ).not.toContain("units");
  });

  test("sets a selected military group's movement formation", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    await click(unit(container, "warden-1"));
    await act(async () => {
      unit(container, "adept-1").dispatchEvent(
        new MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
    });
    const ranks = container.querySelector('[data-formation="ranks"]');
    const column = container.querySelector('[data-formation="column"]');
    expect(ranks?.getAttribute("aria-pressed")).toBe("true");
    if (!(column instanceof HTMLButtonElement)) {
      throw new Error("Missing Column formation");
    }
    await click(column);
    expect(column.getAttribute("aria-pressed")).toBe("true");
    expect(ranks?.getAttribute("aria-pressed")).toBe("false");

    const map = container.querySelector("[data-testid=descent-map]");
    if (!(map instanceof HTMLElement)) throw new Error("Missing map");
    map.getBoundingClientRect = () =>
      ({
        bottom: 600,
        height: 600,
        left: 0,
        right: 800,
        toJSON() {
          return {};
        },
        top: 0,
        width: 800,
        x: 0,
        y: 0,
      }) as DOMRect;
    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 80,
          clientY: 40,
        }),
      );
    });
    expect(commands.at(-1)).toMatchObject({
      formation: "column",
      type: "order_move",
      unitIds: ["warden-1", "adept-1"],
    });
  });

  test("centers the camera on the idle villager it selects", async () => {
    const snapshot = createAshenGatePreview();
    const ui = snapshot.meta.ui as DescentPresentation;
    const villager = ui.units?.["villager-1"];
    if (villager === undefined) throw new Error("Missing villager readout");
    mounted = await mount({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        ui: {
          ...ui,
          units: { ...ui.units, "villager-1": { ...villager, idle: true } },
        },
      },
    });
    const { container } = mounted;
    const world = container.querySelector<HTMLElement>(
      "[data-testid=descent-world]",
    );
    expect(world?.style.transform).toBe("translate(0px, 0px)");
    await click(buttonNamed(container, "Idle villager"));
    expect(
      container.querySelector('[aria-label="Unit panel"] h3')?.textContent,
    ).toBe("Ash Cutter");
    expect(world?.style.transform).not.toBe("translate(0px, 0px)");
  });

  test("shows what a selected villager is carrying", async () => {
    mounted = await mount();
    const { container } = mounted;
    await click(unit(container, "villager-1"));
    const panel = container.querySelector('[aria-label="Unit panel"]');
    expect(panel?.textContent).toContain("Carrying");
    expect(panel?.textContent).toContain("10 Wood");
    expect(
      panel?.querySelector('img[src="/descent/resource-icons/wood.png"]'),
    ).not.toBeNull();
  });

  test("selects a resource node into the persistent resource panel", async () => {
    mounted = await mount();
    const { container } = mounted;
    const foodNode = container.querySelector('[data-node-resource="food"]');
    if (!(foodNode instanceof HTMLButtonElement)) {
      throw new Error("Missing food resource node");
    }
    await click(foodNode);
    expect(foodNode.getAttribute("aria-pressed")).toBe("true");
    const panel = container.querySelector('[aria-label="Unit panel"]');
    expect(panel?.textContent).toContain("Food");
    expect(panel?.textContent).toContain("Meals and preserved stores");
    expect(panel?.textContent).toContain("Trains people");
    expect(
      panel?.querySelector('img[src="/descent/resource-icons/food.png"]'),
    ).not.toBeNull();
  });

  test("shows success chance before breakthrough and blocks incomplete merit", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    await click(unit(container, "warden-1"));
    expect(
      container.querySelector('[title="Breakthrough chance"]')?.textContent,
    ).toContain("62%");
    expect(commands).toEqual([]);
    await click(buttonNamed(container, "Breakthrough"));
    expect(dialog(container).textContent).toContain("Chance");
    expect(dialog(container).textContent).toContain("62%");
    expect(dialog(container).textContent).toContain("Toxicity");
    expect(dialog(container).textContent).toContain("School");
    expect(commands).toEqual([]);
    await click(buttonNamed(dialog(container), "Begin breakthrough"));
    expect(commands).toEqual([
      { hallId: "hall-1", type: "start_breakthrough", unitId: "warden-1" },
    ]);

    await click(unit(container, "merit-1"));
    await click(buttonNamed(container, "Breakthrough"));
    expect(dialog(container).textContent).toContain("Merit incomplete");
    const before = commands.length;
    await click(buttonNamed(dialog(container), "Begin breakthrough"));
    expect(commands).toHaveLength(before);
    expect(
      container.querySelector("[data-testid=toasts]")?.textContent,
    ).toContain("Merit incomplete");
  });

  test("explains a blocked pill feed before it commits", async () => {
    mounted = await mount();
    const { commands, container } = mounted;
    await click(buttonNamed(container, "OK"));
    await click(unit(container, "adept-1"));
    await click(buttonNamed(container, "Feed Ember Dao Pill"));
    const open = dialog(container);
    expect(open.textContent).toContain("Chance");
    expect(open.textContent).toContain("41%");
    expect(open.textContent).toContain("Toxicity 3/3");
    expect(open.textContent).toContain("School mismatch");
    expect(commands).toEqual([]);
    await click(buttonNamed(open, "Feed pill"));
    expect(commands).toEqual([]);
    const toast = container.querySelector("[data-testid=toasts]")?.textContent;
    expect(toast).toContain("Toxicity");
    expect(toast).toContain("School mismatch");
  });

  test("opens the glossary from the unit panel, Omen panel, and build menu", async () => {
    mounted = await mount();
    const { container } = mounted;
    const labels = [
      "Open glossary from the unit panel",
      "Open glossary from the Omen panel",
      "Open glossary from the build menu",
    ];
    await click(unit(container, "villager-1"));
    await click(buttonNamed(container, "Build"));
    for (const label of labels) {
      const opener = container.querySelector(`[aria-label="${label}"]`);
      if (!(opener instanceof HTMLButtonElement)) {
        throw new Error(`Missing glossary opener: ${label}`);
      }
      await click(opener);
      const glossary = dialog(container);
      for (const term of REQUIRED_GLOSSARY_TERMS) {
        const entry = GLOSSARY.find((item) => item.term === term);
        if (entry === undefined) throw new Error(`Missing glossary: ${term}`);
        expect(glossary.textContent).toContain(term);
        expect(glossary.textContent).toContain(entry.meaning);
      }
      await click(buttonNamed(glossary, "Close"));
    }
  });

  test("updates the Omen from the snapshot and holds it while paused", async () => {
    const preview = createAshenGatePreview();
    mounted = await mount(preview);
    expect(
      mounted.container.querySelector("[data-class=raider]")?.textContent,
    ).toContain("Raider 12");
    expect(
      mounted.container.querySelector("[data-testid=omen-countdown]")
        ?.textContent,
    ).toBe("47s");

    const ui = preview.meta.ui as DescentPresentation;
    const updated = {
      ...preview,
      meta: {
        ui: {
          ...ui,
          omen: { composition: { hunter: 4, warden: 6 }, etaSeconds: 12 },
        },
      },
      paused: true,
    };
    await act(async () => {
      mounted?.root.render(
        <DescentView
          onCommand={(command) => mounted?.commands.push(command)}
          snapshot={updated}
        />,
      );
    });
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    expect(
      mounted.container.querySelector("[data-class=hunter]")?.textContent,
    ).toContain("Hunter 4");
    expect(
      mounted.container.querySelector("[data-class=warden]")?.textContent,
    ).toContain("Warden 6");
    expect(
      mounted.container.querySelector("[data-testid=omen-countdown]")
        ?.textContent,
    ).toBe("12s held");
    expect(
      mounted.container
        .querySelector("[data-testid=descent-view]")
        ?.getAttribute("data-paused"),
    ).toBe("true");
    expect(mounted.container.textContent).toContain("Paused");
  });

  test("pauses, changes speed, recalls, and toasts a living boss", async () => {
    mounted = await mount();
    const { commands, container, pauses, speeds } = mounted;
    expect(
      container
        .querySelector('[aria-label="Hell Pressure"] meter')
        ?.getAttribute("value"),
    ).toBe("35");
    expect(
      container.querySelector("[data-testid=descent-top-hud]")?.textContent,
    ).not.toContain("Ashen Gate");

    await click(buttonNamed(container, "Pause"));
    expect(pauses).toEqual([true]);
    await click(buttonNamed(container, "2×"));
    expect(speeds).toEqual([2]);
    await click(buttonNamed(container, "Descend"));
    expect(commands).toEqual([]);
    expect(
      container.querySelector("[data-testid=toasts]")?.textContent,
    ).toContain("Boss still lives");

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "r" }),
      );
    });
    expect(commands).toEqual([{ type: "recall_villagers" }]);
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }),
      );
    });
    expect(
      container
        .querySelector("[data-testid=descent-world]")
        ?.getAttribute("style"),
    ).toContain("translate(-72px, 0px)");
  });

  test("renders a published notice as text", async () => {
    const preview = createAshenGatePreview();
    const ui = preview.meta.ui;
    mounted = await mount({
      ...preview,
      meta: {
        ...preview.meta,
        ui: {
          ...(ui !== null && typeof ui === "object" ? ui : {}),
          notices: [{ id: 1, text: "Raise the Hold.", tone: "info" }],
        },
      },
    });
    const toast = mounted.container.querySelector(
      "[data-testid=toasts]",
    )?.textContent;
    expect(toast).toContain("Raise the Hold.");
    expect(toast).not.toContain("[object Object]");
  });

  test("keeps only the two newest battlefield notices visible", async () => {
    const preview = createAshenGatePreview();
    const ui = preview.meta.ui;
    mounted = await mount({
      ...preview,
      meta: {
        ...preview.meta,
        ui: {
          ...(ui !== null && typeof ui === "object" ? ui : {}),
          notices: [
            { id: 1, text: "Old notice", tone: "info" },
            { id: 2, text: "Second notice", tone: "info" },
            { id: 3, text: "Newest notice", tone: "warning" },
          ],
        },
      },
    });

    const notices = mounted.container.querySelectorAll(
      "[data-testid=toasts] [role=status]",
    );
    expect(notices).toHaveLength(2);
    expect(mounted.container.textContent).not.toContain("Old notice");
    expect(mounted.container.textContent).toContain("Second notice");
    expect(mounted.container.textContent).toContain("Newest notice");
  });

  test("teaches realm, pill, and school one at a time on Ashen Gate", async () => {
    mounted = await mount();
    const { container } = mounted;
    expect(container.textContent).toContain("Drag to select");
    await click(buttonNamed(container, "OK"));
    expect(container.textContent).toContain("Fill merit and essence");
    expect(container.textContent).not.toContain("Permanent boost");
    await click(buttonNamed(container, "OK"));
    await click(unit(container, "adept-1"));
    await click(buttonNamed(container, "Feed Ember Dao Pill"));
    expect(container.textContent).toContain("Permanent boost");
    expect(container.textContent).not.toContain("Choose Ember");
    await click(buttonNamed(container, "OK"));
    await click(buttonNamed(dialog(container), "Close"));
    await click(unit(container, "sworn-1"));
    expect(container.textContent).toContain("Choose Ember");
    expect(buttonNamed(container, "Ember").tagName).toBe("BUTTON");
  });
});
