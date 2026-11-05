import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { Scene } from "@babylonjs/core/scene";
import type { AshenGateTextureSet } from "../data/layers/ashen_gate/environmentArt";
import type { AshenGateSceneryRole } from "../data/layers/ashen_gate/threeDAssets";
import {
  ABYSS_DEPTH,
  type AshenSceneryPlacement,
  ashenSceneryPlacements,
  GROUND_TILE_SIZE,
  LAVA_TILE_SIZE,
  PLATEAU_RIM,
} from "./ashenTerrainLayout";
import { type TrackLoad, untrackedLoad } from "./loadingProgress";

/** Deep cavern dark behind everything. Matches the scene clear color. */
export const ASHEN_VOID = "#0f0c10";

/** Cool smoke that hides the far lava instead of cutting it off. */
export const ASHEN_HAZE = "#231b22";

/** The battlefield dressing the scene keeps updating after creation. */
export interface AshenBackdropHandle {
  /**
   * Hides the procedural stand-ins for one scenery role once its generated
   * model is placed.
   * @param role - Scenery role whose stand-ins to hide
   */
  hideStandIns: (role: AshenGateSceneryRole) => void;
  /**
   * Shows only the stand-ins the fog has revealed.
   * @param revealedIds - Placement ids whose ground has been explored
   */
  revealStandIns: (revealedIds: ReadonlySet<string>) => void;
  /** Fixed placements for generated scenery, in world space. */
  placements: readonly AshenSceneryPlacement[];
  /**
   * Swaps procedural surfaces for generated paintings as they load.
   * @param textures - Image URLs keyed by surface
   * @param track - Counts each download for the loading screen
   * @returns Resolves once each painting is applied or has failed
   */
  setTextures: (
    textures: AshenGateTextureSet,
    track?: TrackLoad,
  ) => Promise<void>;
  /**
   * Drifts the lava. Call once per frame.
   * @param deltaMs - Milliseconds since the last frame
   */
  update: (deltaMs: number) => void;
}

/**
 * Builds the world around the Hold: a basalt plateau a little larger than
 * the playable map, sheer cliffs, a lava sea far below, rising embers, and
 * stand-ins for generated scenery. Only the named scenery placements are
 * pickable; the terrain and distant backdrop remain presentation-only.
 * @param scene - Descent battlefield
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @param glow - Scene glow; the lava and cliffs stay out of it
 * @param reducedMotion - Whether to keep the lava still and skip embers
 * @returns Handle for textures, stand-ins, and per-frame drift
 */
