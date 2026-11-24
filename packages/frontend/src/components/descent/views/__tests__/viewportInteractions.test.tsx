/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Command } from "../../logic/types";
import { DescentMinimap } from "../DescentMinimap";
import { MapViewport, type MapViewportProps } from "../MapViewport";
import { createAshenGatePreview } from "../preview";
import { EMPTY_SELECTION, type MapPoint } from "../selection";
import { buildShellModel } from "../shellModel";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedView {
  container: HTMLDivElement;
  root: Root;
}

let mounted: MountedView | undefined;

afterEach(async () => {
  if (mounted === undefined) return;
  const current = mounted;
  mounted = undefined;
  await act(async () => current.root.unmount());
  current.container.remove();
});

/**
 * Returns a fixed client rectangle for deterministic pointer tests.
 * @param width - Box width in pixels
 * @param height - Box height in pixels
 * @returns DOMRect anchored at (0, 0)
 */
function rectOf(width: number, height: number): DOMRect {
  return {
    bottom: height,
    height,
    left: 0,
    right: width,
    toJSON: () => ({}),
    top: 0,
    width,
    x: 0,
    y: 0,
  } as DOMRect;
}

/**
 * Mounts `MapViewport` with sensible defaults and overridable callbacks.
 * @param overrides - Partial props to override for a specific interaction test
 * @returns The mounted container and model
 */
async function mountMapViewport(overrides: Partial<MapViewportProps> = {}) {
  const model = buildShellModel(createAshenGatePreview());
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };

  const props: MapViewportProps = {
    camera: { x: 0, y: 0 },
    inspected: null,
    model,
    onCameraChange: () => {},
    onCommand: () => {},
    onCursor: () => {},
    onInspect: () => {},
    onPlace: () => {},
    onSelectBuilding: () => {},
    onSelectUnits: () => {},
    onSetRally: () => {},
    placing: false,
    placingFootprint: 1,
    rallyBuildingId: null,
    selection: EMPTY_SELECTION,
    settingRally: false,
    status: null,
    ...overrides,
  };

  await act(async () => {
    root.render(<MapViewport {...props} />);
  });

  const map = container.querySelector("[data-testid=descent-map]");
  if (!(map instanceof HTMLElement)) throw new Error("Missing map");
  map.getBoundingClientRect = () => rectOf(800, 600);
  return { container, map, model };
}

