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

/**
 * Paints fog one pixel per tile and lets CSS stretch it smoothly over a
 * flat map, such as the minimap or the accessible DOM battlefield.
 * @param props - Fog to draw and the layer's placement
 * @returns A decorative canvas
 */
export function FogCanvas({ className, fog, style }: FogCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    paintFogShade(canvas, fogShadeGrid(fog));
  }, [fog]);

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
