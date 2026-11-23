/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import type { DescentUnitAcknowledgementKind } from "../audio/descentCommandAck";
import { emitDescentUnitAcknowledgement } from "../audio/descentCommandAck";
import {
  isWallType,
  type WallCell,
  wallLineCells,
} from "../logic/economy/wallLine";
import type { Command } from "../logic/types";
import { loadAshenGateThreeDAssets } from "./ashenGateThreeDAssets";
import { commandCursorFor } from "./commandCursor";
import type {
  DescentBabylonSceneHandle,
  DescentScenePick,
  DescentScreenBox,
} from "./createDescentBabylonScene";
import {
  DescentMinimap,
  dockMinimap,
  type MinimapView,
} from "./DescentMinimap";
import styles from "./descentView.module.scss";
import { inspectRing, inspectTargetAt } from "./inspect";
import {
  createLoadingTracker,
  type LoadingProgress,
  settleWithin,
} from "./loadingProgress";
import { MapViewport, type MapViewportProps } from "./MapViewport";
import { placementGroundValid } from "./placementValidity";
import {
  isLocalPlayerOwned,
  type MapPoint,
  nodeNear,
  orderMarkerFor,
  ordersForRightClick,
  placementBuilders,
  similarVisibleUnitIds,
} from "./selection";

/** A resource node under the pointer and where to draw its label. */
interface NodeHint {
  label: string;
  left: number;
  resource: string;
  top: number;
}

/**
 * Plain-language resource name for the hover label.
 * @param resource - Stockpile resource id
 * @returns The id with underscores as spaces and a capital first letter
 */
function resourceName(resource: string): string {
  const spaced = resource.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * What clicking a hovered resource node will do right now.
 * @param settingRally - Whether the "Set rally" tool is armed (left-click)
 * @param rallyBuildingId - Selected Camp or Barracks, which rallies on right-click
 * @returns One line of instruction for the hover label
 */
function nodeHintAction(
  settingRally: boolean,
  rallyBuildingId: string | null,
): string {
  if (settingRally) return "Click to rally here. New villagers will gather it.";
  if (rallyBuildingId !== null) {
    return "Right-click to rally here. New villagers will gather it.";
  }
  return "Select villagers, then right-click to gather.";
}

/**
 * Longest the opening load may hold the battlefield back. Anything still
 * loading after this keeps streaming in behind the live game.
 */
const LOAD_DEADLINE_MS = 30_000;
/** Minimum interval between hover raycasts on pointermove (~30Hz). */
const HOVER_PICK_INTERVAL_MS = 32;

/** Battlefield props plus opening-load reporting. */
export interface DescentBabylonViewportProps extends MapViewportProps {
  /**
   * Places a dragged wall line, one piece per cell. Shift keeps the wall tool
   * armed so the next drag chains on.
   */
  onPlaceLine?: (cells: WallCell[], keepPlacing: boolean) => void;
  /** Receives counts as models, paintings, and shaders load. */
  onLoadProgress?: (progress: LoadingProgress) => void;
  /**
   * Fired once when the battlefield is ready to show: every model and
   * painting has loaded or fallen back, or the load deadline passed.
   */
  onLoaded?: () => void;
}

interface DragState {
  additive: boolean;
  pointerId: number;
  startX: number;
  startY: number;
}

/**
 * Detects a browser WebGL surface before importing Babylon. Test and legacy
 * environments immediately retain the fully functional DOM renderer.
 * @returns Whether the browser exposes WebGL 1 or 2
 */
export function canUseBabylonRts(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof window.WebGLRenderingContext !== "undefined" ||
    typeof window.WebGL2RenderingContext !== "undefined"
  );
}

/**
 * Rounds a map point to its building cell.
 * @param point - Continuous map point
 * @returns The nearest whole cell
 */
