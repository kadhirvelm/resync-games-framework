import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type {
  ThreeDSceneEvent,
  ThreeDSceneInput,
} from "@towers-of-coreborn/api";
import { attachBabylonRuntimeLifecycle } from "./babylonRuntimeLifecycle";
import type { PrototypeRun } from "./logic/prototypeRun";

/** Imperative renderer handle; all gameplay state belongs to pure rules. */
export interface ModelSceneHandle {
  dispose: () => void;
  update: (state: PrototypeRun) => void;
  animate: (name: string) => void;
}

/**
 * Mounts validated GLBs with loading deadlines, fallback meshes and owned cleanup.
 * @param canvas - Dedicated 3D canvas
 * @param input - Renderer-neutral placements and camera settings
 * @param emit - Renderer events consumed by the React game boundary
 * @param status - Visible load failures/progress, including preview failures
 * @returns Handle to update presentation or dispose every owned resource
 */
export function createModelScene(
  canvas: HTMLCanvasElement,
  input: ThreeDSceneInput,
  emit: (event: ThreeDSceneEvent) => void,
  status: (message: string) => void,
): ModelSceneHandle {
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false },
    true,
  );
  try {
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.035, 0.08, 0.095, 1);
    let disposed = false;
    const camera = new ArcRotateCamera(
      "model-camera",
      Math.PI / 2,
      Math.PI / 3,
      input.player.cameraMode === "follow" ? 18 : 6,
      new Vector3(0, 1, 0),
      scene,
    );
    camera.lowerRadiusLimit = 2;
    camera.upperRadiusLimit = 35;
    camera.upperBetaLimit = Math.PI / 2.05;
    camera.inertia = input.reducedMotion ? 0 : 0.6;
    camera.attachControl(canvas, true);
    if (input.player.cameraMode === "follow")
      camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    const light = new HemisphericLight(
      "ambient",
      new Vector3(0.3, 1, 0.5),
      scene,
    );
    light.intensity = 1.3;
    const ground = CreateGround(
      "fallback-ground",
      { height: 20, width: 20 },
      scene,
    );
    const groundMaterial = new StandardMaterial("ground", scene);
    groundMaterial.diffuseColor = Color3.FromHexString("#203d41");
    ground.material = groundMaterial;
    ground.position.y = -0.25;
    if (input.player.cameraMode === "follow") {
      const portal = CreateTorus(
        "origin-portal",
        { diameter: 3, tessellation: 40, thickness: 0.12 },
        scene,
      );
      portal.position.y = 0.05;
      const portalMaterial = new StandardMaterial("portal-glow", scene);
      portalMaterial.diffuseColor = Color3.FromHexString("#e7c683");
      portalMaterial.emissiveColor = Color3.FromHexString("#84733c");
      portal.material = portalMaterial;
    }
    const placements = new Map<string, TransformNode>();
    let player: TransformNode | undefined;
    let clips: AnimationGroup[] = [];
    let currentClip = "";
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    /** Plays a named imported clip without altering game state. */
    const animate = (name: string) => {
      if (currentClip === name || input.reducedMotion) return;
      const clip = clips.find((candidate) => candidate.name === name);
      if (!clip) return;
      for (const group of clips) group.stop();
      clip.start(name === "idle" || name === "walk");
      currentClip = name;
    };
    let totalTriangles = 0;
    let totalMeshes = 0;
    for (const entity of input.entities.slice(0, 16)) {
      const placement = new TransformNode(entity.id, scene);
      placements.set(entity.id, placement);
      placement.position.set(...entity.position);
      if (entity.kind === "character") player = placement;
      const fallback = CreateBox(
        `fallback-${entity.id}`,
        { size: entity.kind === "character" ? 0.65 : 1 },
        scene,
      );
      const fallbackMaterial = new StandardMaterial(
        `fallback-material-${entity.id}`,
        scene,
      );
      fallbackMaterial.diffuseColor = Color3.FromHexString(
        entity.kind === "character" ? "#e9c18c" : "#85e0c1",
      );
      fallback.material = fallbackMaterial;
      fallback.parent = placement;
      fallback.position.y = 0.5;
      if (entity.kind === "environment") fallback.setEnabled(false);
      if (!entity.model) continue;
      const model = entity.model;
      totalTriangles += model.validation.triangles;
      totalMeshes += model.validation.meshes;
      if (
        !model.validation.valid ||
        totalTriangles > 250_000 ||
        totalMeshes > 256
      ) {
        status(
          "Scene budget reached. Some assets use stand-ins; simplify models in the workshop.",
        );
        continue;
      }
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        timeouts.delete(timeout);
        if (!disposed)
          status(`${model.name}: loading timed out. Showing a stand-in.`);
      }, 15_000);
      timeouts.add(timeout);
      void LoadAssetContainerAsync(model.url, scene, {
        pluginExtension: ".glb",
      })
        .then((container) => {
          clearTimeout(timeout);
          timeouts.delete(timeout);
          if (disposed || timedOut) {
            container.dispose();
            return;
          }
          container.addAllToScene();
          const modelRoot = container.createRootMesh();
          modelRoot.parent = placement;
          const { min, max } = model.validation.bounds;
          const height = Math.max(0.01, (max[1] ?? 1) - (min[1] ?? 0));
          const span = Math.max(
            height,
            (max[0] ?? 1) - (min[0] ?? 0),
            (max[2] ?? 1) - (min[2] ?? 0),
            0.01,
          );
          const size = entity.kind === "environment" ? 18 / span : 1.8 / span;
          placement.scaling.setAll(
            entity.kind === "character" ? 2 / height : size,
          );
          if (entity.kind !== "environment")
            modelRoot.position.set(
              -((max[0] ?? 0) + (min[0] ?? 0)) / 2,
              -(min[1] ?? 0),
              -((max[2] ?? 0) + (min[2] ?? 0)) / 2,
            );
          fallback.dispose();
          if (entity.kind === "character") {
            clips = container.animationGroups;
            for (const clip of clips) clip.stop();
            animate("idle");
          }
          if (
            input.player.cameraMode === "orbit" &&
            input.entities.length === 1
          ) {
            const meshes = container.meshes.filter(
              (mesh) => mesh.getTotalVertices() > 0,
            );
            let minimum = new Vector3(Infinity, Infinity, Infinity);
            let maximum = new Vector3(-Infinity, -Infinity, -Infinity);
            for (const mesh of meshes) {
              mesh.computeWorldMatrix(true);
              const bounds = mesh.getBoundingInfo().boundingBox;
              minimum = Vector3.Minimize(minimum, bounds.minimumWorld);
              maximum = Vector3.Maximize(maximum, bounds.maximumWorld);
            }
            if (meshes.length > 0) {
              camera.setTarget(minimum.add(maximum).scale(0.5));
              camera.radius = Math.max(
                3,
                maximum.subtract(minimum).length() * 1.3,
              );
            }
          }
        })
        .catch(() => {
          clearTimeout(timeout);
          timeouts.delete(timeout);
          if (!disposed)
            status(
              `${model.name}: preview could not load. Showing a stand-in.`,
            );
        });
    }
    const keys = new Set<string>();
    /** Emits renderer input; movement rules are resolved by the caller. */
    const keyDown = (event: KeyboardEvent) => {
      if (
        ![
          "w",
          "a",
          "s",
          "d",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "e",
          " ",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      keys.add(event.key.toLowerCase());
      if (event.key.toLowerCase() === "e" && !event.repeat)
        emit({ entityId: "nearby", type: "interaction" });
    };
    const keyUp = (event: KeyboardEvent) => {
      keys.delete(event.key.toLowerCase());
    };
    const blur = () => keys.clear();
    canvas.addEventListener("keydown", keyDown);
    canvas.addEventListener("keyup", keyUp);
    canvas.addEventListener("blur", blur);
    let lastInput = 0;
    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      if (now - lastInput < 50) return;
      lastInput = now;
      const x =
        Number(keys.has("d") || keys.has("arrowright")) -
        Number(keys.has("a") || keys.has("arrowleft"));
      const z =
        Number(keys.has("s") || keys.has("arrowdown")) -
        Number(keys.has("w") || keys.has("arrowup"));
      if (x || z) emit({ type: "input", x, z });
      if (input.player.cameraMode === "follow")
        animate(x || z ? "walk" : "idle");
    });
    const detach = attachBabylonRuntimeLifecycle(
      engine,
      {
        dispose: () => scene.dispose(),
        render: () => {
          try {
            scene.render();
          } catch {
            engine.stopRenderLoop();
            status("Rendering stopped. Reload the scene or try another model.");
          }
        },
      },
      window,
    );
    const observer = new ResizeObserver(() => engine.resize());
    observer.observe(canvas);
    emit({ type: "ready" });
    return {
      animate,
      dispose: () => {
        disposed = true;
        observer.disconnect();
        for (const timeout of timeouts) clearTimeout(timeout);
        canvas.removeEventListener("keydown", keyDown);
        canvas.removeEventListener("keyup", keyUp);
        canvas.removeEventListener("blur", blur);
        detach();
      },
      update: (state) => {
        if (player) {
          const dx = state.x - player.position.x;
          const dz = state.z - player.position.z;
          if (Math.hypot(dx, dz) > 0.001)
            player.rotation.y = Math.atan2(dx, dz);
          player.position.x = state.x;
          player.position.z = state.z;
          if (input.player.cameraMode === "follow")
            camera.setTarget(new Vector3(state.x, 1, state.z));
        }
        for (const id of state.activated) placements.get(id)?.setEnabled(false);
        if (state.finished) emit({ type: "finished" });
      },
    };
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
