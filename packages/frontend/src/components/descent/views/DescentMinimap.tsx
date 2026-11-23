/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  memo,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./descentView.module.scss";
import { FogCanvas } from "./FogCanvas";
import {
  MINIMAP_PING_DURATION_MS,
  type MinimapPing,
  minimapPingPresentation,
  pruneMinimapPings,
} from "./minimapPings";
import { type TerrainReadout, terrainAcross } from "./presentation";
import type { MapPoint } from "./selection";
import type { ShellModel } from "./shellModel";

export type { MinimapPing } from "./minimapPings";

const EMPTY_PINGS: readonly MinimapPing[] = [];
/** Resolution of the minimap canvas along its horizontal axis. */
const MINIMAP_CANVAS_WIDTH = 256;
/** Minimum interval between dynamic entity redraws on the minimap canvas. */
const MINIMAP_REDRAW_INTERVAL_MS = 64;
/** Minimum interval between ping clock React state updates (~16fps). */
const MINIMAP_PING_TICK_MS = 60;

interface StaticLayerSnapshot {
  campSignature: string;
  height: number;
  nodeIds: readonly string[];
  terrainIds: readonly string[];
  veinIds: readonly string[];
  ventIds: readonly string[];
  width: number;
}

/**
 * Checks whether an entity list has the same ids in the same order as before.
 * @param items - Current feature list
 * @param previousIds - Previously drawn feature ids
 * @returns True when the list is unchanged
 */
function sameFeatureIds(
  items: readonly { id: string }[],
  previousIds: readonly string[],
): boolean {
  if (items.length !== previousIds.length) return false;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i]?.id !== previousIds[i]) return false;
  }
  return true;
}

/**
 * Returns fill and stroke styles matching the minimap terrain CSS tokens.
 * @param kind - Terrain kind
 * @returns Fill and stroke colors
 */
function terrainColors(kind: TerrainReadout["kind"]): {
  fill: string;
  stroke: string;
} {
  if (kind === "magma_fissure") {
    return { fill: "rgba(214, 82, 34, 0.75)", stroke: "#ff9c54" };
  }
  if (kind === "obsidian_spire") {
    return { fill: "rgba(42, 28, 58, 0.9)", stroke: "#a96de0" };
  }
  if (kind === "deep_water") {
    return {
      fill: "rgba(47, 127, 154, 0.8)",
      stroke: "rgba(120, 190, 214, 0.7)",
    };
  }
  if (kind === "bridge") {
    return { fill: "rgba(139, 106, 69, 0.95)", stroke: "#d3b080" };
  }
  return {
    fill: "rgba(56, 48, 54, 0.85)",
    stroke: "rgba(124, 108, 116, 0.8)",
  };
}

/**
 * Paints one terrain feature onto the cached static minimap layer.
 * @param ctx - Offscreen 2D context
 * @param feature - Terrain feature to draw
 * @param scaleX - Canvas pixels per map unit along x
 * @param scaleY - Canvas pixels per map unit along y
 */
function drawTerrainFeature(
  ctx: CanvasRenderingContext2D,
  feature: TerrainReadout,
  scaleX: number,
  scaleY: number,
): void {
  const { fill, stroke } = terrainColors(feature.kind);
  const cx = feature.x * scaleX;
  const cy = feature.y * scaleY;
  const w = Math.max(4, feature.radius * 2 * scaleX);
  const h = Math.max(4, terrainAcross(feature) * scaleY);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  if (feature.kind === "deep_water") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return;
  }
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
}

/**
 * Draws the fog-revealed static features (terrain, vents, veins, nodes) onto
 * a cached offscreen canvas so 20Hz entity redraws can blit them in one call.
 * @param canvas - Reusable offscreen canvas
 * @param model - Current shell model
 * @param canvasWidth - Pixel width
 * @param canvasHeight - Pixel height
 */
