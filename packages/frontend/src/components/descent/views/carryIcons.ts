import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ResourceId } from "../logic/types";
import { resourceIconSrc } from "./text";

/** Height above a unit's feet where its optional resource icon floats. */
const CARRY_ICON_HEIGHT = 2.15;

/** World size of the optional carried-resource icon. */
const CARRY_ICON_SIZE = 0.62;

/** Height above a unit's feet where its carried load sits at hand level. */
export const CARRY_LOAD_HEIGHT = 0.9;

/** Geometry used to make a carried resource readable at RTS distance. */
export type CarriedLoadKind = "basket" | "log" | "ore-sack" | "rock";

/** Pure geometry and color choices for one resource's carried load. */
export interface CarriedLoadSpec {
  /** Color of ore, produce, or a small contrasting rock chip. */
  accentColor: string;
  /** Silhouette constructed by the mesh builder. */
  kind: CarriedLoadKind;
  /** Main log, stone, sack, or basket color. */
  primaryColor: string;
}

const CARRIED_LOAD_SPECS: Record<ResourceId, CarriedLoadSpec> = {
  coin: { accentColor: "#f2c14e", kind: "ore-sack", primaryColor: "#71503a" },
  essence: {
    accentColor: "#8ce6cf",
    kind: "ore-sack",
    primaryColor: "#60475a",
  },
  food: { accentColor: "#b9d36a", kind: "basket", primaryColor: "#9a6536" },
  iron: { accentColor: "#a9b2ba", kind: "ore-sack", primaryColor: "#665044" },
  spirit_herbs: {
    accentColor: "#72b979",
    kind: "basket",
    primaryColor: "#8a5b35",
  },
  stone: { accentColor: "#b4b5ae", kind: "rock", primaryColor: "#747875" },
  water: { accentColor: "#75b9d5", kind: "basket", primaryColor: "#8d623b" },
  wood: { accentColor: "#d0a56b", kind: "log", primaryColor: "#795035" },
};

/**
 * Maps a stockpile resource to its hand-carried silhouette and palette. Coin
 * represents gold-bearing salvage, so it uses an ore sack with golden nuggets.
 * @param resource - Resource being carried
 * @returns Stable geometry and color choices for the mesh builder
 */
export function carriedLoadSpec(resource: ResourceId): CarriedLoadSpec {
  return CARRIED_LOAD_SPECS[resource];
}

/**
 * Creates one flat-shaded material owned by a carried-load root.
 * @param scene - Scene that owns the material
 * @param name - Unique material name
 * @param color - Diffuse hex color
 * @returns The load material
 */
function createLoadMaterial(
  scene: Scene,
  name: string,
  color: string,
): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = Color3.FromHexString(color);
  material.emissiveColor = material.diffuseColor.scale(0.08);
  material.specularColor = Color3.Black();
  return material;
}

/**
 * Parents and configures one primitive in a carried-load mesh.
 * @param mesh - Primitive to configure
 * @param parent - Load root that follows the villager
 * @param material - Resource material for the primitive
 */
function configureLoadPrimitive(
  mesh: Mesh,
  parent: Mesh,
  material: StandardMaterial,
): void {
  mesh.parent = parent;
  mesh.material = material;
  mesh.isPickable = false;
  mesh.receiveShadows = true;
}

/**
 * Adds a horizontal timber log with visible cut ends.
 * @param root - Load root
 * @param primary - Bark material
 * @param accent - Cut-wood material
 */
function addLog(
  root: Mesh,
  primary: StandardMaterial,
  accent: StandardMaterial,
): void {
  const scene = root.getScene();
  const log = CreateCylinder(
    `${root.name}-bark`,
    { diameter: 0.28, height: 0.78, tessellation: 7 },
    scene,
  );
  log.rotation.z = Math.PI / 2;
  configureLoadPrimitive(log, root, primary);
  for (const side of [-1, 1]) {
    const end = CreateCylinder(
      `${root.name}-cut-${side}`,
      { diameter: 0.225, height: 0.015, tessellation: 7 },
      scene,
    );
    end.position.x = side * 0.397;
    end.rotation.z = Math.PI / 2;
    configureLoadPrimitive(end, root, accent);
  }
}

