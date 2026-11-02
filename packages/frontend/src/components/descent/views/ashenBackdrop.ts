import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

/** High cavern above the Hold. Matches the scene clear color. */
export const ASHEN_SKY_ZENITH = "#2a1418";

/** Ember band where the wastes meet the dark. */
export const ASHEN_HORIZON = "#c46a38";

/** Fog that hides the far plain instead of cutting it off in black. */
export const ASHEN_HAZE = "#5a3226";

/** One distant rock placed outside the playable map. */
export interface AshenBackdropPiece {
  height: number;
  kind: "mound" | "spire";
  radius: number;
  x: number;
  z: number;
}

/**
 * Places a ring of rocks outside the playable map. Positions are fixed so
 * the horizon does not change between loads.
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @returns Rocks in world space, all outside the map
 */
export function ashenBackdropPieces(
  mapWidth: number,
  mapHeight: number,
): AshenBackdropPiece[] {
  const centerX = mapWidth / 2;
  const centerZ = mapHeight / 2;
  const ring = Math.max(mapWidth, mapHeight) * 0.92;
  const count = 16;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 + 0.35;
    const reach = ring * (1 + (index % 4) * 0.08);
    const spire = index % 2 === 0;
    return {
      height: spire ? 7 + (index % 5) * 2.2 : 2.4 + (index % 3) * 0.8,
      kind: spire ? "spire" : "mound",
      radius: spire ? 1.1 + (index % 3) * 0.35 : 3.2 + (index % 3) * 0.9,
      x: centerX + Math.cos(angle) * reach,
      z: centerZ + Math.sin(angle) * reach,
    };
  });
}

/**
 * Fills the void around the Hold with an ash plain, a cavern sky, and a
 * ring of distant rock. None of it is pickable.
 * @param scene - Descent battlefield
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @param glow - Scene glow, which should not bloom the sky
 */
export function addAshenBackdrop(
  scene: Scene,
  mapWidth: number,
  mapHeight: number,
  glow: GlowLayer,
): void {
  const span = Math.max(mapWidth, mapHeight) * 6;
  const wastes = CreateGround(
    "ashen-wastes",
    { height: span, subdivisions: 2, width: span },
    scene,
  );
  wastes.position.set(mapWidth / 2, -0.22, mapHeight / 2);
  wastes.material = flatMaterial(scene, "ashen-wastes-material", "#2a1c16");
  wastes.isPickable = false;
  wastes.receiveShadows = true;

  const rock = flatMaterial(scene, "ashen-spire-material", "#3a2822");
  for (const piece of ashenBackdropPieces(mapWidth, mapHeight)) {
    const mesh = CreateCylinder(
      `ashen-${piece.kind}-${piece.x.toFixed(1)}`,
      {
        diameterBottom: piece.radius * 2,
        diameterTop: piece.kind === "spire" ? piece.radius * 0.2 : piece.radius,
        height: piece.height,
        tessellation: piece.kind === "spire" ? 5 : 7,
      },
      scene,
    );
    mesh.position.set(piece.x, piece.height / 2 - 0.22, piece.z);
    mesh.material = rock;
    mesh.isPickable = false;
  }

  const sky = CreateSphere(
    "ashen-sky",
    { diameter: span * 1.4, segments: 12, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  sky.material = skyMaterial(scene);
  glow.addExcludedMesh(sky);
}

/**
 * @param scene - Battlefield that owns the material
 * @param name - Material name
 * @param color - Hex diffuse color
 * @returns An unlit-specular flat material
 */
function flatMaterial(
  scene: Scene,
  name: string,
  color: string,
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(color);
  result.specularColor = Color3.Black();
  return result;
}

/**
 * Paints a vertical ember gradient and wraps it inside the sky dome.
 * @param scene - Battlefield that owns the texture
 * @returns The sky material
 */
function skyMaterial(scene: Scene): StandardMaterial {
  const texture = new DynamicTexture(
    "ashen-sky-gradient",
    { height: 128, width: 16 },
    scene,
    false,
  );
  const context = texture.getContext();
  const gradient = context.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, ASHEN_SKY_ZENITH);
  gradient.addColorStop(0.55, "#4a221c");
  gradient.addColorStop(0.78, ASHEN_HORIZON);
  gradient.addColorStop(1, ASHEN_HAZE);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 16, 128);
  texture.update();

  const material = new StandardMaterial("ashen-sky-material", scene);
  material.emissiveTexture = texture;
  material.diffuseTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = Color3.Black();
  return material;
}
