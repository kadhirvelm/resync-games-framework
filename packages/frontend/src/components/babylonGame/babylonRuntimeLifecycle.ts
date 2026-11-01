/** Minimal engine surface needed by the renderer lifecycle. */
export interface BabylonEngineLifecycle {
  dispose: () => void;
  resize: () => void;
  runRenderLoop: (render: () => void) => void;
  stopRenderLoop: (render: () => void) => void;
}

/** Minimal scene surface needed by the renderer lifecycle. */
export interface BabylonSceneLifecycle {
  dispose: () => void;
  render: () => void;
}

/** Browser event surface used to observe viewport changes. */
export interface ResizeEventTarget {
  addEventListener: (type: "resize", listener: () => void) => void;
  removeEventListener: (type: "resize", listener: () => void) => void;
}

/**
 * Starts one Babylon render loop and owns all matching cleanup.
 * @param engine - Babylon engine, or a compatible test double
 * @param scene - Scene rendered on each engine frame
 * @param resizeTarget - Window-like resize event target
 * @returns An idempotent disposer for the loop, listener, scene, and engine
 */
export function attachBabylonRuntimeLifecycle(
  engine: BabylonEngineLifecycle,
  scene: BabylonSceneLifecycle,
  resizeTarget: ResizeEventTarget,
): () => void {
  let disposed = false;
  const render = () => scene.render();
  const resize = () => engine.resize();

  resizeTarget.addEventListener("resize", resize);
  try {
    engine.runRenderLoop(render);
  } catch (error) {
    resizeTarget.removeEventListener("resize", resize);
    scene.dispose();
    engine.dispose();
    throw error;
  }

  return () => {
    if (disposed) {
      return;
    }
    disposed = true;
    resizeTarget.removeEventListener("resize", resize);
    engine.stopRenderLoop(render);
    scene.dispose();
    engine.dispose();
  };
}