/**
 * Adds an irregular low-poly rock chunk and a contrasting smaller fragment.
 * @param root - Load root
 * @param primary - Stone material
 * @param accent - Fragment material
 */
function addRock(
  root: Mesh,
  primary: StandardMaterial,
  accent: StandardMaterial,
): void {
  const scene = root.getScene();
  const rock = CreateSphere(
    `${root.name}-chunk`,
    { diameter: 0.52, segments: 4 },
    scene,
  );
  rock.scaling.set(1, 0.82, 0.9);
  rock.rotation.set(0.2, 0.55, -0.12);
  configureLoadPrimitive(rock, root, primary);
  const chip = CreateSphere(
    `${root.name}-chip`,
    { diameter: 0.24, segments: 4 },
    scene,
  );
  chip.position.set(0.19, 0.12, 0.05);
  configureLoadPrimitive(chip, root, accent);
}

/**
 * Adds a tied ore sack with nuggets visible above its neck.
 * @param root - Load root
 * @param primary - Sack material
 * @param accent - Ore material
 */
function addOreSack(
  root: Mesh,
  primary: StandardMaterial,
  accent: StandardMaterial,
): void {
  const scene = root.getScene();
  const sack = CreateSphere(
    `${root.name}-sack`,
    { diameter: 0.52, segments: 6 },
    scene,
  );
  sack.scaling.set(0.86, 1, 0.76);
  configureLoadPrimitive(sack, root, primary);
  const neck = CreateCylinder(
    `${root.name}-neck`,
    { diameterBottom: 0.18, diameterTop: 0.13, height: 0.14, tessellation: 7 },
    scene,
  );
  neck.position.y = 0.25;
  configureLoadPrimitive(neck, root, primary);
  const tie = CreateTorus(
    `${root.name}-tie`,
    { diameter: 0.18, tessellation: 12, thickness: 0.025 },
    scene,
  );
  tie.position.y = 0.21;
  configureLoadPrimitive(tie, root, accent);
  for (const [index, x] of [-0.09, 0, 0.09].entries()) {
    const nugget = CreateSphere(
      `${root.name}-ore-${index}`,
      { diameter: 0.13, segments: 4 },
      scene,
    );
    nugget.position.set(x, 0.34 + (index % 2) * 0.035, 0);
    configureLoadPrimitive(nugget, root, accent);
  }
}

/**
 * Adds a woven basket with three visible pieces of produce.
 * @param root - Load root
 * @param primary - Basket material
 * @param accent - Produce material
 */
function addBasket(
  root: Mesh,
  primary: StandardMaterial,
  accent: StandardMaterial,
): void {
  const scene = root.getScene();
  const basket = CreateCylinder(
    `${root.name}-basket`,
    {
      diameterBottom: 0.38,
      diameterTop: 0.55,
      height: 0.32,
      tessellation: 8,
    },
    scene,
  );
  configureLoadPrimitive(basket, root, primary);
  const rim = CreateTorus(
    `${root.name}-rim`,
    { diameter: 0.55, tessellation: 16, thickness: 0.045 },
    scene,
  );
  rim.position.y = 0.17;
  configureLoadPrimitive(rim, root, primary);
  for (const [index, x] of [-0.14, 0, 0.14].entries()) {
    const produce = CreateSphere(
      `${root.name}-produce-${index}`,
      { diameter: 0.19, segments: 5 },
      scene,
    );
    produce.position.set(x, 0.22 + (index % 2) * 0.055, 0);
    configureLoadPrimitive(produce, root, accent);
  }
}

/**
 * Builds a small resource load whose root can be parented directly to a unit.
 * The root is positioned at hand height and owns its child meshes/materials.
 * @param scene - Scene that owns the load
 * @param resource - Resource to represent
 * @param name - Unique Babylon mesh name
 * @returns A non-pickable load root at hand height
 */
