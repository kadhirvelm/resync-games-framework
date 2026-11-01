"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./babylonGame.module.scss";
import { createBabylonSandbox } from "./createBabylonSandbox";

/**
 * Client-only canvas mount for one disposable Babylon sandbox scene.
 * @returns A canvas whose engine is destroyed when the component unmounts
 */
export const BabylonGameCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startupError, setStartupError] = useState<Error>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    try {
      return createBabylonSandbox(canvas);
    } catch (error) {
      setStartupError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }, []);

  if (startupError) {
    throw startupError;
  }

  return (
    <canvas
      aria-label="A low-poly aether shrine. Drag to orbit and use the mouse wheel to zoom."
      className={styles.canvas}
      ref={canvasRef}
      role="img"
    />
  );
};
