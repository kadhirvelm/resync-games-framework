/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useEffect, useRef, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import { loadAshenGateThreeDAssets } from "./ashenGateThreeDAssets";
import type {
  DescentBabylonSceneHandle,
  DescentScreenBox,
} from "./createDescentBabylonScene";
import { DescentMinimap, type MinimapView } from "./DescentMinimap";
import styles from "./descentView.module.scss";
import { inspectRing, inspectTargetAt } from "./inspect";
import {
  createLoadingTracker,
  type LoadingProgress,
  settleWithin,
} from "./loadingProgress";
import { MapViewport, type MapViewportProps } from "./MapViewport";
import {
  type MapPoint,
  nodeNear,
  orderMarkerFor,
  ordersForRightClick,
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

/** Battlefield props plus opening-load reporting. */
export interface DescentBabylonViewportProps extends MapViewportProps {
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
 * Babylon-backed RTS battlefield with the same renderer-neutral command
 * contract as the accessible DOM map.
 * @param props - Current read model, selection, camera, and command callbacks
 * @returns A Babylon canvas or the DOM fallback when WebGL cannot start
 */
export function DescentBabylonViewport(props: DescentBabylonViewportProps) {
  if (!canUseBabylonRts()) return <ReadyMapViewport {...props} />;
  return <ActiveBabylonViewport {...props} />;
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
  const openingAnchor =
    props.model.buildings.find(
      (building) =>
        building.factionId === "hold" && building.buildingType === "camp",
    ) ??
    props.model.buildings.find((building) => building.factionId === "hold");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<DescentBabylonSceneHandle | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const dragRef = useRef<DragState | null>(null);
  const [dragBox, setDragBox] = useState<DescentScreenBox | null>(null);
  const [nodeHint, setNodeHint] = useState<NodeHint | null>(null);
  const [failed, setFailed] = useState(false);
  const [minimapView, setMinimapView] = useState<MinimapView>({
    centerX: Math.min(
      openingAnchor === undefined ? 18 : openingAnchor.x + 12,
      props.model.map.width,
    ),
    centerY: openingAnchor?.y ?? props.model.map.height / 2,
    height: Math.min(36, props.model.map.height),
    rotation: 0,
    width: Math.min(58, props.model.map.width),
  });
  const { clientServiceCallers } = useClientServiceCallers();

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
      handleRef.current = handle;
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
    };
    // The scene owns a stable canvas and the service callers are a
    // browser-wide singleton; snapshots are synchronized below.
  }, [clientServiceCallers]);

  useEffect(() => {
    handleRef.current?.update(props.model, props.selection, props.placing);
  }, [props.model, props.placing, props.selection]);

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
          similarVisibleUnitIds(props.model.units, picked.unitId, visibleIds),
          event.shiftKey ? "add" : "replace",
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const picked = handleRef.current?.pick(event.clientX, event.clientY);
        if (picked === undefined) return;
        if (props.settingRally) {
          props.onSetRally(picked.point);
          return;
        }
        if (props.placing) {
          props.onPlace(picked.point);
          handleRef.current?.setPlacementPoint(null);
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
      onPointerLeave={() => {
        props.onCursor(null);
        setNodeHint(null);
        handleRef.current?.setPlacementPoint(null);
      }}
      onPointerMove={(event) => {
        const picked = handleRef.current?.pick(event.clientX, event.clientY);
        props.onCursor(picked?.point ?? null);
        const hovered =
          picked === undefined
            ? null
            : nodeNear(props.model.nodes, picked.point);
        const rect = frameRect();
        setNodeHint(
          hovered === null
            ? null
            : {
                label: hovered.label,
                left: event.clientX - rect.left,
                resource: resourceName(hovered.resource),
                top: event.clientY - rect.top,
              },
        );
        handleRef.current?.setPlacementPoint(
          props.placing ? (picked?.point ?? null) : null,
          props.placingFootprint,
        );
        const drag = dragRef.current;
        if (drag === null) return;
        setDragBox({
          bottom: event.clientY,
          left: drag.startX,
          right: event.clientX,
          top: drag.startY,
        });
      }}
      onPointerUp={(event) => {
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
        const ids = handleRef.current?.unitsInScreenBox({
          bottom: event.clientY,
          left: drag.startX,
          right: event.clientX,
          top: drag.startY,
        });
        props.onSelectUnits(ids ?? [], drag.additive ? "add" : "replace");
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
      <DescentMinimap
        model={props.model}
        onNavigate={(point) => handleRef.current?.focusCamera(point)}
        onOrder={(point, queue) => {
          const orders = ordersForRightClick({
            buildings: props.model.buildings,
            ground: point,
            nodes: props.model.nodes,
            queue,
            selectedIds: props.selection.unitIds,
            targetBuildingId: null,
            targetUnitId: null,
            units: props.model.units,
          });
          for (const order of orders) props.onCommand(order);
          const marker = orderMarkerFor({
            buildings: props.model.buildings,
            ground: point,
            nodes: props.model.nodes,
            orders,
            units: props.model.units,
          });
          if (marker !== null) handleRef.current?.showOrderMarker(marker);
        }}
        view={minimapView}
      />
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
