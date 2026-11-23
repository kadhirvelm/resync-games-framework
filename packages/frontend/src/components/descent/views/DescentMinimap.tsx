/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
} from "react";
import styles from "./descentView.module.scss";
import { FogCanvas } from "./FogCanvas";
import {
  MINIMAP_PING_DURATION_MS,
  type MinimapPing,
  minimapPingPresentation,
  pruneMinimapPings,
} from "./minimapPings";
import type { MapPoint } from "./selection";
import type { ShellModel } from "./shellModel";

export type { MinimapPing } from "./minimapPings";

const EMPTY_PINGS: readonly MinimapPing[] = [];

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
  model: ShellModel;
  onNavigate: (point: MapPoint) => void;
  /**
   * Orders the selection to a point: right-click moves, Shift+click (either
   * button) queues a waypoint.
   */
  onOrder?: (point: MapPoint, queue: boolean) => void;
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
export function DescentMinimap({
  model,
  onNavigate,
  onOrder,
  pings = EMPTY_PINGS,
  view,
}: DescentMinimapProps) {
  const reducedMotion = usePrefersReducedMotion();
  const now = useMinimapPingClock(pings, reducedMotion);
  /** Recenters the camera or orders the selection at the pointer. */
  const press = (event: ReactPointerEvent<HTMLButtonElement>): void => {
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
      onNavigate(point);
      return;
    }
    onOrder?.(point, action === "queue");
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
      onPointerDown={press}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={{ aspectRatio: `${model.map.width} / ${model.map.height}` }}
      type="button"
    >
      {model.fog === null ? null : (
        <FogCanvas className={styles.minimapFog} fog={model.fog} />
      )}
      <span className={styles.minimapTitle}>Map</span>
      {model.terrain.map((feature) => (
        <span
          className={`${styles.minimapMarker} ${styles.minimapTerrain}`}
          data-terrain-kind={feature.kind}
          key={feature.id}
          style={{
            height: `${mapPercent(feature.radius * 2, model.map.height)}%`,
            left: `${mapPercent(feature.x, model.map.width)}%`,
            top: `${mapPercent(feature.y, model.map.height)}%`,
            width: `${mapPercent(feature.radius * 2, model.map.width)}%`,
          }}
        />
      ))}
      {model.vents.map((vent) => (
        <span
          className={`${styles.minimapMarker} ${styles.minimapVent}`}
          key={vent.id}
          style={{
            height: `${mapPercent(vent.radius * 2, model.map.height)}%`,
            left: `${mapPercent(vent.x, model.map.width)}%`,
            top: `${mapPercent(vent.y, model.map.height)}%`,
            width: `${mapPercent(vent.radius * 2, model.map.width)}%`,
          }}
        />
      ))}
      {model.veins.map((vein) => (
        <span
          className={`${styles.minimapMarker} ${styles.minimapVein}`}
          key={vein.id}
          style={{
            left: `${mapPercent(vein.x, model.map.width)}%`,
            top: `${mapPercent(vein.y, model.map.height)}%`,
          }}
        />
      ))}
      {model.nodes.map((node) => (
        <span
          className={`${styles.minimapMarker} ${styles.minimapNode}`}
          key={node.id}
          style={{
            left: `${mapPercent(node.x, model.map.width)}%`,
            top: `${mapPercent(node.y, model.map.height)}%`,
          }}
        />
      ))}
      {model.buildings.map((building) => (
        <span
          className={`${styles.minimapMarker} ${styles.minimapBuilding}`}
          key={building.id}
          style={{
            ...(building.ownerColor === undefined
              ? {}
              : {
                  backgroundColor: building.ownerColor,
                  borderColor: "#0b0705",
                }),
            left: `${mapPercent(building.x, model.map.width)}%`,
            top: `${mapPercent(building.y, model.map.height)}%`,
          }}
        />
      ))}
      {model.units.map((unit) => {
        const factionClass =
          unit.factionId === "horde" ? styles.minimapHorde : styles.minimapHold;
        return (
          <span
            className={`${styles.minimapMarker} ${styles.minimapUnit} ${factionClass}`}
            key={unit.id}
            style={{
              ...(unit.factionId === "hold" && unit.ownerColor !== undefined
                ? { backgroundColor: unit.ownerColor }
                : {}),
              left: `${mapPercent(unit.x, model.map.width)}%`,
              top: `${mapPercent(unit.y, model.map.height)}%`,
            }}
          />
        );
      })}
      <span
        className={styles.minimapCamera}
        style={{
          height: `${mapPercent(view.height, model.map.height)}%`,
          left: `${mapPercent(view.centerX, model.map.width)}%`,
          top: `${mapPercent(view.centerY, model.map.height)}%`,
          transform: `translate(-50%, -50%) rotate(${view.rotation}rad)`,
          width: `${mapPercent(view.width, model.map.width)}%`,
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
 * Advances a wall clock only while pings are alive. Reduced-motion mode uses
 * expiry timers rather than animation frames.
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
    let animationFrame: number | undefined;
    let expiryTimer: number | undefined;
    /** Publishes time and schedules the next frame or reduced-motion expiry. */
    const update = () => {
      const current = Date.now();
      setNow(current);
      const active = pruneMinimapPings(pings, current);
      if (active.length === 0) return;
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