export function addAshenBackdrop(
  scene: Scene,
  mapWidth: number,
  mapHeight: number,
  glow: GlowLayer,
  reducedMotion: boolean,
): AshenBackdropHandle {
  const plateauWidth = mapWidth + PLATEAU_RIM * 2;
  const plateauDepth = mapHeight + PLATEAU_RIM * 2;

  const plateau = CreateGround(
    "ashen-plateau",
    { height: plateauDepth, subdivisions: 2, width: plateauWidth },
    scene,
  );
  plateau.position.set(mapWidth / 2, -0.1, mapHeight / 2);
  plateau.isPickable = false;
  plateau.receiveShadows = true;
  const plateauMaterial = new StandardMaterial("ashen-plateau-material", scene);
  plateauMaterial.specularColor = new Color3(0.06, 0.07, 0.09);
  // Dim and slightly cool the ground so units and buildings, at their own
  // colors, stand a clear step brighter than the stone they sit on.
  plateauMaterial.diffuseColor = new Color3(0.72, 0.7, 0.7);
  plateauMaterial.ambientColor = new Color3(0.6, 0.6, 0.64);
  plateauMaterial.diffuseTexture = settleGround(
    tiled(
      procedural(scene, "ashen-ground-fallback", 512, paintBasalt),
      plateauWidth / GROUND_TILE_SIZE,
      plateauDepth / GROUND_TILE_SIZE,
    ),
  );
  // One stretch across the whole plateau: soft light and shadow pools
  // that break up the repeat, and lava light washing up over the edges.
  plateauMaterial.ambientTexture = procedural(
    scene,
    "ashen-ground-variation",
    512,
    paintVariation,
  );
  plateauMaterial.emissiveTexture = procedural(
    scene,
    "ashen-ground-edge-glow",
    1024,
    edgeGlowPainter(plateauWidth, plateauDepth),
  );
  for (const layer of [
    plateauMaterial.ambientTexture,
    plateauMaterial.emissiveTexture,
  ]) {
    if (layer === null) continue;
    layer.wrapU = Texture.CLAMP_ADDRESSMODE;
    layer.wrapV = Texture.CLAMP_ADDRESSMODE;
  }
  plateau.material = plateauMaterial;

  const cliffMaterials = addCliffs(scene, mapWidth, mapHeight, glow);

  const span = Math.max(mapWidth, mapHeight) * 9;
  const lava = CreateGround(
    "ashen-lava-sea",
    { height: span, subdivisions: 2, width: span },
    scene,
  );
  lava.position.set(mapWidth / 2, -ABYSS_DEPTH, mapHeight / 2);
  lava.isPickable = false;
  const lavaMaterial = new StandardMaterial("ashen-lava-material", scene);
  lavaMaterial.disableLighting = true;
  lavaMaterial.diffuseColor = Color3.Black();
  lavaMaterial.specularColor = Color3.Black();
  let lavaTexture: Texture = tiled(
    procedural(scene, "ashen-lava-fallback", 512, paintLava),
    span / LAVA_TILE_SIZE,
    span / LAVA_TILE_SIZE,
  );
  lavaTexture.level = 1;
  lavaMaterial.emissiveTexture = lavaTexture;
  lava.material = lavaMaterial;
  glow.addExcludedMesh(lava);

  const placements = ashenSceneryPlacements(mapWidth, mapHeight);
  const standIns = addStandIns(scene, placements);
  const replacedRoles = new Set<AshenGateSceneryRole>();
  if (!reducedMotion) addEmbers(scene, mapWidth, mapHeight);

  /**
   * Loads one generated painting and swaps it in once it decodes, so the
   * procedural surface stays until then.
   * @param url - Image URL
   * @param label - Name shown on the loading screen
   * @param track - Counts the download for the loading screen
   * @param apply - Puts the loaded texture on its material
   * @returns Resolves once applied; a failed painting resolves too and keeps
   *   the procedural surface
   */
  const loadPainting = (
    url: string,
    label: string,
    track: TrackLoad,
    apply: (texture: Texture) => void,
  ): Promise<void> =>
    track(
      label,
      new Promise<Texture>((resolve, reject) => {
        // Callbacks wait a microtask so `texture` is assigned even if Babylon
        // calls one before the constructor returns.
        const texture: Texture = new Texture(url, scene, {
          onError: (message) =>
            queueMicrotask(() => {
              texture.dispose();
              reject(new Error(message ?? `Could not load ${url}`));
            }),
          onLoad: () => queueMicrotask(() => resolve(texture)),
        });
      }),
    ).then(apply, () => undefined);

  let applied: AshenGateTextureSet = {};
  return {
    hideStandIns: (role) => {
      replacedRoles.add(role);
      for (const node of standIns.get(role) ?? []) node.setEnabled(false);
    },
    placements,
    revealStandIns: (revealedIds) => {
      for (const [role, nodes] of standIns) {
        if (replacedRoles.has(role)) continue;
        for (const node of nodes) {
          node.setEnabled(revealedIds.has(node.metadata?.placementId));
        }
      }
    },
    setTextures: async (textures, track = untrackedLoad) => {
      const loads: Promise<void>[] = [];
      if (textures.ground && textures.ground !== applied.ground) {
        loads.push(
          loadPainting(textures.ground, "Basalt ground", track, (texture) => {
            plateauMaterial.diffuseTexture?.dispose();
            plateauMaterial.diffuseTexture = settleGround(
              tiled(
                texture,
                plateauWidth / GROUND_TILE_SIZE,
                plateauDepth / GROUND_TILE_SIZE,
              ),
            );
          }),
        );
      }
      if (textures.lava && textures.lava !== applied.lava) {
        loads.push(
          loadPainting(textures.lava, "Lava sea", track, (texture) => {
            const previous = lavaTexture;
            lavaTexture = tiled(
              texture,
              span / LAVA_TILE_SIZE,
              span / LAVA_TILE_SIZE,
            );
            lavaTexture.level = 0.95;
            lavaMaterial.emissiveTexture = lavaTexture;
            previous.dispose();
          }),
        );
      }
      if (textures.cliff && textures.cliff !== applied.cliff) {
        loads.push(
          loadPainting(textures.cliff, "Plateau cliffs", track, (texture) => {
            for (const { material, repeat } of cliffMaterials) {
              const cliff = texture.clone();
              cliff.uScale = repeat;
              cliff.wrapV = Texture.CLAMP_ADDRESSMODE;
              material.diffuseTexture?.dispose();
              material.emissiveTexture?.dispose();
              material.diffuseTexture = cliff;
              material.emissiveTexture = cliffGlow(cliff);
            }
            texture.dispose();
          }),
        );
      }
      applied = { ...textures };
      await Promise.all(loads);
    },
    update: (deltaMs) => {
      if (reducedMotion) return;
      lavaTexture.uOffset += deltaMs * 0.0000035;
      lavaTexture.vOffset += deltaMs * 0.0000021;
    },
  };
}

