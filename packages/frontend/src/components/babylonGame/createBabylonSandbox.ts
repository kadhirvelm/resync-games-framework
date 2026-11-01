import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder.pure";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.pure";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder.pure";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder.pure";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder.pure";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import { attachBabylonRuntimeLifecycle } from "./babylonRuntimeLifecycle";

/**
 * Applies one material to a sandbox primitive.
 * @param scene - Scene that owns the material
 * @param name - Stable debug name
 * @param diffuse - Base surface color
 * @param emissive - Optional glow color
 * @returns The configured standard material
 */
function createMaterial(
  scene: Scene,
  name: string,
  diffuse: Color3,
  emissive = Color3.Black(),
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = diffuse;
  material.emissiveColor = emissive;
  material.roughness = 0.82;
  return material;
}

/**
 * Builds the static low-poly shrine used as the first 3D sample asset.
 * @param scene - Babylon scene that owns the meshes and materials
 */
function createShrine(scene: Scene): void {
  const stone = createMaterial(
    scene,
    "shrine-stone",
    Color3.FromHexString("#41655b"),
  );
  const darkStone = createMaterial(
    scene,
    "shrine-dark-stone",
    Color3.FromHexString("#1c302f"),
  );
  const aether = createMaterial(
    scene,
    "shrine-aether",
    Color3.FromHexString("#7de6c4"),
    Color3.FromHexString("#319e8c").scale(0.78),
  );

  const base = CreateCylinder(
    "shrine-base",
    { diameter: 4.4, height: 0.62, tessellation: 8 },
    scene,
  );
  base.material = darkStone;
  base.position.y = 0.31;

  const platform = CreateCylinder(
    "shrine-platform",
    { diameter: 3.4, height: 0.48, tessellation: 8 },
    scene,
  );
  platform.material = stone;
  platform.position.y = 0.76;

  const core = CreatePolyhedron("aether-core", { size: 1.25, type: 1 }, scene);
  core.material = aether;
  core.position.y = 2.1;
  core.rotation.z = Math.PI / 4;

  const ring = CreateTorus(
    "aether-ring",
    { diameter: 2.7, tessellation: 32, thickness: 0.08 },
    scene,
  );
  ring.material = aether;
  ring.position.y = 2.1;
  ring.rotation.x = Math.PI / 2;

  for (let index = 0; index < 4; index += 1) {
    const angle = (Math.PI / 2) * index + Math.PI / 4;
    const pillar = CreateBox(
      `shrine-pillar-${index}`,
      { height: 2.25, size: 0.46 },
      scene,
    );
    pillar.material = stone;
    pillar.position.set(Math.cos(angle) * 1.75, 1.66, Math.sin(angle) * 1.75);
    pillar.rotation.y = -angle;
  }
}

/**
 * Creates a disposable Babylon engine and one orbitable prototype scene.
 * @param canvas - Canvas that receives WebGL output and pointer input
 * @param resizeTarget - Window-like target used for resize cleanup
 * @returns An idempotent function that destroys all runtime resources
 */
export function createBabylonSandbox(
  canvas: HTMLCanvasElement,
  resizeTarget: Window = window,
): () => void {
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: true },
    true,
  );
  let scene: Scene | undefined;

  try {
    scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString("#0b1618ff");

    const camera = new ArcRotateCamera(
      "sandbox-camera",
      -Math.PI / 2.8,
      Math.PI / 3.2,
      10.5,
      new Vector3(0, 1.15, 0),
      scene,
    );
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 15;
    camera.lowerBetaLimit = 0.45;
    camera.upperBetaLimit = Math.PI / 2.08;
    camera.wheelPrecision = 55;
    camera.panningSensibility = 0;
    camera.attachControl(canvas, true);

    const skyLight = new HemisphericLight(
      "vault-ambient-light",
      new Vector3(0.2, 1, 0.1),
      scene,
    );
    skyLight.diffuse = Color3.FromHexString("#b9ebdd");
    skyLight.groundColor = Color3.FromHexString("#102426");
    skyLight.intensity = 0.86;

    const keyLight = new DirectionalLight(
      "vault-key-light",
      new Vector3(-0.5, -1, 0.65),
      scene,
    );
    keyLight.diffuse = Color3.FromHexString("#ddc4ff");
    keyLight.intensity = 1.15;
    keyLight.position = new Vector3(5, 8, -5);

    const ground = CreateGround(
      "vault-ground",
      { height: 24, width: 24 },
      scene,
    );
    ground.material = createMaterial(
      scene,
      "vault-ground-material",
      Color3.FromHexString("#132629"),
    );

    createShrine(scene);
  } catch (error) {
    scene?.dispose();
    engine.dispose();
    throw error;
  }

  return attachBabylonRuntimeLifecycle(engine, scene, resizeTarget);
}