function paintStaticMinimapLayer(
  canvas: HTMLCanvasElement,
  model: ShellModel,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  const mapWidth = model.map.width > 0 ? model.map.width : 1;
  const mapHeight = model.map.height > 0 ? model.map.height : 1;
  const scaleX = canvasWidth / mapWidth;
  const scaleY = canvasHeight / mapHeight;

  for (let i = 0; i < model.hills.length; i += 1) {
    const hill = model.hills[i];
    if (hill === undefined) continue;
    const cx = hill.x * scaleX;
    const cy = hill.y * scaleY;
    const rx = Math.max(2, hill.radius * scaleX);
    const ry = Math.max(2, hill.radius * scaleY);
    ctx.fillStyle = "rgba(148, 126, 98, 0.22)";
    ctx.strokeStyle = "rgba(186, 158, 120, 0.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const prx = Math.max(1.2, hill.plateauRadius * scaleX);
    const pry = Math.max(1.2, hill.plateauRadius * scaleY);
    ctx.fillStyle = "rgba(196, 168, 126, 0.24)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, prx, pry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < model.terrain.length; i += 1) {
    const feature = model.terrain[i];
    if (feature === undefined || feature.kind === "bridge") continue;
    drawTerrainFeature(ctx, feature, scaleX, scaleY);
  }
  for (let i = 0; i < model.terrain.length; i += 1) {
    const feature = model.terrain[i];
    if (feature === undefined || feature.kind !== "bridge") continue;
    drawTerrainFeature(ctx, feature, scaleX, scaleY);
  }

  ctx.fillStyle = "rgba(238, 83, 62, 0.2)";
  ctx.strokeStyle = "rgba(238, 83, 62, 0.75)";
  ctx.lineWidth = 1;
  for (let i = 0; i < model.vents.length; i += 1) {
    const vent = model.vents[i];
    if (vent === undefined) continue;
    const rx = Math.max(2, vent.radius * scaleX);
    const ry = Math.max(2, vent.radius * scaleY);
    ctx.beginPath();
    ctx.ellipse(vent.x * scaleX, vent.y * scaleY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = "#59d5ef";
  for (let i = 0; i < model.veins.length; i += 1) {
    const vein = model.veins[i];
    if (vein === undefined) continue;
    ctx.beginPath();
    ctx.arc(vein.x * scaleX, vein.y * scaleY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#8eb678";
  ctx.strokeStyle = "#d0e0a9";
  ctx.lineWidth = 1;
  for (let i = 0; i < model.nodes.length; i += 1) {
    const node = model.nodes[i];
    if (node === undefined) continue;
    ctx.beginPath();
    ctx.arc(node.x * scaleX, node.y * scaleY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  for (const camp of model.exploration?.camps ?? []) {
    if (camp.cleared) continue;
    const x = camp.x * scaleX;
    const y = camp.y * scaleY;
    ctx.fillStyle = camp.cleared ? "#7fa36f" : "#d5a74e";
    ctx.strokeStyle = camp.cleared ? "#c4dfad" : "#fff0b3";
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x - 4, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * Composites the cached static layer with live buildings and units onto the
 * visible minimap canvas.
 * @param canvas - Visible minimap canvas
 * @param staticCanvas - Cached offscreen static layer, if available
 * @param model - Current shell model
 * @param canvasWidth - Pixel width
 * @param canvasHeight - Pixel height
 */
function paintDynamicMinimapLayer(
  canvas: HTMLCanvasElement,
  staticCanvas: HTMLCanvasElement | null,
  model: ShellModel,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (canvas.width !== canvasWidth) canvas.width = canvasWidth;
  if (canvas.height !== canvasHeight) canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  if (staticCanvas !== null) {
    ctx.drawImage(staticCanvas, 0, 0);
  }
  const mapWidth = model.map.width > 0 ? model.map.width : 1;
  const mapHeight = model.map.height > 0 ? model.map.height : 1;
  const scaleX = canvasWidth / mapWidth;
  const scaleY = canvasHeight / mapHeight;

  ctx.lineWidth = 1;
  for (let i = 0; i < model.buildings.length; i += 1) {
    const building = model.buildings[i];
    if (building === undefined) continue;
    const bx = building.x * scaleX;
    const by = building.y * scaleY;
    ctx.fillStyle = building.ownerColor ?? "#e0b35d";
    ctx.strokeStyle = building.ownerColor === undefined ? "#fff0bb" : "#0b0705";
    ctx.fillRect(bx - 3.5, by - 3.5, 7, 7);
    ctx.strokeRect(bx - 3.5, by - 3.5, 7, 7);
  }

  for (let i = 0; i < model.units.length; i += 1) {
    const unit = model.units[i];
    if (unit === undefined) continue;
    const ux = unit.x * scaleX;
    const uy = unit.y * scaleY;
    ctx.fillStyle =
      unit.factionId === "horde" ? "#ee533e" : (unit.ownerColor ?? "#f4dc93");
    ctx.beginPath();
    ctx.arc(ux, uy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Renders the minimap into the HUD's minimap well when one is mounted, the
 * way AoE docks it in the bottom bar; otherwise it floats over the map.
 * @param minimap - The minimap element
 * @param host - HUD element to dock into, or null to float
 * @returns The minimap, portaled when docked
 */
export function dockMinimap(
  minimap: ReactNode,
  host: HTMLElement | null | undefined,
): ReactNode {
  if (host === null || host === undefined) return minimap;
  return createPortal(minimap, host);
}

/** Camera footprint drawn over the strategic map. */
export interface MinimapView {
  centerX: number;
  centerY: number;
  height: number;
  rotation: number;
  width: number;
}

/** Props for the renderer-neutral strategic minimap. */
export interface DescentMinimapProps {
  /** Whether Attack-Move targeting is armed (left-click orders, right-click cancels). */
  attackMoving?: boolean;
  model: ShellModel;
  /** Cancels active Attack-Move targeting on minimap right-click. */
  onCancelAttackMove?: () => void;
  onNavigate: (point: MapPoint) => void;
  /**
   * Orders the selection to a point: right-click moves, Shift+click (either
   * button) queues a waypoint.
   */
  onOrder?: (point: MapPoint, queue: boolean) => void;
  /**
   * Called when the pointer enters the minimap. A docked minimap is outside
   * the map frame, so the frame uses this to drop its hover state.
   */
  onPointerEnter?: () => void;
  /**
   * Short-lived attack rings. They ignore pointer events so the existing
   * click-to-jump navigation also works when clicking directly on a ping.
   */
  pings?: readonly MinimapPing[];
  view: MinimapView;
}

/**
 * Clamps a map-space value to a finite map axis.
 * @param value - Candidate map coordinate
 * @param size - Width or height of the map
 * @returns A coordinate inside the axis
 */
function clampMapAxis(value: number, size: number): number {
  if (!(size > 0)) return 0;
  return Math.max(0, Math.min(size, value));
}

/**
 * Converts one map coordinate to a CSS percentage.
 * @param value - Coordinate on the axis
 * @param size - Full size of the axis
 * @returns Percentage from zero to one hundred
 */
function mapPercent(value: number, size: number): number {
  if (!(size > 0)) return 0;
  return (clampMapAxis(value, size) / size) * 100;
}

/**
 * Converts a pointer on the minimap into map coordinates.
 * @param clientX - Pointer x in browser pixels
 * @param clientY - Pointer y in browser pixels
 * @param rect - Minimap client rectangle
 * @param map - Playable map bounds
 * @returns The matching clamped map point
 */
export function minimapPointerToMap(
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "height" | "left" | "top" | "width">,
  map: { height: number; width: number },
): MapPoint {
  if (!(rect.width > 0) || !(rect.height > 0)) return { x: 0, y: 0 };
  return {
    x: clampMapAxis(
      ((clientX - rect.left) / rect.width) * map.width,
      map.width,
    ),
    y: clampMapAxis(
      ((clientY - rect.top) / rect.height) * map.height,
      map.height,
    ),
  };
}

/**
 * What a press on the minimap does, the way RTS minimaps read it.
 * @param button - Pointer button (0 left, 2 right)
 * @param shiftKey - Whether Shift is held
 * @param canOrder - Whether the minimap can order units at all
 * @returns `navigate` to move the camera, `move` or `queue` to order units,
 *   or null to ignore the press
 */
export function minimapPressAction(
  button: number,
  shiftKey: boolean,
  canOrder: boolean,
): "move" | "navigate" | "queue" | null {
  if (button !== 0 && button !== 2) return null;
  if (canOrder && shiftKey) return "queue";
  if (button === 0) return "navigate";
  return canOrder ? "move" : null;
}

/**
 * Small strategic overview shared by the Babylon and accessible DOM maps.
 * @param props - Map entities, camera footprint, and navigation and order
 *   callbacks
 * @returns A clickable overview that recenters the camera or orders units
 */
function DescentMinimapInner({
  attackMoving = false,
  model,
  onCancelAttackMove,
  onNavigate,
  onOrder,
  onPointerEnter,
  pings = EMPTY_PINGS,
  view,
}: DescentMinimapProps) {
  const reducedMotion = usePrefersReducedMotion();
  const now = useMinimapPingClock(pings, reducedMotion);
  const entityCanvasRef = useRef<HTMLCanvasElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const staticSnapshotRef = useRef<StaticLayerSnapshot | null>(null);
  const lastDrawTimeRef = useRef(0);
  const pendingDrawRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragPointerIdRef = useRef<number | null>(null);
  const latestModelRef = useRef(model);
  latestModelRef.current = model;

  const canvasWidth = MINIMAP_CANVAS_WIDTH;
  const canvasHeight =
    model.map.width > 0
      ? Math.max(
          1,
          Math.round(
            (MINIMAP_CANVAS_WIDTH * model.map.height) / model.map.width,
          ),
        )
      : MINIMAP_CANVAS_WIDTH;
  const canvasHeightRef = useRef(canvasHeight);
  canvasHeightRef.current = canvasHeight;

  const fogCells = model.fog?.cells;
  const fogWidth = model.fog?.width;
  const fogHeight = model.fog?.height;
  const fogLayer = useMemo(() => {
    if (
      fogCells === undefined ||
      fogWidth === undefined ||
      fogHeight === undefined
    ) {
      return null;
    }
    return (
      <FogCanvas
        className={styles.minimapFog}
        fog={{ cells: fogCells, height: fogHeight, width: fogWidth }}
        style={{ pointerEvents: "none", zIndex: 2 }}
      />
    );
  }, [fogCells, fogHeight, fogWidth]);

  useEffect(() => {
    const drawModel = (current: ShellModel) => {
      pendingDrawRef.current = null;
      const canvas = entityCanvasRef.current;
      if (canvas === null) return;
      const height = canvasHeightRef.current;
      const prev = staticSnapshotRef.current;
      const staticChanged =
        prev === null ||
        prev.width !== canvasWidth ||
        prev.height !== height ||
        prev.campSignature !==
          (current.exploration?.camps
            .map((camp) => `${camp.id}:${camp.cleared}`)
            .join("|") ?? "") ||
        !sameFeatureIds(current.terrain, prev.terrainIds) ||
        !sameFeatureIds(current.vents, prev.ventIds) ||
        !sameFeatureIds(current.veins, prev.veinIds) ||
        !sameFeatureIds(current.nodes, prev.nodeIds);

      if (staticChanged) {
        if (
          staticCanvasRef.current === null &&
          typeof document !== "undefined"
        ) {
          staticCanvasRef.current = document.createElement("canvas");
        }
        if (staticCanvasRef.current !== null) {
          paintStaticMinimapLayer(
            staticCanvasRef.current,
            current,
            canvasWidth,
            height,
          );
        }
        staticSnapshotRef.current = {
          campSignature:
            current.exploration?.camps
              .map((camp) => `${camp.id}:${camp.cleared}`)
              .join("|") ?? "",
          height,
          nodeIds: current.nodes.map((item) => item.id),
          terrainIds: current.terrain.map((item) => item.id),
          veinIds: current.veins.map((item) => item.id),
          ventIds: current.vents.map((item) => item.id),
          width: canvasWidth,
        };
      }

      paintDynamicMinimapLayer(
        canvas,
        staticCanvasRef.current,
        current,
        canvasWidth,
        height,
      );
      lastDrawTimeRef.current = performance.now();
    };

    const elapsed = performance.now() - lastDrawTimeRef.current;
    if (
      lastDrawTimeRef.current === 0 ||
      elapsed >= MINIMAP_REDRAW_INTERVAL_MS
    ) {
      if (pendingDrawRef.current !== null) {
        window.cancelAnimationFrame(pendingDrawRef.current);
        pendingDrawRef.current = null;
      }
      drawModel(model);
      return;
    }

    if (pendingDrawRef.current === null) {
      pendingDrawRef.current = window.requestAnimationFrame(() =>
        drawModel(latestModelRef.current),
      );
    }
  }, [model]);

  useEffect(
    () => () => {
      if (pendingDrawRef.current !== null) {
        window.cancelAnimationFrame(pendingDrawRef.current);
        pendingDrawRef.current = null;
      }
    },
    [],
  );

  /** Recenters the camera or orders the selection at the pointer. */
  const press = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (attackMoving) {
      if (event.button === 2) {
        event.preventDefault();
        event.stopPropagation();
        onCancelAttackMove?.();
        return;
      }
      if (event.button === 0 && onOrder !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        const point = minimapPointerToMap(
          event.clientX,
          event.clientY,
          event.currentTarget.getBoundingClientRect(),
          model.map,
        );
        onOrder(point, event.shiftKey);
        return;
      }
    }
    const action = minimapPressAction(
      event.button,
      event.shiftKey,
      onOrder !== undefined,
    );
    if (action === null) return;
    event.preventDefault();
    event.stopPropagation();
    const point = minimapPointerToMap(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      model.map,
    );
    if (action === "navigate") {
      draggingRef.current = true;
      dragPointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      onNavigate(point);
      return;
    }
    onOrder?.(point, action === "queue");
  };

  /** Continues panning the camera while dragging with the left button held. */
  const move = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (!draggingRef.current) return;
    const point = minimapPointerToMap(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      model.map,
    );
    onNavigate(point);
  };

  /** Ends minimap camera dragging and releases pointer capture. */
  const endDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const pointerId = dragPointerIdRef.current ?? event.pointerId;
    dragPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(pointerId)) {
      event.currentTarget.releasePointerCapture(pointerId);
    }
  };

  return (
    <button
      aria-label="Battlefield minimap. Click to move camera, right-click to send the selection, Shift-click to add a waypoint."
      className={styles.minimap}
      data-testid="descent-minimap"
      onClick={(event) => {
        event.stopPropagation();
        if (event.detail !== 0) return;
        onNavigate({ x: model.map.width / 2, y: model.map.height / 2 });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerCancel={endDrag}
      onPointerDown={press}
      onPointerEnter={onPointerEnter}
      onPointerMove={move}
      onPointerUp={endDrag}
      style={{
        aspectRatio: `${model.map.width} / ${model.map.height}`,
        ["--minimap-ratio" as string]: model.map.width / model.map.height,
      }}
      type="button"
    >
      <canvas
        height={canvasHeight}
        ref={entityCanvasRef}
        style={{
          height: "100%",
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          width: "100%",
          zIndex: 1,
        }}
        width={canvasWidth}
      />
      {fogLayer}
      <span className={styles.minimapTitle}>Map</span>
      <span
        className={styles.minimapCamera}
        style={{
          height: `${mapPercent(view.height, model.map.height)}%`,
          left: `${mapPercent(view.centerX, model.map.width)}%`,
          top: `${mapPercent(view.centerY, model.map.height)}%`,
          transform: `translate(-50%, -50%) rotate(${view.rotation}rad)`,
          width: `${mapPercent(view.width, model.map.width)}%`,
          zIndex: 3,
        }}
      />
      <svg
        aria-hidden="true"
        data-testid="descent-minimap-pings"
        preserveAspectRatio="none"
        style={{
          height: "100%",
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          width: "100%",
          zIndex: 3,
        }}
        viewBox={`0 0 ${model.map.width} ${model.map.height}`}
      >
        {pings.map((ping) => {
          const presentation = minimapPingPresentation(
            ping,
            now,
            reducedMotion,
          );
          if (presentation === null) return null;
          const key = ping.id ?? `${ping.startedAt}:${ping.x}:${ping.y}`;
          return (
            <circle
              cx={ping.x}
              cy={ping.y}
              data-severity={ping.severity}
              data-testid="descent-minimap-ping"
              fill="none"
              key={key}
              opacity={presentation.opacity}
              r={presentation.radius}
              stroke={ping.severity === "critical" ? "#ff322d" : "#ff5548"}
              strokeWidth={ping.severity === "critical" ? 2.25 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
    </button>
  );
}

/** Memoized strategic minimap so unrelated shell state updates do not re-render it. */
export const DescentMinimap = memo(DescentMinimapInner);

/**
 * Tracks the browser's reduced-motion preference without reading it during SSR.
 * @returns Whether animated minimap rings should remain static
 */
function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (media === undefined) return;
    /** Reads the latest media-query value into React state. */
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reducedMotion;
}

/**
 * Advances a wall clock only while pings are alive, throttled to ~16fps in
 * animated mode so ping rings do not trigger 60Hz React re-renders.
 * Reduced-motion mode uses expiry timers rather than animation frames.
 * @param pings - Current attack markers
 * @param reducedMotion - Whether expansion and fading are disabled
 * @returns Current `Date.now()` timestamp, or zero before mounting
 */
function useMinimapPingClock(
  pings: readonly MinimapPing[],
  reducedMotion: boolean,
): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (pings.length === 0) return;
    let animationFrame: number | undefined;
    let expiryTimer: number | undefined;
    let lastCommit = 0;
    /** Publishes time at a throttled cadence and schedules the next update. */
    const update = () => {
      const current = Date.now();
      const active = pruneMinimapPings(pings, current);
      if (active.length === 0) {
        setNow(current);
        return;
      }
      if (
        reducedMotion ||
        lastCommit === 0 ||
        current - lastCommit >= MINIMAP_PING_TICK_MS
      ) {
        lastCommit = current;
        setNow(current);
      }
      if (!reducedMotion) {
        animationFrame = window.requestAnimationFrame(update);
        return;
      }
      const nextExpiry = Math.min(
        ...active.map((ping) => ping.startedAt + MINIMAP_PING_DURATION_MS),
      );
      expiryTimer = window.setTimeout(
        update,
        Math.max(0, nextExpiry - current) + 16,
      );
    };
    update();
    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
    };
  }, [pings, reducedMotion]);
  return now;
}
