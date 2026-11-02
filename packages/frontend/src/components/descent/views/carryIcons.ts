import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { ResourceId } from "../logic/types";
import { resourceIconSrc } from "./text";

/** Height above a unit's feet where its carried-resource icon floats. */
const CARRY_ICON_HEIGHT = 2.15;

/** World size of the carried-resource icon. */
const CARRY_ICON_SIZE = 0.62;

/** Floating resource icons over villagers that are carrying a load home. */
export interface CarryIconLayer {
  /** Releases every icon, material, and texture. */
  dispose: () => void;
  /** Forgets a unit's icon after its visual is removed. */
  remove: (unitId: string) => void;
  /**
   * Shows, swaps, or hides one unit's icon.
   * @param unitId - Unit id
   * @param parent - The unit's root node, which the icon follows
   * @param resource - What it carries, or null when empty-handed
   */
  sync: (
    unitId: string,
    parent: TransformNode,
    resource: ResourceId | null,
  ) => void;
}

/**
 * Creates the carried-resource icon layer for a Babylon scene. Icons are
 * camera-facing planes textured with the HUD resource icons, unlit so they
 * read the same in any light, and never pickable.
 * @param scene - Scene that owns the icons
 * @returns The icon layer
 */
export function createCarryIconLayer(scene: Scene): CarryIconLayer {
  const materials = new Map<ResourceId, StandardMaterial>();
  const icons = new Map<string, { mesh: Mesh; resource: ResourceId }>();

  /**
   * One shared material per resource icon.
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
   * Removes one icon mesh.
   * @param unitId - Unit id
   */
  const remove = (unitId: string): void => {
    icons.get(unitId)?.mesh.dispose();
    icons.delete(unitId);
  };

  return {
    dispose: () => {
      for (const unitId of [...icons.keys()]) remove(unitId);
      for (const material of materials.values()) {
        material.diffuseTexture?.dispose();
        material.dispose();
      }
      materials.clear();
    },
    remove,
    sync: (unitId, parent, resource) => {
      const current = icons.get(unitId);
      if (resource === null) {
        if (current !== undefined) remove(unitId);
        return;
      }
      if (current !== undefined && !current.mesh.isDisposed()) {
        if (current.resource === resource) return;
        current.mesh.material = materialFor(resource);
        current.resource = resource;
        return;
      }
      const mesh = CreatePlane(
        `carry-icon-${unitId}`,
        { size: CARRY_ICON_SIZE },
        scene,
      );
      mesh.parent = parent;
      mesh.position.y = CARRY_ICON_HEIGHT;
      mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
      mesh.isPickable = false;
      mesh.material = materialFor(resource);
      icons.set(unitId, { mesh, resource });
    },
  };
}