describe("MapViewport targeting modes and minimap orders", () => {
  test("right-click cancels placing, attackMoving, and settingRally without issuing unit orders", async () => {
    const commands: Command[] = [];
    let cancelledPlacement = 0;
    let cancelledAttackMove = 0;
    let cancelledRally = 0;

    const { map } = await mountMapViewport({
      onCancelPlacement: () => {
        cancelledPlacement += 1;
      },
      onCommand: (command) => commands.push(command),
      placing: true,
      selection: { buildingId: null, unitIds: ["warden-1"] },
    });

    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
        }),
      );
    });
    expect(cancelledPlacement).toBe(1);
    expect(commands).toHaveLength(0);

    await act(async () => {
      mounted?.root.render(
        <MapViewport
          attackMoving={true}
          camera={{ x: 0, y: 0 }}
          inspected={null}
          model={buildShellModel(createAshenGatePreview())}
          onCameraChange={() => {}}
          onCancelAttackMove={() => {
            cancelledAttackMove += 1;
          }}
          onCommand={(command) => commands.push(command)}
          onCursor={() => {}}
          onInspect={() => {}}
          onPlace={() => {}}
          onSelectBuilding={() => {}}
          onSelectUnits={() => {}}
          onSetRally={() => {}}
          placing={false}
          placingFootprint={1}
          rallyBuildingId={null}
          selection={{ buildingId: null, unitIds: ["warden-1"] }}
          settingRally={false}
          status={null}
        />,
      );
    });

    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
        }),
      );
    });
    expect(cancelledAttackMove).toBe(1);
    expect(commands).toHaveLength(0);

    await act(async () => {
      mounted?.root.render(
        <MapViewport
          camera={{ x: 0, y: 0 }}
          inspected={null}
          model={buildShellModel(createAshenGatePreview())}
          onCameraChange={() => {}}
          onCancelRally={() => {
            cancelledRally += 1;
          }}
          onCommand={(command) => commands.push(command)}
          onCursor={() => {}}
          onInspect={() => {}}
          onPlace={() => {}}
          onSelectBuilding={() => {}}
          onSelectUnits={() => {}}
          onSetRally={() => {}}
          placing={false}
          placingFootprint={1}
          rallyBuildingId="camp-1"
          selection={{ buildingId: "camp-1", unitIds: [] }}
          settingRally={true}
          status={null}
        />,
      );
    });

    await act(async () => {
      map.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 120,
          clientY: 80,
        }),
      );
    });
    expect(cancelledRally).toBe(1);
    expect(commands).toHaveLength(0);
  });

  test("left-click in attackMoving emits order_attack_move and passes through entity buttons", async () => {
    const commands: Command[] = [];
    const selected: string[][] = [];
    let cancelled = 0;

    const { container } = await mountMapViewport({
      attackMoving: true,
      onCancelAttackMove: () => {
        cancelled += 1;
      },
      onCommand: (command) => commands.push(command),
      onSelectUnits: (ids) => selected.push([...ids]),
      selection: { buildingId: null, unitIds: ["warden-1"] },
    });

    const unitButton = container.querySelector('[data-unit-id="warden-1"]');
    if (!(unitButton instanceof HTMLButtonElement)) {
      throw new Error("Missing unit button");
    }

    await act(async () => {
      unitButton.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 200,
          clientY: 160,
        }),
      );
      unitButton.click();
    });

    expect(selected).toHaveLength(0);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe("order_attack_move");
    expect(cancelled).toBe(1);
  });

  test("minimap right-click sets rally; attack-move uses left-click to order and right-click to cancel", async () => {
    const rallies: MapPoint[] = [];
    const commands: Command[] = [];
    let cancelled = 0;

    const { container } = await mountMapViewport({
      onSetRally: (point) => rallies.push(point),
      rallyBuildingId: "camp-1",
      selection: { buildingId: "camp-1", unitIds: [] },
    });

    const minimap = container.querySelector("[data-testid=descent-minimap]");
    if (!(minimap instanceof HTMLButtonElement)) {
      throw new Error("Missing minimap");
    }
    minimap.getBoundingClientRect = () => rectOf(200, 100);

    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 2,
          clientX: 100,
          clientY: 50,
        }),
      );
    });
    expect(rallies).toHaveLength(1);

    await act(async () => {
      mounted?.root.render(
        <MapViewport
          attackMoving={true}
          camera={{ x: 0, y: 0 }}
          inspected={null}
          model={buildShellModel(createAshenGatePreview())}
          onCameraChange={() => {}}
          onCancelAttackMove={() => {
            cancelled += 1;
          }}
          onCommand={(command) => commands.push(command)}
          onCursor={() => {}}
          onInspect={() => {}}
          onPlace={() => {}}
          onSelectBuilding={() => {}}
          onSelectUnits={() => {}}
          onSetRally={() => {}}
          placing={false}
          placingFootprint={1}
          rallyBuildingId={null}
          selection={{ buildingId: null, unitIds: ["warden-1"] }}
          settingRally={false}
          status={null}
        />,
      );
    });

    // Right-click on minimap while attack-moving cancels instead of ordering.
    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 2,
          clientX: 100,
          clientY: 50,
        }),
      );
    });
    expect(commands).toHaveLength(0);
    expect(cancelled).toBe(1);

    // Left-click on minimap while attack-moving issues order_attack_move.
    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 100,
          clientY: 50,
        }),
      );
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe("order_attack_move");
    expect(cancelled).toBe(2);
  });
});

describe("DescentMinimap drag panning and fog layer z-index", () => {
  test("drags camera smoothly while left button is held and stops after pointerup", async () => {
    const model = buildShellModel(createAshenGatePreview());
    const navigations: MapPoint[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { container, root };

    await act(async () => {
      root.render(
        <DescentMinimap
          model={model}
          onNavigate={(point) => navigations.push(point)}
          view={{ centerX: 0, centerY: 0, height: 20, rotation: 0, width: 30 }}
        />,
      );
    });

    const minimap = container.querySelector("[data-testid=descent-minimap]");
    if (!(minimap instanceof HTMLButtonElement)) {
      throw new Error("Missing minimap");
    }
    minimap.getBoundingClientRect = () => rectOf(200, 100);

    await act(async () => {
      minimap.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 50,
          clientY: 25,
        }),
      );
      minimap.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 100,
          clientY: 50,
        }),
      );
      minimap.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 100,
          clientY: 50,
        }),
      );
      minimap.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 150,
          clientY: 75,
        }),
      );
    });

    expect(navigations).toEqual([
      { x: model.map.width * 0.25, y: model.map.height * 0.25 },
      { x: model.map.width * 0.5, y: model.map.height * 0.5 },
    ]);
  });

  test("renders fog canvas above the entity canvas with pointer-events none", async () => {
    const baseModel = buildShellModel(createAshenGatePreview());
    const model = {
      ...baseModel,
      fog: { cells: "0122", height: 2, width: 2 },
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted = { container, root };

    await act(async () => {
      root.render(
        <DescentMinimap
          model={model}
          onNavigate={() => {}}
          view={{ centerX: 0, centerY: 0, height: 20, rotation: 0, width: 30 }}
        />,
      );
    });

    const canvases = Array.from(container.querySelectorAll("canvas"));
    expect(canvases).toHaveLength(2);
    const [entityCanvas, fogCanvas] = canvases;
    expect(entityCanvas?.style.zIndex).toBe("1");
    expect(fogCanvas?.getAttribute("data-testid")).toBe("descent-fog");
    expect(fogCanvas?.style.zIndex).toBe("2");
    expect(fogCanvas?.style.pointerEvents).toBe("none");
  });
});
