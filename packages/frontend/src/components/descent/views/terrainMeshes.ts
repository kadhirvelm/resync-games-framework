import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreatePolyhedron } from "@babylonjs/core/Meshes/Builders/polyhedronBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";
import type { TerrainReadout } from "./presentation";

/** Motion entry pushed by animated landmark accents (braziers, crystal shards). */
export interface TerrainAccentMotion {
  amplitude: number;
  baseY: number;
  mesh: TransformNode;
  phase: number;
  speed: number;
  spin: number;
}

/** Shared materials reused across all sculpted battlefield terrain landmarks. */
export interface TerrainMaterials {
  readonly basaltCap: StandardMaterial;
  readonly basaltDark: StandardMaterial;
  readonly brazierGlow: StandardMaterial;
  readonly magmaCore: StandardMaterial;
  readonly magmaCrust: StandardMaterial;
  readonly obsidian: StandardMaterial;
  readonly obsidianVein: StandardMaterial;
  readonly ruinStone: StandardMaterial;
  readonly ruinTrim: StandardMaterial;
  readonly shadowSkirt: StandardMaterial;
}

/**
 * Deterministic 0–1 value from a feature's coordinates and salt so landmarks
 * keep the exact same silhouette across decoration rebuilds.
 * @param x - Feature x
 * @param y - Feature y
 * @param salt - Channel index
 * @returns Pseudo-random fraction in [0, 1)
 */
function seedFraction(x: number, y: number, salt: number): number {
  const raw = Math.sin(x * 12.9898 + y * 78.233 + salt * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
}

/**
 * Builds one matte or emissive Babylon standard material for terrain props.
 * @param scene - Babylon scene
 * @param name - Material name
 * @param hex - Base hex color
 * @param options - Optional specular, emissive, and alpha overrides
 * @returns Configured StandardMaterial
 */
function makeMaterial(
  scene: Scene,
  name: string,
  hex: string,
  options?: {
    alpha?: number;
    emissiveHex?: string;
    emissiveScale?: number;
    specular?: number;
  },
): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  const color = Color3.FromHexString(hex);
  mat.diffuseColor = color;
  mat.ambientColor = color.scale(0.65);
  const spec = options?.specular ?? 0.08;
  mat.specularColor = new Color3(spec, spec, spec);
  if (options?.emissiveHex !== undefined) {
    mat.emissiveColor = Color3.FromHexString(options.emissiveHex).scale(
      options.emissiveScale ?? 0.85,
    );
  }
  if (options?.alpha !== undefined) {
    mat.alpha = options.alpha;
  }
  return mat;
}

/**
 * Allocates the shared terrain material palette once per Babylon scene.
 * @param scene - Descent Babylon scene
 * @returns Reusable material set
 */
export function createTerrainMaterials(scene: Scene): TerrainMaterials {
  return {
    basaltCap: makeMaterial(scene, "terrain-basalt-cap", "#4b4246", {
      specular: 0.1,
    }),
    basaltDark: makeMaterial(scene, "terrain-basalt-dark", "#2e282d", {
      specular: 0.08,
    }),
    brazierGlow: makeMaterial(scene, "terrain-brazier-glow", "#ff8c38", {
      emissiveHex: "#ff6b1a",
      emissiveScale: 1.0,
      specular: 0.2,
    }),
    magmaCore: makeMaterial(scene, "terrain-magma-core", "#ff5e1f", {
      emissiveHex: "#ff4814",
      emissiveScale: 0.95,
      specular: 0.1,
    }),
    magmaCrust: makeMaterial(scene, "terrain-magma-crust", "#291918", {
      emissiveHex: "#5c1b0e",
      emissiveScale: 0.3,
      specular: 0.06,
    }),
    obsidian: makeMaterial(scene, "terrain-obsidian", "#1f1829", {
      emissiveHex: "#26183b",
      emissiveScale: 0.22,
      specular: 0.45,
    }),
    obsidianVein: makeMaterial(scene, "terrain-obsidian-vein", "#a960e6", {
      emissiveHex: "#9b4de0",
      emissiveScale: 0.9,
      specular: 0.35,
    }),
    ruinStone: makeMaterial(scene, "terrain-ruin-stone", "#594e4a", {
      specular: 0.1,
    }),
    ruinTrim: makeMaterial(scene, "terrain-ruin-trim", "#8a6d4b", {
      emissiveHex: "#4d361d",
      emissiveScale: 0.25,
      specular: 0.22,
    }),
    shadowSkirt: makeMaterial(scene, "terrain-shadow-skirt", "#130f13", {
      alpha: 0.58,
      specular: 0,
    }),
  };
}

