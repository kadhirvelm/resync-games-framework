"use client";
import type {
  ThreeDSceneEvent,
  ThreeDSceneInput,
} from "@resync-game-framework/api";
import { useEffect, useRef, useState } from "react";
import styles from "./babylonGame.module.scss";
import { createModelScene, type ModelSceneHandle } from "./createModelScene";
import type { PrototypeRun } from "./logic/prototypeRun";

/**
 * Isolated preview/game canvas; mounting, loading and GPU failures stay recoverable.
 * @returns A focusable canvas, loading status and optional animation selector
 */
export function ModelViewport({
  input,
  state,
  onEvent,
}: {
  input: ThreeDSceneInput;
  state?: PrototypeRun;
  onEvent?: (event: ThreeDSceneEvent) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const handle = useRef<ModelSceneHandle | null>(null);
  const callback = useRef(onEvent);
  const currentState = useRef(state);
  currentState.current = state;
  callback.current = onEvent;
  const [message, setMessage] = useState("Loading models…");
  useEffect(() => {
    if (!canvas.current) return;
    try {
      handle.current = createModelScene(
        canvas.current,
        input,
        (event) => {
          if (event.type === "ready")
            setMessage("Drag to orbit · scroll to zoom");
          callback.current?.(event);
        },
        setMessage,
      );
      if (currentState.current) handle.current.update(currentState.current);
    } catch (error) {
      setMessage(
        `3D unavailable: ${error instanceof Error ? error.message : "WebGL could not start"}`,
      );
    }
    return () => {
      handle.current?.dispose();
      handle.current = null;
    };
  }, [input]);
  useEffect(() => {
    if (state) handle.current?.update(state);
  }, [state]);
  return (
    <div className={styles.modelViewport}>
      <canvas
        aria-label="3D model viewer. Focus to use WASD or arrow keys and E to interact."
        className={styles.canvas}
        ref={canvas}
        tabIndex={0}
      />
      <p aria-live="polite" className={styles.modelStatus}>
        {message}
      </p>
      {input.entities.some((entity) => entity.kind === "character") &&
      !state ? (
        <label className={styles.clipControl}>
          Animation{" "}
          <select
            onChange={(event) => handle.current?.animate(event.target.value)}
          >
            {["idle", "walk", "attack", "hit", "death"].map((clip) => (
              <option key={clip}>{clip}</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
