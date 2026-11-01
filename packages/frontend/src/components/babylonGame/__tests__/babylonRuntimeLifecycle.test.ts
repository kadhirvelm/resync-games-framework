import { describe, expect, test } from "bun:test";
import { attachBabylonRuntimeLifecycle } from "../babylonRuntimeLifecycle";

describe("Babylon runtime lifecycle", () => {
  test("renders, resizes, and releases every owned resource once", () => {
    let engineDisposals = 0;
    let sceneDisposals = 0;
    let renders = 0;
    let resizes = 0;
    let renderLoop: (() => void) | undefined;
    let resizeListener: (() => void) | undefined;
    let stoppedLoop: (() => void) | undefined;
    let removedResizeListener: (() => void) | undefined;

    const engine = {
      dispose: () => {
        engineDisposals += 1;
      },
      resize: () => {
        resizes += 1;
      },
      runRenderLoop: (render: () => void) => {
        renderLoop = render;
      },
      stopRenderLoop: (render: () => void) => {
        stoppedLoop = render;
      },
    };
    const scene = {
      dispose: () => {
        sceneDisposals += 1;
      },
      render: () => {
        renders += 1;
      },
    };
    const resizeTarget = {
      addEventListener: (_type: "resize", listener: () => void) => {
        resizeListener = listener;
      },
      removeEventListener: (_type: "resize", listener: () => void) => {
        removedResizeListener = listener;
      },
    };

    const dispose = attachBabylonRuntimeLifecycle(engine, scene, resizeTarget);
    renderLoop?.();
    resizeListener?.();

    expect(renders).toBe(1);
    expect(resizes).toBe(1);

    dispose();
    dispose();

    expect(stoppedLoop).toBe(renderLoop);
    expect(removedResizeListener).toBe(resizeListener);
    expect(sceneDisposals).toBe(1);
    expect(engineDisposals).toBe(1);
  });

  test("cleans up when the engine cannot start its render loop", () => {
    let engineDisposals = 0;
    let sceneDisposals = 0;
    let removedListeners = 0;
    const engine = {
      dispose: () => {
        engineDisposals += 1;
      },
      resize: () => undefined,
      runRenderLoop: () => {
        throw new Error("render loop unavailable");
      },
      stopRenderLoop: () => undefined,
    };
    const scene = {
      dispose: () => {
        sceneDisposals += 1;
      },
      render: () => undefined,
    };
    const resizeTarget = {
      addEventListener: () => undefined,
      removeEventListener: () => {
        removedListeners += 1;
      },
    };

    expect(() =>
      attachBabylonRuntimeLifecycle(engine, scene, resizeTarget),
    ).toThrow();
    expect(removedListeners).toBe(1);
    expect(sceneDisposals).toBe(1);
    expect(engineDisposals).toBe(1);
  });
});