/**
 * Builds one sculpted 3D terrain landmark under `parent` at `(feature.x, 0, worldZ)`.
 * Every mesh is non-pickable so clicks near choke points never steal orders.
 * @param scene - Babylon scene
 * @param parent - Decoration root transform
 * @param feature - Published terrain landmark
 * @param worldZ - Converted Babylon Z coordinate
 * @param materials - Shared terrain material palette
 * @param motions - Array receiving gentle ambient accent animations
 * @returns The landmark's root transform
 */
export function buildTerrainLandmark(
  scene: Scene,
  parent: TransformNode,
  feature: TerrainReadout,
  worldZ: number,
  materials: TerrainMaterials,
  motions: TerrainAccentMotion[],
): TransformNode {
  const root = new TransformNode(`terrain-${feature.id}`, scene);
  root.parent = parent;
  root.position.set(feature.x, 0, worldZ);
  root.rotation.y = seedFraction(feature.x, feature.y, 1) * Math.PI * 2;

  // Ground-contact shadow skirt anchors the formation onto the flat plateau.
  const skirt = CreateDisc(
    `terrain-skirt-${feature.id}`,
    { radius: feature.radius * 1.06, tessellation: 20 },
    scene,
  );
  skirt.parent = root;
  skirt.rotation.x = Math.PI / 2;
  skirt.position.y = 0.014;
  skirt.material = materials.shadowSkirt;
  skirt.isPickable = false;

  if (feature.kind === "basalt_ridge") {
    buildBasaltRidge(scene, root, feature, materials);
  } else if (feature.kind === "obsidian_spire") {
    buildObsidianSpire(scene, root, feature, materials, motions);
  } else if (feature.kind === "ruin_wall") {
    buildRuinWall(scene, root, feature, materials, motions);
  } else {
    buildMagmaFissure(scene, root, feature, materials, motions);
  }
  return root;
}

/**
 * Multi-column volcanic basalt ridge with stepped hexagonal pillars and
 * craggy summit rock.
 */
function buildBasaltRidge(
  scene: Scene,
  root: TransformNode,
  feature: TerrainReadout,
  materials: TerrainMaterials,
): void {
  const { height, id, radius, x, y } = feature;
  const columns = 6;
  for (let i = 0; i < columns; i += 1) {
    const isCenter = i === 0;
    const angle = (i / (columns - 1)) * Math.PI * 2 + seedFraction(x, y, i + 2);
    const radial = isCenter
      ? 0
      : radius * (0.34 + seedFraction(x, y, i + 10) * 0.34);
    const colHeight = isCenter
      ? height
      : height * (0.42 + seedFraction(x, y, i + 20) * 0.45);
    const colDiameter = isCenter
      ? radius * 0.96
      : radius * (0.55 + seedFraction(x, y, i + 30) * 0.32);
    const column = CreateCylinder(
      `basalt-col-${id}-${i}`,
      {
        diameterBottom: colDiameter * 1.12,
        diameterTop: colDiameter * 0.84,
        height: colHeight,
        tessellation: 6,
      },
      scene,
    );
    column.parent = root;
    column.position.set(
      Math.cos(angle) * radial,
      colHeight * 0.5 - 0.05,
      Math.sin(angle) * radial,
    );
    column.rotation.y = seedFraction(x, y, i + 40) * Math.PI;
    if (!isCenter) {
      column.rotation.z = (seedFraction(x, y, i + 50) - 0.5) * 0.16;
      column.rotation.x = (seedFraction(x, y, i + 60) - 0.5) * 0.16;
    }
    column.material = i % 2 === 0 ? materials.basaltDark : materials.basaltCap;
    column.isPickable = false;
  }

  // Jagged crowning crag on top of the central pillar.
  const crown = CreatePolyhedron(
    `basalt-crown-${id}`,
    { size: radius * 0.36, type: 1 },
    scene,
  );
  crown.parent = root;
  crown.position.set(0, height * 0.92, 0);
  crown.scaling.set(1.25, 0.72, 1.05);
  crown.rotation.set(0.3, seedFraction(x, y, 71) * Math.PI, 0.2);
  crown.material = materials.basaltCap;
  crown.isPickable = false;
}

