/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { useEffect, useRef, useState } from "react";
import { isCultivatorClass } from "../logic/slice/sliceCultivatorPowers";
import type { Command } from "../logic/types";
import { buildingIconSrc } from "./buildingIcons";
import {
  DescentMinimap,
  dockMinimap,
  type MinimapPing,
} from "./DescentMinimap";
import styles from "./descentView.module.scss";
import { FogCanvas } from "./FogCanvas";
import { type InspectTarget, isInspected } from "./inspect";
import { terrainAcross } from "./presentation";
import {
  type Camera,
  clientToWorld,
  type MapPoint,
  ordersForAttackMove,
  ordersForRightClick,
  type Selection,
  type SelectionBox,
  similarVisibleUnitIds,
  unitsInBox,
} from "./selection";
import type { ShellModel } from "./shellModel";

/** A one-shot request to center the camera on a map point. */
export interface CameraFocusRequest {
  id: number;
  point: MapPoint;
}

/** Props for the map viewport. */
export interface MapViewportProps {
  /** Whether Attack-Move targeting cursor is armed (left-click issues order_attack_move). */
  attackMoving?: boolean;
  camera: Camera;
  /**
   * Asks the view to center on a map point. A new `id` re-centers even when
   * the point repeats.
   */
  focusRequest?: CameraFocusRequest | null;
  /** Local player id in multiplayer matches; omitted in solo play. */
  localPlayerId?: string;
  /** HUD element the minimap docks into; omitted, it floats over the map. */
  minimapHost?: HTMLElement | null;
  model: ShellModel;
  /** Expanding under-attack rings drawn on the minimap. */
  pings?: readonly MinimapPing[];
  onCameraChange: (camera: Camera) => void;
  /** Cancels active attack-move targeting (e.g. on right-click or after issuing). */
  onCancelAttackMove?: () => void;
  /** Cancels active building placement (e.g. on right-click). */
  onCancelPlacement?: () => void;
  /** Cancels active rally-point targeting (e.g. on right-click). */
  onCancelRally?: () => void;
  onCommand: (command: Command) => void;
  onCursor: (point: MapPoint | null) => void;
  onPlace: (point: MapPoint, queue?: boolean) => void;
  /** Inspects a resource node, Spirit Vein, or vent. */
  onInspect: (target: InspectTarget) => void;
  onSetRally: (point: MapPoint) => void;
  onSelectBuilding: (id: string) => void;
  onSelectUnits: (
    ids: readonly string[],
    mode: "add" | "replace" | "toggle",
  ) => void;
  placing: boolean;
  /** Type of the building being placed, so the ghost can tint on bad ground. */
  placingType?: string | null;
  /** Side, in map cells, of the building being placed; 1 when not placing. */
  placingFootprint: number;
  rallyBuildingId: string | null;
  /** Map feature currently being inspected, if any. */
  inspected: InspectTarget | null;
  selection: Selection;
  settingRally: boolean;
  status: string | null;
}

/**
 * The camera offset that centers a map point in the viewport, kept inside
 * the map edges.
 * @param point - Map point to center
 * @param model - Map size and display scale
 * @param viewport - Viewport size in pixels
 * @returns Camera offset in pixels
 */
export function centeredCamera(
  point: MapPoint,
  model: Pick<ShellModel, "map" | "scale">,
  viewport: { height: number; width: number },
): Camera {
  const maxX = Math.max(0, model.map.width * model.scale - viewport.width);
  const maxY = Math.max(0, model.map.height * model.scale - viewport.height);
  return {
    x: Math.max(0, Math.min(maxX, point.x * model.scale - viewport.width / 2)),
    y: Math.max(0, Math.min(maxY, point.y * model.scale - viewport.height / 2)),
  };
}

/**
 * Icon and short label for one building on the map.
 * @param props - Building identity and whether it is still going up
 * @returns The token contents
 */
function BuildingTokenMark({
  buildingType,
  constructing,
  name,
}: {
  buildingType: string;
  constructing: boolean;
  name: string;
}) {
  const iconSrc = buildingIconSrc(buildingType);
  return (
    <>
      {iconSrc === null ? null : (
        // biome-ignore lint/performance/noImgElement: bundled game HUD icon
        <img alt="" className={styles.buildingTokenIcon} src={iconSrc} />
      )}
      <span className={styles.buildingTokenLabel}>
        {constructing ? "Building" : name}
      </span>
    </>
  );
}

