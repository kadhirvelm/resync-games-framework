import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";
import type { FogOfWarState } from "../logic/fog";
import { FOG_COLOR, fogShadeGrid, paintFogShade } from "./fogShade";

/** Height of the fog sheet: above ground decals, below order markers. */
const FOG_SHEET_Y = 0.045;

/** Texture pixels per tile; the blur below softens the tile edges. */
const TEXELS_PER_TILE = 4;

/** Blur radius, in texture pixels, for the soft edge of sight. */
const EDGE_BLUR_PIXELS = 6;

/** Shortest gap between repaints, so fast sim speeds stay cheap. */
const MIN_REPAINT_MS = 100;

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
   * Takes the latest fog; hides the sheet when there is none.
   * @param fog - Published fog, or null
   */
  update: (fog: FogOfWarState | null) => void;
}

interface FogSheet {
  canvas: HTMLCanvasElement;
  height: number;
  material: StandardMaterial;
  mesh: Mesh;
  texture: DynamicTexture;
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

  /**
   * @param fog - Fog whose size the sheet must match
   * @returns A sheet sized for this fog
   */
  const sheetFor = (fog: FogOfWarState): FogSheet => {
    if (sheet !== null && sheet.width === fog.width) {
      if (sheet.height === fog.height) return sheet;
    }
    disposeSheet();
    const tilesWide = fog.width + margin * 2;
    const tilesDeep = fog.height + margin * 2;
    const mesh = CreateGround(
      "descent-fog-of-war",
      { height: tilesDeep, subdivisions: 1, width: tilesWide },
      scene,
    );
    // Tile c covers map positions that round to c, i.e. [c - 0.5, c + 0.5).
    mesh.position.set(fog.width / 2 - 0.5, FOG_SHEET_Y, fog.height / 2 + 0.5);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    // Drawn first among see-through meshes, so order markers and rings sit
    // on top of the dark instead of under it.
    mesh.alphaIndex = 0;
    glow.addExcludedMesh(mesh);
    const texture = new DynamicTexture(
      "descent-fog-of-war-texture",
      {
        height: tilesDeep * TEXELS_PER_TILE,
        width: tilesWide * TEXELS_PER_TILE,
      },
      scene,
      false,
      Texture.BILINEAR_SAMPLINGMODE,
    );
    texture.hasAlpha = true;
    texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = Texture.CLAMP_ADDRESSMODE;
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
      canvas: document.createElement("canvas"),
      height: fog.height,
      material,
      mesh,
      texture,
      width: fog.width,
    };
    paintedCells = null;
    return sheet;
  };

  /** Removes the current sheet and its texture. */
  const disposeSheet = (): void => {
    if (sheet === null) return;
    sheet.texture.dispose();
    sheet.material.dispose();
    sheet.mesh.dispose();
    sheet = null;
    paintedCells = null;
  };

  /**
   * Paints one tile per pixel, then stretches it into the texture with a
   * blur so sight reads as a soft circle rather than stair steps.
   * @param target - Sheet to paint
   * @param fog - Fog to show
   */
  const paint = (target: FogSheet, fog: FogOfWarState): void => {
    if (!paintFogShade(target.canvas, fogShadeGrid(fog, margin))) return;
    const context = target.texture.getContext() as CanvasRenderingContext2D;
    const size = target.texture.getSize();
    context.clearRect(0, 0, size.width, size.height);
    context.imageSmoothingEnabled = true;
    context.filter = `blur(${EDGE_BLUR_PIXELS}px)`;
    context.drawImage(target.canvas, 0, 0, size.width, size.height);
    context.filter = "none";
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