/** Keeps the repeated ground quieter than a full-strength painting. */
const GROUND_TEXTURE_LEVEL = 1.05;

/**
 * Turns a ground texture down so the tile repeat recedes behind the figures.
 * @param texture - Plateau diffuse texture
 * @returns The same texture
 */
function settleGround<T extends Texture>(texture: T): T {
  texture.level = GROUND_TEXTURE_LEVEL;
  return texture;
}

/**
 * Repeats a texture across a surface. Mirrored repeats hide the seams of a
 * painting that does not tile perfectly.
 * @param texture - Painted or procedural texture
 * @param uScale - Repeats across
 * @param vScale - Repeats down
 * @returns The same texture, configured
 */
function tiled<T extends Texture>(
  texture: T,
  uScale: number,
  vScale: number,
): T {
  texture.wrapU = Texture.MIRROR_ADDRESSMODE;
  texture.wrapV = Texture.MIRROR_ADDRESSMODE;
  texture.uScale = uScale;
  texture.vScale = vScale;
  texture.anisotropicFilteringLevel = 8;
  return texture;
}

/** One cliff wall's material and how often its texture repeats. */
interface CliffMaterial {
  material: StandardMaterial;
  repeat: number;
}

/**
 * Drops four basalt walls from the plateau edge to the lava.
 * @param scene - Descent battlefield
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 * @param glow - Scene glow, which the walls stay out of
 * @returns Each wall's material so a generated painting can replace it
 */