function snapCell(point: MapPoint): WallCell {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * Ghost pieces for a wall drag, each tinted by whether its ground is clear.
 * @param props - Current model and wall type being placed
 * @param start - Cell where the drag began
 * @param end - Cell under the pointer
 * @returns Ghost cells with validity
 */
function wallLineGhosts(
  props: DescentBabylonViewportProps,
  start: WallCell,
  end: WallCell,
): { valid: boolean; x: number; y: number }[] {
  const type = props.placingType ?? "wall";
  return wallLineCells(start, end).map((cell) => ({
    ...cell,
    valid: placementGroundValid(props.model, type, cell),
  }));
}

/**
 * Adds class-specific selection and command responses at the shared viewport
 * boundary, so both Babylon and the DOM fallback publish the same audio events.
 * @param props - Original renderer-neutral viewport callbacks and read model
 * @returns Props whose interaction callbacks also publish audio events
 */
function withUnitAcknowledgement(
  props: DescentBabylonViewportProps,
): DescentBabylonViewportProps {
  return {
    ...props,
    onCommand: (command) => {
      props.onCommand(command);
      acknowledgeCommand(props, command);
    },
    onPlace: (point, queue) => {
      const builderIds = placementBuilders(
        props.model.units,
        props.selection,
        props.localPlayerId,
      );
      props.onPlace(point, queue);
      acknowledgeFirstUnit(props, builderIds, "command", true);
    },
    onPlaceLine:
      props.onPlaceLine &&
      ((cells, keep) => {
        const builderIds = placementBuilders(
          props.model.units,
          props.selection,
          props.localPlayerId,
        );
        props.onPlaceLine?.(cells, keep);
        acknowledgeFirstUnit(props, builderIds, "command", true);
      }),
    onSelectUnits: (ids, mode) => {
      props.onSelectUnits(ids, mode);
      const addedIds =
        mode === "replace"
          ? ids
          : ids.filter((id) => !props.selection.unitIds.includes(id));
      acknowledgeFirstUnit(props, addedIds, "select");
    },
  };
}

/**
 * Publishes one response for the first controllable actor in an issued order.
 * @param props - Current units and local ownership
 * @param command - Order forwarded to the simulation
 */
function acknowledgeCommand(
  props: DescentBabylonViewportProps,
  command: Command,
): void {
  if (!("unitIds" in command)) return;
  acknowledgeFirstUnit(props, command.unitIds, "command");
}

/**
 * Resolves a response from the first eligible Hold unit in interaction order.
 * @param props - Current units and local ownership
 * @param unitIds - Units selected or commanded by the interaction
 * @param kind - Selection or command response
 * @param villagersOnly - Restricts building-placement responses to builders
 */
function acknowledgeFirstUnit(
  props: DescentBabylonViewportProps,
  unitIds: readonly string[],
  kind: DescentUnitAcknowledgementKind,
  villagersOnly = false,
): void {
  if (unitIds.length === 0) return;
  const unitsById = new Map(
    props.model.units.map((entry) => [entry.id, entry]),
  );
  for (const id of unitIds) {
    const unit = unitsById.get(id);
    if (unit === undefined || unit.factionId !== "hold") continue;
    if (!isLocalPlayerOwned(unit, props.localPlayerId)) continue;
    if (villagersOnly && unit.classId !== "villager") continue;
    emitDescentUnitAcknowledgement(unit.classId, kind);
    return;
  }
}

/**
 * Applies the context cursor for the latest picked target to the canvas.
 * Rally targeting keeps the default cursor because it issues no unit order.
 * @param canvas - Babylon canvas whose inline cursor should change
 * @param props - Current selection, targets, and placement state
 * @param picked - Latest hovered scene target, or null before a valid pick
 */
function updateCommandCursor(
  canvas: HTMLCanvasElement,
  props: Pick<
    DescentBabylonViewportProps,
    | "localPlayerId"
    | "model"
    | "placing"
    | "rallyBuildingId"
    | "selection"
    | "settingRally"
  >,
  picked: DescentScenePick | null,
): void {
  const acceptsUnitOrders =
    props.rallyBuildingId === null && !props.settingRally;
  canvas.style.cursor = commandCursorFor({
    buildings: props.model.buildings,
    ground: picked?.point ?? null,
    localPlayerId: props.localPlayerId,
    nodes: props.model.nodes,
    placing: props.placing && !props.settingRally,
    selectedIds: acceptsUnitOrders ? props.selection.unitIds : [],
    targetBuildingId: picked?.buildingId ?? null,
    targetUnitId: picked?.unitId ?? null,
    units: props.model.units,
  });
}

/**
 * Babylon-backed RTS battlefield with the same renderer-neutral command
 * contract as the accessible DOM map.
 * @param props - Current read model, selection, camera, and command callbacks
 * @returns A Babylon canvas or the DOM fallback when WebGL cannot start
 */
export function DescentBabylonViewport(props: DescentBabylonViewportProps) {
  const acknowledgedProps = withUnitAcknowledgement(props);
  if (!canUseBabylonRts()) {
    return <ReadyMapViewport {...acknowledgedProps} />;
  }
  return <ActiveBabylonViewport {...acknowledgedProps} />;
}

/**
 * The DOM map has nothing to stream, so it reports ready as soon as it
 * mounts.
 * @param props - Map props and the ready callback
 * @returns The accessible DOM map
 */
function ReadyMapViewport({
  onLoaded,
  onLoadProgress: _onLoadProgress,
  ...props
}: DescentBabylonViewportProps) {
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  useEffect(() => {
    onLoadedRef.current?.();
  }, []);
  return <MapViewport {...props} />;
}

/**
 * Mounts and synchronizes the imperative scene only in WebGL-capable browsers.
 * @param props - Current read model and renderer-neutral interaction callbacks
 * @returns The interactive canvas and lightweight HTML overlays
 */
function ActiveBabylonViewport(props: DescentBabylonViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DescentBabylonSceneHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const hoverRef = useRef<DescentScenePick | null>(null);
  const pointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  /** Wall-clock timestamp of the most recent hover raycast. */
  const lastHoverPickTimeRef = useRef(0);
  /** Pending animation frame for throttled pointermove hover picking. */
  const hoverFrameRef = useRef<number | null>(null);
  /** Pending timer for throttled pointermove hover picking. */
  const hoverTimerRef = useRef<number | null>(null);
  /** Whether a non-null cursor point was last sent to the parent. */
  const cursorSentRef = useRef(false);
  /** Last synced scene inputs so handle.update skips no-op renders. */
  const lastSyncedRef = useRef<{
    handle: DescentBabylonSceneHandle | null;
    model: DescentBabylonViewportProps["model"];
    placing: boolean;
    placingFootprint: number | undefined;
    placingType: string | null | undefined;
    selection: DescentBabylonViewportProps["selection"];
  } | null>(null);
  /** Wall line being dragged out: its anchor cell and pointer. */
  const wallDragRef = useRef<{ pointerId: number; start: WallCell } | null>(
    null,
  );

  /** Abandons an in-progress wall line and hides its ghosts. */
  const cancelWallDrag = (): void => {
    wallDragRef.current = null;
    handleRef.current?.setPlacementLine(null);
  };
  const [dragBox, setDragBox] = useState<DescentScreenBox | null>(null);
  const [nodeHint, setNodeHint] = useState<NodeHint | null>(null);
  const [failed, setFailed] = useState(false);
  const [minimapView, setMinimapView] = useState<MinimapView>(() => {
    const openingAnchor =
      props.model.buildings.find(
        (building) =>
          building.factionId === "hold" &&
          building.buildingType === "camp" &&
          isLocalPlayerOwned(building, props.localPlayerId),
      ) ??
      props.model.buildings.find(
        (building) =>
          building.factionId === "hold" && building.buildingType === "camp",
      ) ??
      props.model.buildings.find((building) => building.factionId === "hold");
    return {
      centerX: Math.min(
        openingAnchor === undefined ? 18 : openingAnchor.x + 12,
        props.model.map.width,
      ),
      centerY: openingAnchor?.y ?? props.model.map.height / 2,
      height: Math.min(36, props.model.map.height),
      rotation: 0,
      width: Math.min(58, props.model.map.width),
    };
  });
  const { clientServiceCallers } = useClientServiceCallers();

  /** Cancels any queued hover raycast work. */
  const cancelPendingHover = useCallback((): void => {
    if (hoverFrameRef.current !== null) {
      window.cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => cancelPendingHover, [cancelPendingHover]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let active = true;
    const tracker = createLoadingTracker((progress) => {
      if (active) latest.current.onLoadProgress?.(progress);
    });
    const sceneModule = tracker.track(
      "Raising the battlefield",
      import("./createDescentBabylonScene"),
    );
    const generated = tracker.track(
      "Charting the Ashen Gate",
      loadAshenGateThreeDAssets(clientServiceCallers),
    );

    /**
     * Builds the scene, then streams every generated model and painting
     * into it and waits for shaders, so the first shown frame is complete.
     * @returns Resolves when the battlefield is ready; rejects if WebGL fails
     */
    const open = async (): Promise<void> => {
      const { createDescentBabylonScene } = await sceneModule;
      if (!active) return;
      const current = latest.current;
      const handle = createDescentBabylonScene(
        canvas,
        current.model,
        current.selection,
        {},
        () => undefined,
        setMinimapView,
      );
      const initialCamp =
        current.model.buildings.find(
          (building) =>
            building.factionId === "hold" &&
            building.buildingType === "camp" &&
            isLocalPlayerOwned(building, current.localPlayerId),
        ) ??
        current.model.buildings.find(
          (building) =>
            building.factionId === "hold" && building.buildingType === "camp",
        );
      if (initialCamp !== undefined) {
        handle.focusCamera({ x: initialCamp.x, y: initialCamp.y });
      }
      handleRef.current = handle;
      lastSyncedRef.current = {
        handle,
        model: current.model,
        placing: current.placing,
        placingFootprint: current.placingFootprint,
        placingType: current.placingType,
        selection: current.selection,
      };
      const { assets, textures } = await generated;
      if (!active) return;
      await Promise.all([
        handle.setAssets(assets, tracker.track),
        handle.setTextures(textures, tracker.track),
      ]);
      if (!active) return;
      await tracker.track("Kindling the forges", handle.whenReady());
    };

    const opening = open();
    opening.catch(() => {
      if (active) setFailed(true);
    });
    void settleWithin(opening, LOAD_DEADLINE_MS).then(() => {
      if (active) latest.current.onLoaded?.();
    });
    return () => {
      active = false;
      handleRef.current?.dispose();
      handleRef.current = null;
      lastSyncedRef.current = null;
    };
    // The scene owns a stable canvas and the service callers are a
    // browser-wide singleton; snapshots are synchronized below.
  }, [clientServiceCallers]);

  useEffect(() => {
    const handle = handleRef.current;
    if (handle === null) return;
    const prev = lastSyncedRef.current;
    if (
      prev !== null &&
      prev.handle === handle &&
      prev.model === props.model &&
      prev.selection === props.selection &&
      prev.placing === props.placing &&
      prev.placingFootprint === props.placingFootprint &&
      prev.placingType === props.placingType
    ) {
      return;
    }
    lastSyncedRef.current = {
      handle,
      model: props.model,
      placing: props.placing,
      placingFootprint: props.placingFootprint,
      placingType: props.placingType,
      selection: props.selection,
    };
    const pointer = pointerRef.current;
    const point = props.placing
      ? (hoverRef.current?.point ??
        (pointer === null
          ? null
          : (handle.pick(pointer.clientX, pointer.clientY)?.point ?? null)))
      : null;
    const valid =
      point !== null && props.placingType != null
        ? placementGroundValid(props.model, props.placingType, point)
        : null;
    handle.update(props.model, props.selection, props.placing, {
      footprint: props.placingFootprint,
      point,
      valid,
    });
  }, [
    props.model,
    props.placing,
    props.placingFootprint,
    props.placingType,
    props.selection,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    updateCommandCursor(
      canvas,
      {
        localPlayerId: props.localPlayerId,
        model: props.model,
        placing: props.placing,
        rallyBuildingId: props.rallyBuildingId,
        selection: props.selection,
        settingRally: props.settingRally,
      },
      hoverRef.current,
    );
  }, [
    props.localPlayerId,
    props.model,
    props.placing,
    props.rallyBuildingId,
    props.selection,
    props.settingRally,
  ]);

  const focusId = props.focusRequest?.id ?? null;
  const focusPoint = useRef<MapPoint | null>(null);
  focusPoint.current = props.focusRequest?.point ?? null;
  useEffect(() => {
    if (focusId === null || focusPoint.current === null) return;
    handleRef.current?.focusCamera(focusPoint.current);
  }, [focusId]);

  const ring = inspectRing(props.model, props.inspected);
  const ringKey = ring === null ? "" : `${ring.x},${ring.y},${ring.radius}`;
  useEffect(() => {
    const [x, y, radius] = ringKey.split(",").map(Number);
    handleRef.current?.setInspectRing(
      ringKey === "" ||
        x === undefined ||
        y === undefined ||
        radius === undefined
        ? null
        : { radius, x, y },
    );
  }, [ringKey]);

  /** Clears hover-owned cursor and placement feedback after leaving or cancellation. */
  const clearPointerHover = useCallback((): void => {
    cancelPendingHover();
    pointerRef.current = null;
    hoverRef.current = null;
    if (canvasRef.current !== null) {
      canvasRef.current.style.cursor = "default";
    }
    if (cursorSentRef.current) {
      cursorSentRef.current = false;
      latest.current.onCursor(null);
    }
    setNodeHint((current) => (current === null ? current : null));
    handleRef.current?.setPlacementPoint(null);
  }, [cancelPendingHover]);

  /** Recenters the Babylon camera from a minimap click. */
  const handleMinimapNavigate = useCallback((point: MapPoint): void => {
    handleRef.current?.focusCamera(point);
  }, []);

  /** Issues a right-click or Shift-click order from the minimap. */
  const handleMinimapOrder = useCallback(
    (point: MapPoint, queue: boolean): void => {
      const current = latest.current;
      const orders = ordersForRightClick({
        buildings: current.model.buildings,
        ground: point,
        localPlayerId: current.localPlayerId,
        nodes: current.model.nodes,
        queue,
        selectedIds: current.selection.unitIds,
        targetBuildingId: null,
        targetUnitId: null,
        units: current.model.units,
      });
      for (const order of orders) current.onCommand(order);
      const marker = orderMarkerFor({
        buildings: current.model.buildings,
        ground: point,
        nodes: current.model.nodes,
        orders,
        units: current.model.units,
      });
      if (marker !== null) handleRef.current?.showOrderMarker(marker);
    },
    [],
  );

  /** Runs the throttled hover raycast and updates cursor, placement, and node hint. */
  const flushHoverPick = useCallback((): void => {
    hoverFrameRef.current = null;
    hoverTimerRef.current = null;
    const pointer = pointerRef.current;
    if (pointer === null) return;
    lastHoverPickTimeRef.current = performance.now();
    const current = latest.current;
    const picked = handleRef.current?.pick(pointer.clientX, pointer.clientY);
    hoverRef.current = picked ?? null;
    if (canvasRef.current !== null) {
      updateCommandCursor(canvasRef.current, current, hoverRef.current);
    }
    if (current.placing) {
      const point = picked?.point ?? null;
      cursorSentRef.current = point !== null;
      current.onCursor(point);
    } else if (cursorSentRef.current) {
      cursorSentRef.current = false;
      current.onCursor(null);
    }
    const hovered =
      picked === undefined ? null : nodeNear(current.model.nodes, picked.point);
    if (hovered === null) {
      setNodeHint((prev) => (prev === null ? prev : null));
    } else {
      const rect = frameRef.current?.getBoundingClientRect() ?? new DOMRect();
      const nextLeft = Math.round(pointer.clientX - rect.left);
      const nextTop = Math.round(pointer.clientY - rect.top);
      const nextResource = resourceName(hovered.resource);
      setNodeHint((prev) => {
        if (
          prev !== null &&
          prev.label === hovered.label &&
          prev.resource === nextResource &&
          prev.left === nextLeft &&
          prev.top === nextTop
        ) {
          return prev;
        }
        return {
          label: hovered.label,
          left: nextLeft,
          resource: nextResource,
          top: nextTop,
        };
      });
    }
    const placementPoint = current.placing ? (picked?.point ?? null) : null;
    const placementValid =
      placementPoint !== null &&
      current.placingType !== null &&
      current.placingType !== undefined
        ? placementGroundValid(
            current.model,
            current.placingType,
            placementPoint,
          )
        : null;
    handleRef.current?.setPlacementPoint(
      placementPoint,
      current.placingFootprint,
      placementValid,
    );
    const wallDrag = wallDragRef.current;
    if (wallDrag !== null && picked !== undefined) {
      handleRef.current?.setPlacementLine(
        wallLineGhosts(current, wallDrag.start, snapCell(picked.point)),
      );
    }
  }, []);

  /** Schedules a hover raycast at most once per `HOVER_PICK_INTERVAL_MS`. */
  const scheduleHoverPick = useCallback((): void => {
    if (hoverFrameRef.current !== null || hoverTimerRef.current !== null) {
      return;
    }
    const elapsed = performance.now() - lastHoverPickTimeRef.current;
    if (elapsed >= HOVER_PICK_INTERVAL_MS) {
      hoverFrameRef.current = window.requestAnimationFrame(flushHoverPick);
      return;
    }
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      hoverFrameRef.current = window.requestAnimationFrame(flushHoverPick);
    }, HOVER_PICK_INTERVAL_MS - elapsed);
  }, [flushHoverPick]);

  if (failed) return <MapViewport {...props} />;

  /** Returns the current frame rectangle or a harmless zero-sized stand-in. */
  const frameRect = (): DOMRect =>
    frameRef.current?.getBoundingClientRect() ?? new DOMRect();

  return (
    <div
      aria-label="Ashen Gate 3D battlefield"
      className={styles.mapFrame}
      data-testid="descent-map"
      onContextMenu={(event) => {
        event.preventDefault();
        if (wallDragRef.current !== null) {
          cancelWallDrag();
          return;
        }
        const picked = handleRef.current?.pick(event.clientX, event.clientY);
        if (picked === undefined) return;
        if (props.rallyBuildingId !== null) {
          props.onSetRally(picked.point);
          const node = nodeNear(props.model.nodes, picked.point);
          handleRef.current?.showOrderMarker({
            kind: node === null ? "move" : "gather",
            point: node ?? picked.point,
          });
          return;
        }
        const orders = ordersForRightClick({
          buildings: props.model.buildings,
          ground: picked.point,
          localPlayerId: props.localPlayerId,
          nodes: props.model.nodes,
          queue: event.shiftKey,
          selectedIds: props.selection.unitIds,
          targetBuildingId: picked.buildingId,
          targetUnitId: picked.unitId,
          units: props.model.units,
        });
        for (const order of orders) props.onCommand(order);
        const marker = orderMarkerFor({
          buildings: props.model.buildings,
          ground: picked.point,
          nodes: props.model.nodes,
          orders,
          units: props.model.units,
        });
        if (marker !== null) handleRef.current?.showOrderMarker(marker);
      }}
      onDoubleClick={(event) => {
        const picked = handleRef.current?.pick(event.clientX, event.clientY);
        if (picked === undefined || picked.unitId === null) return;
        const canvas = canvasRef.current?.getBoundingClientRect();
        const visibleIds =
          canvas === undefined
            ? []
            : (handleRef.current?.unitsInScreenBox({
                bottom: canvas.bottom,
                left: canvas.left,
                right: canvas.right,
                top: canvas.top,
              }) ?? []);
        props.onSelectUnits(
          similarVisibleUnitIds(
            props.model.units,
            picked.unitId,
            visibleIds,
            props.localPlayerId,
          ),
          event.shiftKey ? "add" : "replace",
        );
      }}
      onPointerCancel={(event) => {
        dragRef.current = null;
        setDragBox(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        clearPointerHover();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const picked = handleRef.current?.pick(event.clientX, event.clientY);
        if (picked === undefined) return;
        if (props.settingRally) {
          props.onSetRally(picked.point);
          return;
        }
        if (props.placing && isWallType(props.placingType)) {
          wallDragRef.current = {
            pointerId: event.pointerId,
            start: snapCell(picked.point),
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (props.placing) {
          props.onPlace(picked.point, event.shiftKey);
          if (!event.shiftKey) handleRef.current?.setPlacementPoint(null);
          return;
        }
        if (picked.unitId !== null) {
          props.onSelectUnits(
            [picked.unitId],
            event.shiftKey ? "toggle" : "replace",
          );
          return;
        }
        if (picked.buildingId !== null) {
          props.onSelectBuilding(picked.buildingId);
          return;
        }
        if (picked.sceneryId !== null) {
          props.onInspect({ id: picked.sceneryId, kind: "scenery" });
          return;
        }
        const feature = inspectTargetAt(props.model, picked.point);
        if (feature !== null) {
          props.onInspect(feature);
          return;
        }
        dragRef.current = {
          additive: event.shiftKey,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerLeave={clearPointerHover}
      onPointerMove={(event) => {
        pointerRef.current = { clientX: event.clientX, clientY: event.clientY };
        const drag = dragRef.current;
        if (drag !== null) {
          setDragBox({
            bottom: event.clientY,
            left: drag.startX,
            right: event.clientX,
            top: drag.startY,
          });
          return;
        }
        scheduleHoverPick();
      }}
      onPointerUp={(event) => {
        const wallDrag = wallDragRef.current;
        if (wallDrag !== null) {
          const picked = handleRef.current?.pick(event.clientX, event.clientY);
          cancelWallDrag();
          if (event.currentTarget.hasPointerCapture(wallDrag.pointerId)) {
            event.currentTarget.releasePointerCapture(wallDrag.pointerId);
          }
          const end =
            picked === undefined ? wallDrag.start : snapCell(picked.point);
          const cells = wallLineCells(wallDrag.start, end);
          if (cells.length === 1) {
            props.onPlace(wallDrag.start, event.shiftKey);
            return;
          }
          props.onPlaceLine?.(cells, event.shiftKey);
          return;
        }
        const drag = dragRef.current;
        dragRef.current = null;
        setDragBox(null);
        if (drag === null) return;
        if (event.currentTarget.hasPointerCapture(drag.pointerId)) {
          event.currentTarget.releasePointerCapture(drag.pointerId);
        }
        const distance = Math.hypot(
          event.clientX - drag.startX,
          event.clientY - drag.startY,
        );
        if (distance < 6) {
          if (!drag.additive) props.onSelectUnits([], "replace");
          return;
        }
        const ownedUnitIds = new Set<string>();
        for (const unit of props.model.units) {
          if (isLocalPlayerOwned(unit, props.localPlayerId)) {
            ownedUnitIds.add(unit.id);
          }
        }
        const ids =
          handleRef.current
            ?.unitsInScreenBox({
              bottom: event.clientY,
              left: drag.startX,
              right: event.clientX,
              top: drag.startY,
            })
            .filter((unitId) => ownedUnitIds.has(unitId)) ?? [];
        props.onSelectUnits(ids, drag.additive ? "add" : "replace");
      }}
      ref={frameRef}
      role="application"
    >
      <canvas
        aria-label="Babylon.js Ashen Gate battlefield"
        className={styles.babylonCanvas}
        ref={canvasRef}
        tabIndex={0}
      />
      {dockMinimap(
        <DescentMinimap
          model={props.model}
          onNavigate={handleMinimapNavigate}
          onOrder={handleMinimapOrder}
          onPointerEnter={clearPointerHover}
          pings={props.pings}
          view={minimapView}
        />,
        props.minimapHost,
      )}
      {dragBox === null ? null : (
        <span
          className={styles.babylonSelectBox}
          style={{
            height: Math.abs(dragBox.bottom - dragBox.top),
            left: Math.min(dragBox.left, dragBox.right) - frameRect().left,
            top: Math.min(dragBox.top, dragBox.bottom) - frameRect().top,
            width: Math.abs(dragBox.right - dragBox.left),
          }}
        />
      )}
      {nodeHint === null || dragBox !== null ? null : (
        <p
          className={styles.nodeHint}
          style={{ left: nodeHint.left, top: nodeHint.top }}
        >
          <strong>
            {nodeHint.label} · {nodeHint.resource}
          </strong>
          {nodeHintAction(props.settingRally, props.rallyBuildingId)}
        </p>
      )}
      {props.status === null ? null : (
        <p className={styles.mapStatus}>{props.status}</p>
      )}
      {props.model.paused ? (
        <p className={styles.pauseOverlay}>Paused</p>
      ) : null}
    </div>
  );
}