export function buildCarriedLoad(
  scene: Scene,
  resource: ResourceId,
  name = `carry-load-${resource}`,
): Mesh {
  const spec = carriedLoadSpec(resource);
  const root = new Mesh(name, scene);
  root.position.set(0.52, CARRY_LOAD_HEIGHT, 0.16);
  root.rotation.set(0.08, -0.2, -0.12);
  root.isPickable = false;
  const primary = createLoadMaterial(
    scene,
    `${name}-primary`,
    spec.primaryColor,
  );
  const accent = createLoadMaterial(scene, `${name}-accent`, spec.accentColor);
  if (spec.kind === "log") addLog(root, primary, accent);
  if (spec.kind === "rock") addRock(root, primary, accent);
  if (spec.kind === "ore-sack") addOreSack(root, primary, accent);
  if (spec.kind === "basket") addBasket(root, primary, accent);
  root.onDisposeObservable.add(() => {
    primary.dispose();
    accent.dispose();
  });
  return root;
}

/** Configuration for the carried-load layer. */
export interface CarryIconLayerOptions {
  /** Also show the old overhead icon; carried meshes are always shown. */
  showIcons?: boolean;
}

/** Hand-carried loads and optional floating icons for villagers. */
export interface CarryIconLayer {
  /** Releases every load, optional icon, material, and texture. */
  dispose: () => void;
  /** Forgets a unit's load after its visual is removed. */
  remove: (unitId: string) => void;
  /**
   * Shows, swaps, or hides one unit's carried load and optional icon.
   * @param unitId - Unit id
   * @param parent - The unit's root node, which the load follows
   * @param resource - What it carries, or null when empty-handed
   */
  sync: (
    unitId: string,
    parent: TransformNode,
    resource: ResourceId | null,
  ) => void;
}

interface CarryVisual {
  icon: Mesh | null;
  load: Mesh;
  resource: ResourceId;
}

/**
 * Creates resource-specific hand loads for a Babylon scene. The legacy
 * camera-facing overhead icon is opt-in and remains unlit and non-pickable.
 * @param scene - Scene that owns the loads
 * @param options - Optional overhead-icon configuration
 * @returns The carried-load synchronization layer
 */
export function createCarryIconLayer(
  scene: Scene,
  options: CarryIconLayerOptions = {},
): CarryIconLayer {
  const materials = new Map<ResourceId, StandardMaterial>();
  const visuals = new Map<string, CarryVisual>();
  const showIcons = options.showIcons ?? false;

  /**
   * One shared material per optional resource icon.
   * @param resource - Resource id
   * @returns The icon material
   */
  const materialFor = (resource: ResourceId): StandardMaterial => {
    const existing = materials.get(resource);
    if (existing !== undefined) return existing;
    const material = new StandardMaterial(`carry-icon-${resource}`, scene);
    const texture = new Texture(resourceIconSrc(resource), scene);
    texture.hasAlpha = true;
    material.diffuseTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.emissiveColor = Color3.White();
    material.disableLighting = true;
    material.backFaceCulling = false;
    materials.set(resource, material);
    return material;
  };

  /**
   * Removes one unit's load and optional icon.
   * @param unitId - Unit id
   */
  const remove = (unitId: string): void => {
    const current = visuals.get(unitId);
    current?.load.dispose();
    current?.icon?.dispose();
    visuals.delete(unitId);
  };

  return {
    dispose: () => {
      for (const unitId of [...visuals.keys()]) remove(unitId);
      for (const material of materials.values()) {
        material.diffuseTexture?.dispose();
        material.dispose();
      }
      materials.clear();
    },
    remove,
    sync: (unitId, parent, resource) => {
      const current = visuals.get(unitId);
      if (resource === null) {
        if (current !== undefined) remove(unitId);
        return;
      }
      if (
        current !== undefined &&
        current.resource === resource &&
        !current.load.isDisposed() &&
        current.load.parent === parent
      ) {
        return;
      }
      if (current !== undefined) remove(unitId);
      const load = buildCarriedLoad(scene, resource, `carry-load-${unitId}`);
      load.parent = parent;
      let icon: Mesh | null = null;
      if (showIcons) {
        icon = CreatePlane(
          `carry-icon-${unitId}`,
          { size: CARRY_ICON_SIZE },
          scene,
        );
        icon.parent = parent;
        icon.position.y = CARRY_ICON_HEIGHT;
        icon.billboardMode = Mesh.BILLBOARDMODE_ALL;
        icon.isPickable = false;
        icon.material = materialFor(resource);
      }
      visuals.set(unitId, { icon, load, resource });
    },
  };
}
