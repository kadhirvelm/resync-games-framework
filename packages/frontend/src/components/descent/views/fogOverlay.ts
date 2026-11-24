import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import { FOG_CELL, type FogOfWarState } from "../logic/fog";
import type { TerrainHill } from "../logic/layers/layerTypes";
import { FOG_COLOR, FOG_SHADE } from "./fogShade";
import { applyHillsToGroundMesh, hillsSignature } from "./hillMesh";

/** Height of the fog sheet: above ground decals, below order markers. */
const FOG_SHEET_Y = 0.045;

/** Shortest gap between repaints, so fast sim speeds stay cheap. */
const MIN_REPAINT_MS = 150;

/** Precomputed opacity byte per fog cell char code. */
const FOG_ALPHA_BY_CODE: Record<number, number> = {
  [FOG_CELL.explored]: Math.round(FOG_SHADE.explored * 255),
  [FOG_CELL.unseen]: Math.round(FOG_SHADE.unseen * 255),
  [FOG_CELL.visible]: Math.round(FOG_SHADE.visible * 255),
};

/**
 * Clamps a tile coordinate onto `[0, size - 1]`.
 * @param value - Candidate index
 * @param size - Axis length
 * @returns Clamped index
 */
function clampTile(value: number, size: number): number {
  if (value < 0) return 0;
  if (value >= size) return size - 1;
  return value;
}

/** Fog drawn over the battlefield. */
export interface FogOverlayHandle {
  dispose: () => void;
  /**
   * Repaints the sheet if the fog changed and the last repaint is old
   * enough. Call once per frame.
   * @param now - Frame timestamp in milliseconds
   */
  render: (now: number) => void;
  /**
   * Drapes the fog sheet over the layer's hills so high ground stays covered
   * when unexplored.
   * @param hills - Walkable hills on the current layer
   */
  setHills: (hills: readonly TerrainHill[]) => void;
  /**
   * Takes the latest fog; hides the sheet when there is none.
   * @param fog - Published fog, or null
   */
  update: (fog: FogOfWarState | null) => void;
}

interface FogSheet {
  height: number;
  imageData: ImageData;
  material: StandardMaterial;
  mesh: Mesh;
  pad: number;
  texture: DynamicTexture;
  tilesDeep: number;
  tilesWide: number;
  width: number;
}

/**
 * Lays a dark, soft-edged sheet over the plateau. Unexplored ground is
 * black, explored ground is dimmed, and ground in sight is clear. The sheet
 * runs `margin` tiles past the map so the rim darkens with its nearest edge.
 * @param scene - Battlefield scene
 * @param margin - Tiles of rim around the playable map
 * @param glow - Scene glow; the sheet stays out of it
 * @returns Handle for per-snapshot updates
 */
