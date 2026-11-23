/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DescentMinimap } from "../DescentMinimap";
import { MINIMAP_PING_DURATION_MS } from "../minimapPings";
import { createAshenGatePreview } from "../preview";
import type { MapPoint } from "../selection";
import { buildShellModel } from "../shellModel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedMinimap {
  container: HTMLDivElement;
  root: Root;
}

let mounted: MountedMinimap | undefined;

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => current.root.unmount());
  current.container.remove();
});

/**
 * Mounts a minimap with one attack marker.
 * @param startedAt - Marker emission timestamp
 * @param onNavigate - Camera navigation callback
 * @returns Minimap button
 */
async function mountPing(
  startedAt: number,
  onNavigate: (point: MapPoint) => void,
): Promise<HTMLButtonElement> {
  const model = buildShellModel(createAshenGatePreview());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <DescentMinimap
        model={model}
        onNavigate={onNavigate}
        pings={[
          {
            id: "attack-1",
            severity: "critical",
            startedAt,
            x: model.map.width / 2,
            y: model.map.height / 2,
          },
        ]}
        view={{ centerX: 0, centerY: 0, height: 20, rotation: 0, width: 30 }}
      />,
    );
  });
  const minimap = container.querySelector("[data-testid=descent-minimap]");
  if (!(minimap instanceof HTMLButtonElement))
    throw new Error("Missing minimap");
  return minimap;
}

describe("DescentMinimap attack pings", () => {
  test("draws a red severity ring without intercepting click-to-jump", async () => {
    const navigations: MapPoint[] = [];
    const minimap = await mountPing(Date.now(), (point) => {
      navigations.push(point);
    });
    const ping = minimap.querySelector("[data-testid=descent-minimap-ping]");
    expect(ping?.getAttribute("data-severity")).toBe("critical");
    expect(ping?.getAttribute("stroke")).toBe("#ff322d");

    const model = buildShellModel(createAshenGatePreview());
    minimap.getBoundingClientRect = () =>
      ({
        bottom: 120,
        height: 100,
        left: 10,
        right: 210,
        toJSON: () => ({}),
        top: 20,
        width: 200,
        x: 10,
        y: 20,
      }) as DOMRect;
    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 110,
          clientY: 70,
        }),
      );
    });
    expect(navigations).toEqual([
      { x: model.map.width / 2, y: model.map.height / 2 },
    ]);
  });

  test("removes an already expired marker", async () => {
    const minimap = await mountPing(
      Date.now() - MINIMAP_PING_DURATION_MS - 1,
      () => {},
    );
    expect(
      minimap.querySelectorAll("[data-testid=descent-minimap-ping]"),
    ).toHaveLength(0);
  });
});