function addCliffs(
  scene: Scene,
  mapWidth: number,
  mapHeight: number,
  glow: GlowLayer,
): CliffMaterial[] {
  const width = mapWidth + PLATEAU_RIM * 2;
  const depth = mapHeight + PLATEAU_RIM * 2;
  const centerY = -0.1 - ABYSS_DEPTH / 2;
  const fallback = procedural(scene, "ashen-cliff-fallback", 256, paintCliff);
  const walls = [
    { length: width, rotation: 0, x: mapWidth / 2, z: -PLATEAU_RIM },
    {
      length: width,
      rotation: Math.PI,
      x: mapWidth / 2,
      z: mapHeight + PLATEAU_RIM,
    },
    {
      length: depth,
      rotation: Math.PI / 2,
      x: -PLATEAU_RIM,
      z: mapHeight / 2,
    },
    {
      length: depth,
      rotation: -Math.PI / 2,
      x: mapWidth + PLATEAU_RIM,
      z: mapHeight / 2,
    },
  ];
  return walls.map((wall, index) => {
    const mesh = CreatePlane(
      `ashen-cliff-${index}`,
      {
        height: ABYSS_DEPTH,
        sideOrientation: Mesh.DOUBLESIDE,
        width: wall.length,
      },
      scene,
    );
    mesh.position.set(wall.x, centerY, wall.z);
    mesh.rotation.y = wall.rotation;
    mesh.isPickable = false;
    const repeat = Math.max(1, Math.round(wall.length / ABYSS_DEPTH));
    const material = new StandardMaterial(
      `ashen-cliff-material-${index}`,
      scene,
    );
    const texture = fallback.clone();
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    texture.uScale = repeat;
    material.diffuseTexture = texture;
    material.emissiveTexture = cliffGlow(texture);
    material.emissiveColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.backFaceCulling = false;
    mesh.material = material;
    glow.addExcludedMesh(mesh);
    return { material, repeat };
  });
}

/**
 * Copies a cliff texture as a dim self-lit layer, so the lava-warmed base of
 * the wall still reads where the sun does not reach.
 * @param texture - The wall's diffuse texture
 * @returns A dimmer clone for the emissive slot
 */
function cliffGlow(texture: Texture): Texture {
  const glow = texture.clone();
  glow.level = 0.5;
  return glow;
}

/**
 * Builds simple stand-ins for every scenery placement so the rim and the
 * abyss read well before generated models arrive.
 * @param scene - Descent battlefield
 * @param placements - Scenery placements in world space
 * @returns Stand-in roots grouped by role
 */