/**
 * Tall jagged obsidian monolith flanked by angled shards and a floating
 * spirit-crystal accent.
 */
function buildObsidianSpire(
  scene: Scene,
  root: TransformNode,
  feature: TerrainReadout,
  materials: TerrainMaterials,
  motions: TerrainAccentMotion[],
): void {
  const { height, id, radius, x, y } = feature;
  const main = CreateCylinder(
    `obsidian-main-${id}`,
    {
      diameterBottom: radius * 1.25,
      diameterTop: 0.22,
      height,
      tessellation: 6,
    },
    scene,
  );
  main.parent = root;
  main.position.y = height * 0.5 - 0.08;
  main.material = materials.obsidian;
  main.isPickable = false;

  // Flanking angled obsidian shards.
  const shardCount = 4;
  for (let i = 0; i < shardCount; i += 1) {
    const angle = (i / shardCount) * Math.PI * 2 + 0.4;
    const shardHeight = height * (0.36 + seedFraction(x, y, i + 5) * 0.28);
    const shard = CreateCylinder(
      `obsidian-shard-${id}-${i}`,
      {
        diameterBottom: radius * 0.58,
        diameterTop: 0.12,
        height: shardHeight,
        tessellation: 5,
      },
      scene,
    );
    shard.parent = root;
    const offset = radius * 0.48;
    shard.position.set(
      Math.cos(angle) * offset,
      shardHeight * 0.44,
      Math.sin(angle) * offset,
    );
    shard.rotation.z = -Math.cos(angle) * 0.24;
    shard.rotation.x = Math.sin(angle) * 0.24;
    shard.material = i === 0 ? materials.obsidianVein : materials.obsidian;
    shard.isPickable = false;
  }

  // Orbiting spirit crystal shard near the peak.
  const crystal = CreatePolyhedron(
    `obsidian-crystal-${id}`,
    { size: 0.34, type: 1 },
    scene,
  );
  crystal.parent = root;
  crystal.position.set(0, height + 0.45, 0);
  crystal.scaling.set(0.7, 1.5, 0.7);
  crystal.material = materials.obsidianVein;
  crystal.isPickable = false;
  motions.push({
    amplitude: 0.16,
    baseY: crystal.position.y,
    mesh: crystal,
    phase: x * 0.19 + y * 0.13,
    speed: 1.7,
    spin: 0.55,
  });
}

/**
 * Ancient crumbled bastion wall & twin pillars with a burning ember brazier,
 * visually marking tactical choke points.
 */