export function createFogOverlay(
  scene: Scene,
  margin: number,
  glow: GlowLayer,
): FogOverlayHandle {
  let sheet: FogSheet | null = null;
  let paintedCells: string | null = null;
  let pending: FogOfWarState | null = null;
  let paintedAt = Number.NEGATIVE_INFINITY;
  let currentHills: readonly TerrainHill[] = [];
  let appliedHillsSignature = "";
  const pad = Math.max(0, Math.floor(margin));

  /**
   * @param fog - Fog whose size the sheet must match
   * @returns A sheet sized for this fog
   */
  const sheetFor = (fog: FogOfWarState): FogSheet => {
    if (sheet !== null && sheet.width === fog.width) {
      if (sheet.height === fog.height) return sheet;
    }
    disposeSheet();
    const tilesWide = fog.width + pad * 2;
    const tilesDeep = fog.height + pad * 2;
    const mesh = CreateGround(
      "descent-fog-of-war",
      {
        height: tilesDeep,
        subdivisions: 64,
        updatable: true,
        width: tilesWide,
      },
      scene,
    );
    // Tile c covers map positions that round to c, i.e. [c - 0.5, c + 0.5).
    mesh.position.set(fog.width / 2 - 0.5, FOG_SHEET_Y, fog.height / 2 + 0.5);
    if (currentHills.length > 0) {
      applyHillsToGroundMesh(mesh, currentHills, fog.height, false);
    }
    appliedHillsSignature = hillsSignature(currentHills);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Drawn first among see-through meshes, so order markers and rings sit
    // on top of the dark instead of under it.
    mesh.alphaIndex = 0;
    glow.addExcludedMesh(mesh);
    // One texel per tile with GPU bilinear filtering yields soft sight edges
    // without paying for an expensive CPU canvas blur filter every repaint.
    const texture = new DynamicTexture(
      "descent-fog-of-war-texture",
      {
        height: tilesDeep,
        width: tilesWide,
      },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    const context = texture.getContext() as unknown as CanvasRenderingContext2D;
    const imageData = context.createImageData(tilesWide, tilesDeep);
    // Pre-fill constant RGB channels once; repaints only update alpha bytes.
    const pixels = imageData.data;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels[offset] = FOG_COLOR.r;
      pixels[offset + 1] = FOG_COLOR.g;
      pixels[offset + 2] = FOG_COLOR.b;
      pixels[offset + 3] = 255;
    }
    const material = new StandardMaterial("descent-fog-of-war-material", scene);
    const ink = Color3.FromInts(FOG_COLOR.r, FOG_COLOR.g, FOG_COLOR.b);
    material.diffuseColor = ink;
    material.emissiveColor = ink;
    material.specularColor = Color3.Black();
    material.disableLighting = true;
    material.fogEnabled = false;
    material.opacityTexture = texture;
    mesh.material = material;
    sheet = {
      height: fog.height,
      imageData,
      material,
      mesh,
      pad,
      texture,
      tilesDeep,
      tilesWide,
      width: fog.width,
    };
    paintedCells = null;
    return sheet;
  };

  /** Removes the current sheet and its texture. */
  const disposeSheet = (): void => {
    if (sheet === null) return;
    glow.removeExcludedMesh(sheet.mesh);
    sheet.texture.dispose();
    sheet.material.dispose();
    sheet.mesh.dispose();
    sheet = null;
    paintedCells = null;
  };

  /**
   * Updates the reused `ImageData` alpha bytes directly from `fog.cells` and
   * uploads to the GPU-filtered `DynamicTexture` with zero per-paint allocations.
   * @param target - Sheet to paint
   * @param fog - Fog to show
   */
  const paint = (target: FogSheet, fog: FogOfWarState): void => {
    const pixels = target.imageData.data;
    const { pad: marginPad, tilesDeep, tilesWide } = target;
    let offset = 3;
    for (let row = 0; row < tilesDeep; row += 1) {
      const sourceRow = clampTile(row - marginPad, fog.height) * fog.width;
      for (let column = 0; column < tilesWide; column += 1) {
        const sourceColumn = clampTile(column - marginPad, fog.width);
        const code = fog.cells.charCodeAt(sourceRow + sourceColumn);
        pixels[offset] = FOG_ALPHA_BY_CODE[code] ?? 255;
        offset += 4;
      }
    }
    const context =
      target.texture.getContext() as unknown as CanvasRenderingContext2D;
    context.putImageData(target.imageData, 0, 0);
    target.texture.update(true);
  };

  return {
    dispose: disposeSheet,
    render: (now) => {
      if (pending === null || sheet === null) return;
      if (paintedCells === pending.cells) return;
      if (now - paintedAt < MIN_REPAINT_MS) return;
      paintedCells = pending.cells;
      paintedAt = now;
      paint(sheet, pending);
    },
    setHills: (hills) => {
      const nextSignature = hillsSignature(hills);
      if (nextSignature === appliedHillsSignature) return;
      currentHills = hills;
      appliedHillsSignature = nextSignature;
      if (sheet !== null) {
        applyHillsToGroundMesh(sheet.mesh, hills, sheet.height, false);
      }
    },
    update: (fog) => {
      pending = fog;
      if (fog === null) {
        sheet?.mesh.setEnabled(false);
        return;
      }
      sheetFor(fog).mesh.setEnabled(true);
    },
  };
}
