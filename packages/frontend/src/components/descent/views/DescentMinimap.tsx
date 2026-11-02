/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import styles from "./descentView.module.scss";
import type { MapPoint } from "./selection";
import type { ShellModel } from "./shellModel";

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
 * Small strategic overview shared by the Babylon and accessible DOM maps.
 * @param props - Map entities, camera footprint, and navigation callback
 * @returns A clickable overview that recenters the active renderer
 */
export function DescentMinimap({
  model,
  onNavigate,
  view,
}: DescentMinimapProps) {
  /** Recenters the battlefield on the pointer's map position. */
  const navigate = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onNavigate(
      minimapPointerToMap(
        event.clientX,
        event.clientY,
        event.currentTarget.getBoundingClientRect(),
        model.map,
      ),
    );
  };

  return (
    <button
      aria-label="Battlefield minimap. Click to move camera."
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
      onPointerDown={navigate}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      style={{ aspectRatio: `${model.map.width} / ${model.map.height}` }}
      type="button"
    >
      <span className={styles.minimapTitle}>Map</span>
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
    </button>
  );
}