function buildRuinWall(
  scene: Scene,
  root: TransformNode,
  feature: TerrainReadout,
  materials: TerrainMaterials,
  motions: TerrainAccentMotion[],
): void {
  const { height, id, radius, x, y } = feature;
  const plinth = CreateBox(
    `ruin-plinth-${id}`,
    { depth: radius * 1.45, height: 0.7, width: radius * 1.65 },
    scene,
  );
  plinth.parent = root;
  plinth.position.y = 0.32;
  plinth.material = materials.basaltDark;
  plinth.isPickable = false;

  const wallBlock = CreateBox(
    `ruin-wall-${id}`,
    { depth: radius * 0.72, height: height * 0.62, width: radius * 1.42 },
    scene,
  );
  wallBlock.parent = root;
  wallBlock.position.set(0, 0.6 + height * 0.31, 0);
  wallBlock.material = materials.ruinStone;
  wallBlock.isPickable = false;

  // Twin bastion pillars at either end of the ruined wall.
  for (const side of [-1, 1] as const) {
    const pillarHeight = side === -1 ? height : height * 0.78;
    const pillar = CreateBox(
      `ruin-pillar-${id}-${side}`,
      { depth: radius * 0.56, height: pillarHeight, width: radius * 0.56 },
      scene,
    );
    pillar.parent = root;
    pillar.position.set(side * radius * 0.5, pillarHeight * 0.5, 0);
    pillar.material = materials.ruinStone;
    pillar.isPickable = false;

    const cap = CreateBox(
      `ruin-cap-${id}-${side}`,
      { depth: radius * 0.68, height: 0.35, width: radius * 0.68 },
      scene,
    );
    cap.parent = root;
    cap.position.set(side * radius * 0.5, pillarHeight + 0.15, 0);
    cap.material = materials.ruinTrim;
    cap.isPickable = false;
  }

  // Glowing ember brazier atop the taller bastion pillar.
  const brazier = CreateSphere(
    `ruin-brazier-${id}`,
    { diameter: 0.62, segments: 8 },
    scene,
  );
  brazier.parent = root;
  brazier.position.set(-radius * 0.5, height + 0.62, 0);
  brazier.material = materials.brazierGlow;
  brazier.isPickable = false;
  motions.push({
    amplitude: 0.08,
    baseY: brazier.position.y,
    mesh: brazier,
    phase: x * 0.23 + y * 0.17,
    speed: 3.4,
    spin: 0.4,
  });
}

/**
 * Jagged volcanic magma rift with scorched rock banks and a glowing molten core.
 */
function buildMagmaFissure(
  scene: Scene,
  root: TransformNode,
  feature: TerrainReadout,
  materials: TerrainMaterials,
  motions: TerrainAccentMotion[],
): void {
  const { height, id, radius, x, y } = feature;
  const lavaPool = CreateCylinder(
    `magma-pool-${id}`,
    {
      diameterBottom: radius * 1.72,
      diameterTop: radius * 1.52,
      height: 0.16,
      tessellation: 10,
    },
    scene,
  );
  lavaPool.parent = root;
  lavaPool.position.y = 0.08;
  lavaPool.material = materials.magmaCore;
  lavaPool.isPickable = false;

  // Raised jagged scorched-rock rim banks framing the molten fissure.
  const bankCount = 5;
  for (let i = 0; i < bankCount; i += 1) {
    const angle = (i / bankCount) * Math.PI * 2 + seedFraction(x, y, i + 3);
    const bankHeight = height * (0.65 + seedFraction(x, y, i + 12) * 0.55);
    const rock = CreatePolyhedron(
      `magma-bank-${id}-${i}`,
      { size: radius * 0.34, type: 1 },
      scene,
    );
    rock.parent = root;
    const dist = radius * 0.72;
    rock.position.set(
      Math.cos(angle) * dist,
      bankHeight * 0.35,
      Math.sin(angle) * dist,
    );
    rock.scaling.set(1.2, bankHeight * 0.55, 0.9);
    rock.rotation.y = angle;
    rock.material = materials.magmaCrust;
    rock.isPickable = false;
  }

  // Rising molten ember orb above the rift.
  const ember = CreateSphere(
    `magma-ember-${id}`,
    { diameter: 0.44, segments: 8 },
    scene,
  );
  ember.parent = root;
  ember.position.set(0, 0.75, 0);
  ember.material = materials.magmaCore;
  ember.isPickable = false;
  motions.push({
    amplitude: 0.18,
    baseY: ember.position.y,
    mesh: ember,
    phase: x * 0.31 + y * 0.29,
    speed: 2.6,
    spin: 0.3,
  });
}