function addStandIns(
  scene: Scene,
  placements: readonly AshenSceneryPlacement[],
): Map<AshenGateSceneryRole, TransformNode[]> {
  const rock = flatMaterial(scene, "ashen-standin-rock", "#2a2c33");
  const darkRock = flatMaterial(scene, "ashen-standin-dark-rock", "#1b1c21");
  const bronze = flatMaterial(scene, "ashen-standin-bronze", "#9c6b33");
  const ember = glowMaterial(scene, "ashen-standin-ember", "#ff7a2e");
  const portal = glowMaterial(scene, "ashen-standin-portal", "#ff4a1c");
  const crystal = glowMaterial(scene, "ashen-standin-crystal", "#4fe0e6");
  const byRole = new Map<AshenGateSceneryRole, TransformNode[]>();

  for (const placement of placements) {
    const root = new TransformNode(`standin-${placement.id}`, scene);
    root.metadata = { placementId: placement.id };
    root.position.set(placement.x, placement.y, placement.z);
    root.rotation.y = placement.rotation;
    const { footprint: size, height } = placement;
    const add = (mesh: Mesh, material: StandardMaterial): void => {
      mesh.parent = root;
      mesh.material = material;
      mesh.isPickable = true;
      mesh.receiveShadows = true;
    };

    if (placement.role === "hordeGate") {
      for (const side of [-1, 1]) {
        const tower = CreateBox(
          `${root.name}-tower-${side}`,
          { depth: size * 0.16, height: height * 0.78, width: size * 0.16 },
          scene,
        );
        tower.position.set(0, height * 0.39, side * size * 0.3);
        add(tower, darkRock);
        const horn = CreateCylinder(
          `${root.name}-horn-${side}`,
          {
            diameterBottom: size * 0.12,
            diameterTop: 0,
            height: height * 0.3,
            tessellation: 5,
          },
          scene,
        );
        horn.position.set(0, height * 0.88, side * size * 0.34);
        horn.rotation.x = side * 0.35;
        add(horn, darkRock);
      }
      const lintel = CreateBox(
        `${root.name}-lintel`,
        { depth: size * 0.78, height: height * 0.12, width: size * 0.2 },
        scene,
      );
      lintel.position.y = height * 0.76;
      add(lintel, rock);
      const gateway = CreatePlane(
        `${root.name}-portal`,
        {
          height: height * 0.66,
          sideOrientation: Mesh.DOUBLESIDE,
          width: size * 0.45,
        },
        scene,
      );
      gateway.position.y = height * 0.35;
      gateway.rotation.y = Math.PI / 2;
      add(gateway, portal);
    } else if (placement.role === "abyssSpire") {
      const spire = CreateCylinder(
        `${root.name}-rock`,
        {
          diameterBottom: size,
          diameterTop: size * 0.12,
          height,
          tessellation: 6,
        },
        scene,
      );
      spire.position.y = height / 2;
      add(spire, darkRock);
    } else if (placement.role === "rimRuin") {
      const pillar = CreateBox(
        `${root.name}-pillar`,
        { depth: size * 0.3, height: height * 0.8, width: size * 0.3 },
        scene,
      );
      pillar.position.y = height * 0.4;
      add(pillar, rock);
      const band = CreateBox(
        `${root.name}-band`,
        { depth: size * 0.34, height: height * 0.05, width: size * 0.34 },
        scene,
      );
      band.position.y = height * 0.6;
      add(band, bronze);
      const flame = CreatePolyhedron(
        `${root.name}-flame`,
        { size: size * 0.12, type: 1 },
        scene,
      );
      flame.position.y = height * 0.88;
      add(flame, ember);
    } else if (placement.role === "spiritCrystals") {
      for (const [index, offset] of [
        [0, 0, 1],
        [-0.22, 0.12, 0.7],
        [0.2, -0.15, 0.6],
        [0.05, 0.25, 0.45],
      ].entries()) {
        const [dx = 0, dz = 0, scale = 1] = offset;
        const shard = CreateCylinder(
          `${root.name}-shard-${index}`,
          {
            diameterBottom: size * 0.16,
            diameterTop: 0,
            height: height * scale,
            tessellation: 5,
          },
          scene,
        );
        shard.position.set(dx * size, (height * scale) / 2, dz * size);
        shard.rotation.z = dx * 0.9;
        shard.rotation.x = dz * 0.9;
        add(shard, crystal);
      }
    } else {
      for (const [index, offset] of [
        [0, 0, 1],
        [0.3, 0.18, 0.65],
        [-0.28, 0.22, 0.45],
      ].entries()) {
        const [dx = 0, dz = 0, scale = 1] = offset;
        const boulder = CreatePolyhedron(
          `${root.name}-boulder-${index}`,
          { size: size * 0.22 * scale, type: 2 },
          scene,
        );
        boulder.scaling.y = (height / size) * 1.4;
        boulder.position.set(dx * size, height * 0.3 * scale, dz * size);
        boulder.rotation.y = index * 1.3;
        add(boulder, index === 0 ? rock : darkRock);
      }
    }
    const list = byRole.get(placement.role) ?? [];
    list.push(root);
    byRole.set(placement.role, list);
  }
  return byRole;
}

/**
 * Sends embers rising out of the abyss just beyond the plateau edges.
 * @param scene - Descent battlefield
 * @param mapWidth - Playable ground width
 * @param mapHeight - Playable ground height
 */