/**
 * DOM map of units, buildings, nodes, vents, and veins.
 * Pointers become selection and commands; the snapshot is not edited.
 * @param props - Map model and input callbacks
 * @returns The viewport
 */
export function MapViewport({
  attackMoving = false,
  camera,
  focusRequest = null,
  localPlayerId,
  minimapHost,
  model,
  onCameraChange,
  onCancelAttackMove,
  onCancelPlacement,
  onCancelRally,
  onCommand,
  onCursor,
  onPlace,
  onInspect,
  pings,
  onSetRally,
  onSelectBuilding,
  onSelectUnits,
  placing,
  rallyBuildingId,
  inspected,
  selection,
  settingRally,
  status,
}: MapViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{
    additive: boolean;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const [drag, setDrag] = useState<SelectionBox | null>(null);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });
  const targetingMode = placing || settingRally || attackMoving;
  const focusId = focusRequest?.id ?? null;
  const focusPoint = useRef<MapPoint | null>(null);
  focusPoint.current = focusRequest?.point ?? null;
  const centerOn = useRef<(point: MapPoint) => void>(() => {});
  centerOn.current = (point) =>
    onCameraChange(centeredCamera(point, model, viewportSize));
  useEffect(() => {
    if (focusId === null || focusPoint.current === null) return;
    centerOn.current(focusPoint.current);
  }, [focusId]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    /** Publishes the visible map size after layout or a browser resize. */
    const measure = (): void => {
      const rect = viewport.getBoundingClientRect();
      setViewportSize({ height: rect.height, width: rect.width });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  /**
   * @param event - Pointer event inside the viewport
   * @returns The map point under the pointer
   */
  const pointFrom = (event: { clientX: number; clientY: number }): MapPoint => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (rect === undefined) return { x: 0, y: 0 };
    return clientToWorld(
      event.clientX,
      event.clientY,
      rect,
      camera,
      model.scale,
    );
  };

  /**
   * Cancels whichever active targeting mode takes priority on right-click.
   * @returns True when an active mode was cancelled
   */
  const cancelActiveModeOnRightClick = (): boolean => {
    if (placing) {
      onCancelPlacement?.();
      return true;
    }
    if (attackMoving) {
      onCancelAttackMove?.();
      return true;
    }
    if (settingRally) {
      onCancelRally?.();
      return true;
    }
    return false;
  };

  return (
    <div
      aria-label="Hold map"
      className={styles.mapFrame}
      data-testid="descent-map"
      onContextMenu={(event) => {
        event.preventDefault();
        if (cancelActiveModeOnRightClick()) return;
        const ground = pointFrom(event);
        if (rallyBuildingId !== null) {
          onSetRally(ground);
          return;
        }
        const orders = ordersForRightClick({
          buildings: model.buildings,
          ground,
          localPlayerId,
          nodes: model.nodes,
          queue: event.shiftKey,
          selectedIds: selection.unitIds,
          targetBuildingId: null,
          targetUnitId: null,
          units: model.units,
        });
        for (const order of orders) onCommand(order);
      }}
      onPointerCancel={(event) => {
        const origin = dragOrigin.current;
        dragOrigin.current = null;
        setDrag(null);
        if (
          origin !== null &&
          event.currentTarget.hasPointerCapture?.(origin.pointerId)
        ) {
          event.currentTarget.releasePointerCapture(origin.pointerId);
        }
        onCursor(null);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const point = pointFrom(event);
        if (settingRally) {
          onSetRally(point);
          return;
        }
        if (placing) {
          onPlace(point, event.shiftKey);
          return;
        }
        if (attackMoving) {
          const orders = ordersForAttackMove(
            model,
            selection.unitIds,
            point,
            event.shiftKey,
            localPlayerId,
          );
          for (const order of orders) onCommand(order);
          if (!event.shiftKey) onCancelAttackMove?.();
          return;
        }
        dragOrigin.current = {
          additive: event.shiftKey,
          pointerId: event.pointerId,
          x: point.x,
          y: point.y,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerLeave={() => onCursor(null)}
      onPointerMove={(event) => {
        const point = pointFrom(event);
        onCursor(point);
        const origin = dragOrigin.current;
        if (origin === null) return;
        setDrag({ x0: origin.x, x1: point.x, y0: origin.y, y1: point.y });
      }}
      onPointerUp={(event) => {
        const origin = dragOrigin.current;
        if (origin === null) return;
        if (event.button !== 0 || event.pointerId !== origin.pointerId) return;
        dragOrigin.current = null;
        setDrag(null);
        if (event.currentTarget.hasPointerCapture?.(origin.pointerId)) {
          event.currentTarget.releasePointerCapture(origin.pointerId);
        }
        const point = pointFrom(event);
        const dragged =
          Math.hypot(point.x - origin.x, point.y - origin.y) > 0.75;
        if (!dragged) {
          if (!origin.additive) onSelectUnits([], "replace");
          return;
        }
        onSelectUnits(
          unitsInBox(
            model.units,
            {
              x0: origin.x,
              x1: point.x,
              y0: origin.y,
              y1: point.y,
            },
            localPlayerId,
          ),
          origin.additive ? "add" : "replace",
        );
      }}
      ref={viewportRef}
      role="application"
    >
      <div
        className={styles.world}
        data-testid="descent-world"
        style={{
          height: model.map.height * model.scale,
          transform: `translate(${-camera.x}px, ${-camera.y}px)`,
          width: model.map.width * model.scale,
        }}
      >
        {model.fog === null ? null : (
          <FogCanvas
            className={styles.fogLayer}
            fog={model.fog}
            style={{
              height: model.fog.height * model.scale,
              left: -0.5 * model.scale,
              top: -0.5 * model.scale,
              width: model.fog.width * model.scale,
            }}
          />
        )}
        {model.hills.map((hill) => (
          <span
            aria-hidden="true"
            className={styles.hill}
            key={hill.id}
            style={{
              height: hill.radius * 2 * model.scale,
              left: (hill.x - hill.radius) * model.scale,
              top: (hill.y - hill.radius) * model.scale,
              width: hill.radius * 2 * model.scale,
            }}
          />
        ))}
        {model.terrain.map((feature) => (
          <span
            className={styles.terrain}
            data-terrain-kind={feature.kind}
            key={feature.id}
            style={{
              height: terrainAcross(feature) * model.scale,
              left: (feature.x - feature.radius) * model.scale,
              top: (feature.y - terrainAcross(feature) / 2) * model.scale,
              transform: `rotate(${feature.angle ?? 0}rad)`,
              width: feature.radius * 2 * model.scale,
            }}
          >
            {feature.kind === "bridge" ? "" : (feature.label ?? "")}
          </span>
        ))}
        {model.veins.map((vein) => (
          <span
            className={styles.vein}
            key={vein.id}
            style={{
              left: vein.x * model.scale,
              top: vein.y * model.scale,
            }}
          >
            Vein
          </span>
        ))}
        {model.vents.map((vent) => (
          <span
            className={styles.vent}
            key={vent.id}
            style={{
              height: vent.radius * 2 * model.scale,
              left: (vent.x - vent.radius) * model.scale,
              top: (vent.y - vent.radius) * model.scale,
              width: vent.radius * 2 * model.scale,
            }}
          >
            {vent.label}
          </span>
        ))}
        {model.nodes.map((node) => (
          <button
            aria-label={`Select ${node.label}, a ${node.resource.replaceAll("_", " ")} resource`}
            aria-pressed={isInspected(inspected, "node", node.id)}
            className={
              isInspected(inspected, "node", node.id)
                ? `${styles.node} ${styles.nodeSelected}`
                : styles.node
            }
            data-node-id={node.id}
            data-node-resource={node.resource}
            key={node.id}
            onClick={(event) => {
              if (targetingMode) return;
              event.stopPropagation();
              onInspect({ id: node.id, kind: "node" });
            }}
            onPointerDown={(event) => {
              if (targetingMode) return;
              event.stopPropagation();
            }}
            style={{
              left: node.x * model.scale,
              top: node.y * model.scale,
            }}
            type="button"
          >
            {node.label}
          </button>
        ))}
        {model.exploration?.camps
          .filter((camp) => !camp.cleared)
          .map((camp) => (
            <button
              aria-label={`Inspect ${camp.name}, Threat ${camp.threat}. ${camp.rewardLabel}`}
              aria-pressed={isInspected(inspected, "camp", camp.id)}
              className={
                isInspected(inspected, "camp", camp.id)
                  ? `${styles.explorationCamp} ${styles.explorationCampSelected}`
                  : styles.explorationCamp
              }
              data-camp-id={camp.id}
              data-cleared={camp.cleared}
              key={camp.id}
              onClick={(event) => {
                if (targetingMode) return;
                event.stopPropagation();
                onInspect({ id: camp.id, kind: "camp" });
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (cancelActiveModeOnRightClick()) return;
                const orders = ordersForAttackMove(
                  model,
                  selection.unitIds,
                  { x: camp.x, y: camp.y },
                  event.shiftKey,
                  localPlayerId,
                );
                for (const order of orders) onCommand(order);
              }}
              onPointerDown={(event) => {
                if (targetingMode) return;
                event.stopPropagation();
              }}
              style={{
                left: camp.x * model.scale,
                top: camp.y * model.scale,
              }}
              type="button"
            >
              <span aria-hidden="true" className={styles.explorationCampMark}>
                {camp.cleared ? "✓" : `T${camp.threat}`}
              </span>
              <span className={styles.explorationCampName}>{camp.name}</span>
            </button>
          ))}
        {model.telegraphs.map((ring) => (
          <span
            className={styles.telegraph}
            key={ring.id}
            style={{
              height: ring.radius * 2 * model.scale,
              left: (ring.x - ring.radius) * model.scale,
              top: (ring.y - ring.radius) * model.scale,
              width: ring.radius * 2 * model.scale,
            }}
          >
            {ring.label}
          </span>
        ))}
        {model.buildings.map((building) => (
          <button
            aria-label={building.name}
            aria-pressed={selection.buildingId === building.id}
            className={
              selection.buildingId === building.id
                ? `${styles.buildingToken} ${styles.tokenSelected}`
                : styles.buildingToken
            }
            data-building-id={building.id}
            key={building.id}
            onClick={(event) => {
              if (targetingMode) return;
              event.stopPropagation();
              onSelectBuilding(building.id);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (cancelActiveModeOnRightClick()) return;
              if (rallyBuildingId !== null) {
                onSetRally({ x: building.x, y: building.y });
                return;
              }
              const orders = ordersForRightClick({
                buildings: model.buildings,
                ground: { x: building.x, y: building.y },
                localPlayerId,
                nodes: model.nodes,
                queue: event.shiftKey,
                selectedIds: selection.unitIds,
                targetBuildingId: building.id,
                targetUnitId: null,
                units: model.units,
              });
              for (const order of orders) onCommand(order);
            }}
            onPointerDown={(event) => {
              if (targetingMode) return;
              event.stopPropagation();
            }}
            style={{
              ...(building.ownerColor === undefined
                ? {}
                : {
                    borderColor: building.ownerColor,
                    boxShadow: `0 0 0 2px ${building.ownerColor}`,
                  }),
              left: building.x * model.scale,
              minHeight: building.footprint * model.scale,
              minWidth: building.footprint * model.scale,
              top: building.y * model.scale,
            }}
            type="button"
          >
            <BuildingTokenMark
              buildingType={building.buildingType}
              constructing={building.constructing}
              name={building.name}
            />
          </button>
        ))}
        {model.buildings.map((building) =>
          building.id === selection.buildingId &&
          building.rallyPoint !== null ? (
            <span
              aria-hidden="true"
              className={styles.rallyPoint}
              data-testid="rally-point"
              key={`rally-${building.id}`}
              style={{
                left: building.rallyPoint.x * model.scale,
                top: building.rallyPoint.y * model.scale,
              }}
            >
              ◆
            </span>
          ) : null,
        )}
        {model.units.map((unit) => {
          const selected = selection.unitIds.includes(unit.id);
          const factionClass =
            unit.factionId === "horde" ? styles.tokenHorde : styles.tokenHold;
          const cultivatorClass =
            unit.factionId === "hold" && isCultivatorClass(unit.classId)
              ? styles.tokenCultivator
              : "";
          const selectedClass = selected ? styles.tokenSelected : "";
          return (
            <button
              aria-label={
                unit.ownerName === undefined
                  ? unit.name
                  : `${unit.name} (${unit.ownerName})`
              }
              aria-pressed={selected}
              className={`${styles.token} ${factionClass} ${cultivatorClass} ${selectedClass}`}
              data-owner-color={unit.ownerColor}
              data-unit-id={unit.id}
              key={unit.id}
              onClick={(event) => {
                if (targetingMode) return;
                event.stopPropagation();
                onSelectUnits([unit.id], event.shiftKey ? "toggle" : "replace");
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (cancelActiveModeOnRightClick()) return;
                if (rallyBuildingId !== null) {
                  onSetRally({ x: unit.x, y: unit.y });
                  return;
                }
                const orders = ordersForRightClick({
                  buildings: model.buildings,
                  ground: { x: unit.x, y: unit.y },
                  localPlayerId,
                  nodes: model.nodes,
                  queue: event.shiftKey,
                  selectedIds: selection.unitIds,
                  targetBuildingId: null,
                  targetUnitId: unit.id,
                  units: model.units,
                });
                for (const order of orders) onCommand(order);
              }}
              onDoubleClick={(event) => {
                if (targetingMode) return;
                event.stopPropagation();
                const rect = viewportRef.current?.getBoundingClientRect();
                const visibleIds =
                  rect === undefined
                    ? []
                    : model.units
                        .filter((entry) => {
                          const left = entry.x * model.scale - camera.x;
                          const top = entry.y * model.scale - camera.y;
                          return (
                            left >= 0 &&
                            left <= rect.width &&
                            top >= 0 &&
                            top <= rect.height
                          );
                        })
                        .map((entry) => entry.id);
                onSelectUnits(
                  similarVisibleUnitIds(
                    model.units,
                    unit.id,
                    visibleIds,
                    localPlayerId,
                  ),
                  event.shiftKey ? "add" : "replace",
                );
              }}
              onPointerDown={(event) => {
                if (targetingMode) return;
                event.stopPropagation();
              }}
              style={{
                ...(unit.factionId === "hold" && unit.ownerColor !== undefined
                  ? {
                      borderColor: unit.ownerColor,
                      boxShadow: `0 0 0 3px ${unit.ownerColor}`,
                    }
                  : {}),
                left: unit.x * model.scale,
                top: unit.y * model.scale,
              }}
              type="button"
            >
              {unit.classId.slice(0, 1).toUpperCase()}
            </button>
          );
        })}
        {drag === null ? null : (
          <span
            className={styles.selectBox}
            style={{
              height: Math.abs(drag.y1 - drag.y0) * model.scale,
              left: Math.min(drag.x0, drag.x1) * model.scale,
              top: Math.min(drag.y0, drag.y1) * model.scale,
              width: Math.abs(drag.x1 - drag.x0) * model.scale,
            }}
          />
        )}
      </div>
      {dockMinimap(
        <DescentMinimap
          attackMoving={attackMoving}
          model={model}
          onCancelAttackMove={onCancelAttackMove}
          onNavigate={(point) => {
            onCameraChange(centeredCamera(point, model, viewportSize));
          }}
          onOrder={(point, queue) => {
            if (attackMoving) {
              const orders = ordersForAttackMove(
                model,
                selection.unitIds,
                point,
                queue,
                localPlayerId,
              );
              for (const order of orders) onCommand(order);
              if (!queue) onCancelAttackMove?.();
              return;
            }
            if (selection.unitIds.length === 0 && rallyBuildingId !== null) {
              onSetRally(point);
              return;
            }
            const orders = ordersForRightClick({
              buildings: model.buildings,
              ground: point,
              localPlayerId,
              nodes: model.nodes,
              queue,
              selectedIds: selection.unitIds,
              targetBuildingId: null,
              targetUnitId: null,
              units: model.units,
            });
            for (const order of orders) onCommand(order);
          }}
          onPointerEnter={() => onCursor(null)}
          pings={pings}
          view={{
            centerX: (camera.x + viewportSize.width / 2) / model.scale,
            centerY: (camera.y + viewportSize.height / 2) / model.scale,
            height: viewportSize.height / model.scale,
            rotation: 0,
            width: viewportSize.width / model.scale,
          }}
        />,
        minimapHost,
      )}
      {status === null ? null : <p className={styles.mapStatus}>{status}</p>}
      {model.paused ? <p className={styles.pauseOverlay}>Paused</p> : null}
    </div>
  );
}
