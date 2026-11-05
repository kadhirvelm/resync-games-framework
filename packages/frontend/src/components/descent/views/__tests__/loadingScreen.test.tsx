/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, jest, test } from "bun:test";
import { act } from "react";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

import { createRoot, type Root } from "react-dom/client";
import {
  DescentLoadingScreen,
  type DescentLoadingScreenProps,
  loadingLine,
  standInNote,
} from "../DescentLoadingScreen";
import { DescentView } from "../DescentView";
import type { LoadingProgress } from "../loadingProgress";
import { createAshenGatePreview } from "../preview";

interface Mounted {
  container: HTMLDivElement;
  root: Root;
}

let mounted: Mounted | undefined;

/**
 * Mounts a node into a fresh container.
 * @param node - React tree
 * @returns The container and root
 */
async function mount(node: React.ReactNode): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  mounted = { container, root };
  return mounted;
}

/**
 * Builds loading counts.
 * @param overrides - Fields to change
 * @returns Progress with the overrides applied
 */
function progress(overrides: Partial<LoadingProgress> = {}): LoadingProgress {
  return { completed: 0, current: null, failed: 0, total: 0, ...overrides };
}

/**
 * Reads the shown bar percentage.
 * @param container - Mounted container
 * @returns The progressbar's aria-valuenow
 */
function shownPercent(container: HTMLElement): string | null {
  return (
    container
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow") ?? null
  );
}

afterEach(async () => {
  jest.useRealTimers();
  if (!mounted) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => {
    current.root.unmount();
  });
  current.container.remove();
});

describe("DescentLoadingScreen", () => {
  test("names the current load and never moves the bar backward", async () => {
    const props: DescentLoadingScreenProps = {
      leaving: false,
      onSkip: () => {},
      progress: progress({ completed: 3, current: "Ward model", total: 4 }),
    };
    const { container, root } = await mount(
      <DescentLoadingScreen {...props} />,
    );
    expect(container.textContent).toContain("Ward model");
    expect(container.textContent).toContain("3 / 4");
    expect(shownPercent(container)).toBe("75");

    await act(async () => {
      root.render(
        <DescentLoadingScreen
          {...props}
          progress={progress({
            completed: 3,
            current: "Lava sea",
            failed: 2,
            total: 10,
          })}
        />,
      );
    });
    expect(shownPercent(container)).toBe("75");
    expect(container.textContent).toContain("2 pieces of art could not load.");
  });

  test("offers to enter early after a long wait", async () => {
    jest.useFakeTimers();
    let skips = 0;
    const { container } = await mount(
      <DescentLoadingScreen
        leaving={false}
        onSkip={() => {
          skips += 1;
        }}
        progress={progress({ current: "Ward model", total: 1 })}
      />,
    );
    expect(container.textContent).not.toContain("Enter now");
    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });
    const skip = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Enter now"),
    );
    await act(async () => {
      skip?.click();
    });
    expect(skips).toBe(1);
  });
});

describe("DescentView opening load", () => {
  test("lifts the loading screen once the battlefield reports ready", async () => {
    jest.useFakeTimers();
    let loads = 0;
    const { container } = await mount(
      <DescentView
        onLoaded={() => {
          loads += 1;
        }}
        snapshot={createAshenGatePreview()}
      />,
    );
    // Tests have no WebGL, so the DOM map reports ready on mount.
    expect(loads).toBe(1);
    expect(
      container
        .querySelector('[data-testid="descent-loading"]')
        ?.getAttribute("data-leaving"),
    ).toBe("true");

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(container.querySelector('[data-testid="descent-loading"]')).toBe(
      null,
    );
    expect(loads).toBe(1);
  });
});

describe("loading copy", () => {
  test("describes the current step and failures", () => {
    expect(loadingLine(progress(), false)).toBe("Gathering the descent");
    expect(loadingLine(progress({ current: "Ward model" }), false)).toBe(
      "Ward model",
    );
    expect(loadingLine(progress({ current: "Ward model" }), true)).toBe(
      "The gate is open",
    );
    expect(standInNote(1)).toBe("1 piece of art could not load.");
  });
});