function addEmbers(scene: Scene, mapWidth: number, mapHeight: number): void {
  const embers = new ParticleSystem("ashen-embers", 900, scene);
  embers.particleTexture = procedural(scene, "ashen-ember", 64, paintEmber);
  embers.emitter = new Vector3(mapWidth / 2, -ABYSS_DEPTH, mapHeight / 2);
  const halfWidth = mapWidth / 2 + PLATEAU_RIM;
  const halfDepth = mapHeight / 2 + PLATEAU_RIM;
  embers.startPositionFunction = (worldMatrix, position) => {
    const reach = 1 + Math.random() * 14;
    const side = Math.floor(Math.random() * 4);
    const along = Math.random() * 2 - 1;
    const local =
      side < 2
        ? new Vector3(
            along * (halfWidth + reach),
            Math.random() * 4,
            (side === 0 ? -1 : 1) * (halfDepth + reach),
          )
        : new Vector3(
            (side === 2 ? -1 : 1) * (halfWidth + reach),
            Math.random() * 4,
            along * (halfDepth + reach),
          );
    Vector3.TransformCoordinatesToRef(local, worldMatrix, position);
  };
  embers.direction1 = new Vector3(-0.6, 4, -0.6);
  embers.direction2 = new Vector3(0.6, 7, 0.6);
  embers.gravity = new Vector3(0, -0.4, 0);
  embers.minLifeTime = 3.5;
  embers.maxLifeTime = 7;
  embers.minSize = 0.12;
  embers.maxSize = 0.42;
  embers.emitRate = 120;
  embers.color1 = new Color4(1, 0.62, 0.22, 1);
  embers.color2 = new Color4(1, 0.36, 0.1, 1);
  embers.colorDead = new Color4(0.4, 0.05, 0.02, 0);
  embers.blendMode = ParticleSystem.BLENDMODE_ADD;
  embers.updateSpeed = 0.012;
  embers.start();
}

/**
 * @param scene - Battlefield that owns the material
 * @param name - Material name
 * @param color - Hex diffuse color
 * @returns A matte lit material
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
 * @param scene - Battlefield that owns the material
 * @param name - Material name
 * @param color - Hex glow color
 * @returns A self-lit material the glow layer blooms
 */
function glowMaterial(
  scene: Scene,
  name: string,
  color: string,
): StandardMaterial {
  const result = flatMaterial(scene, name, color);
  result.emissiveColor = Color3.FromHexString(color);
  return result;
}

/** Paints one procedural surface onto a 2D canvas. */
type Painter = (context: CanvasRenderingContext2D, size: number) => void;

/**
 * @param scene - Battlefield that owns the texture
 * @param name - Texture name
 * @param size - Square canvas size in pixels
 * @param paint - Draws the surface
 * @returns A dynamic texture holding the painting
 */
function procedural(
  scene: Scene,
  name: string,
  size: number,
  paint: Painter,
): DynamicTexture {
  const texture = new DynamicTexture(
    name,
    { height: size, width: size },
    scene,
    true,
  );
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  paint(context, size);
  texture.update();
  return texture;
}

