/** @jsxRuntime automatic */
/** @jsxImportSource react */
"use client";

import { type CSSProperties, useEffect, useRef } from "react";
import type { FogOfWarState } from "../logic/fog";
import { fogShadeGrid, paintFogShade } from "./fogShade";

/** Props for a flat fog-of-war layer. */
export interface FogCanvasProps {
  className?: string;
  fog: FogOfWarState;
  style?: CSSProperties;
}

/** Shortest gap between minimap fog repaints, in milliseconds. */
const MIN_REPAINT_MS = 150;

/**
 * Paints fog one pixel per tile and lets CSS stretch it smoothly over a
 * flat map, such as the minimap or the accessible DOM battlefield.
 * Throttles repaints (leading + trailing) to ~150ms so 20Hz sim snapshots
 * do not continuously re-upload canvas pixels.
 * @param props - Fog to draw and the layer's placement
 * @returns A decorative canvas
 */
export function FogCanvas({ className, fog, style }: FogCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPaintAtRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFogRef = useRef<FogOfWarState>(fog);

  const { cells, height, width } = fog;
  useEffect(() => {
    latestFogRef.current = { cells, height, width };
    const paintNow = (): void => {
      const canvas = canvasRef.current;
      if (canvas === null) return;
      lastPaintAtRef.current = performance.now();
      paintFogShade(canvas, fogShadeGrid(latestFogRef.current));
    };
    const elapsed = performance.now() - lastPaintAtRef.current;
    if (elapsed >= MIN_REPAINT_MS) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      paintNow();
      return;
    }
    if (timerRef.current === null) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        paintNow();
      }, MIN_REPAINT_MS - elapsed);
    }
  }, [cells, height, width]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <canvas
      className={className}
      data-testid="descent-fog"
      height={fog.height}
      ref={canvasRef}
      style={style}
      width={fog.width}
    />
  );
}