/**
 * Seeded 0–1 sequence so procedural surfaces look the same every load.
 * @param seed - Starting seed
 * @returns A function that returns the next value
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Charcoal-blue basalt plates with ash seams and rare ember cracks. */
const paintBasalt: Painter = (context, size) => {
  const random = seeded(7);
  context.fillStyle = "#2b2e35";
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < 900; index += 1) {
    const shade = 34 + Math.floor(random() * 26);
    context.fillStyle = `rgb(${shade} ${shade + 3} ${shade + 9} / 55%)`;
    const radius = 4 + random() * 22;
    context.beginPath();
    context.arc(random() * size, random() * size, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = "rgb(120 116 112 / 35%)";
  context.lineWidth = 1.5;
  for (let index = 0; index < 60; index += 1) {
    let x = random() * size;
    let y = random() * size;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < 4; step += 1) {
      x += (random() - 0.5) * 60;
      y += (random() - 0.5) * 60;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.strokeStyle = "rgb(230 110 45 / 45%)";
  context.lineWidth = 1;
  for (let index = 0; index < 6; index += 1) {
    let x = random() * size;
    let y = random() * size;
    context.beginPath();
    context.moveTo(x, y);
    for (let step = 0; step < 3; step += 1) {
      x += (random() - 0.5) * 40;
      y += (random() - 0.5) * 40;
      context.lineTo(x, y);
    }
    context.stroke();
  }
};

/** Large soft pools of light and shadow, stretched once over the plateau. */
const paintVariation: Painter = (context, size) => {
  const random = seeded(31);
  context.fillStyle = "rgb(222 222 226)";
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < 34; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = size * (0.06 + random() * 0.16);
    const light = random() > 0.5;
    const pool = context.createRadialGradient(x, y, 0, x, y, radius);
    pool.addColorStop(
      0,
      light ? "rgb(255 255 255 / 55%)" : "rgb(120 122 132 / 50%)",
    );
    pool.addColorStop(1, "rgb(128 128 128 / 0%)");
    context.fillStyle = pool;
    context.fillRect(0, 0, size, size);
  }
};

/**
 * Paints lava light rising over the plateau rim: dark in the middle,
 * warming to orange right at the cliff edge.
 * @param width - Plateau width in world units
 * @param depth - Plateau depth in world units
 * @returns A painter for the plateau's emissive layer
 */
function edgeGlowPainter(width: number, depth: number): Painter {
  return (context, size) => {
    context.fillStyle = "#000";
    context.fillRect(0, 0, size, size);
    const reachX = (5 / width) * size;
    const reachY = (5 / depth) * size;
    const edges: [number, number, number, number, number][] = [
      [0, 0, reachX, 0, reachX],
      [size, 0, size - reachX, 0, reachX],
      [0, 0, 0, reachY, reachY],
      [0, size, 0, size - reachY, reachY],
    ];
    context.globalCompositeOperation = "lighter";
    for (const [x0, y0, x1, y1] of edges) {
      const band = context.createLinearGradient(x0, y0, x1, y1);
      band.addColorStop(0, "rgb(170 62 18)");
      band.addColorStop(0.45, "rgb(60 18 6)");
      band.addColorStop(1, "rgb(0 0 0)");
      context.fillStyle = band;
      context.fillRect(0, 0, size, size);
    }
    context.globalCompositeOperation = "source-over";
  };
}

/** Black crust plates over molten orange and yellow rivers. */
const paintLava: Painter = (context, size) => {
  const random = seeded(11);
  const heat = context.createLinearGradient(0, 0, size, size);
  heat.addColorStop(0, "#ff7a1c");
  heat.addColorStop(0.5, "#ffb03a");
  heat.addColorStop(1, "#ff5a14");
  context.fillStyle = heat;
  context.fillRect(0, 0, size, size);
  for (let index = 0; index < 140; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 14 + random() * 46;
    context.fillStyle = index % 3 === 0 ? "#3a0d06" : "#1c0805";
    context.beginPath();
    for (let corner = 0; corner < 7; corner += 1) {
      const angle = (corner / 7) * Math.PI * 2;
      const reach = radius * (0.65 + random() * 0.35);
      const pointX = x + Math.cos(angle) * reach;
      const pointY = y + Math.sin(angle) * reach;
      if (corner === 0) context.moveTo(pointX, pointY);
      else context.lineTo(pointX, pointY);
    }
    context.closePath();
    context.fill();
  }
};

/** Dark basalt columns that warm toward the lava at the bottom. */
const paintCliff: Painter = (context, size) => {
  const random = seeded(23);
  const shade = context.createLinearGradient(0, 0, 0, size);
  shade.addColorStop(0, "#2c2f37");
  shade.addColorStop(0.6, "#1b1b20");
  shade.addColorStop(0.88, "#5a2412");
  shade.addColorStop(1, "#ff7a2a");
  context.fillStyle = shade;
  context.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += 10 + random() * 12) {
    context.fillStyle = `rgb(0 0 0 / ${20 + random() * 30}%)`;
    context.fillRect(x, 0, 2, size);
  }
};

/** Soft round glow for one ember particle. */
const paintEmber: Painter = (context, size) => {
  const glow = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  glow.addColorStop(0, "rgb(255 240 200 / 100%)");
  glow.addColorStop(0.35, "rgb(255 150 60 / 70%)");
  glow.addColorStop(1, "rgb(255 80 20 / 0%)");
  context.fillStyle = glow;
  context.fillRect(0, 0, size, size);
};
