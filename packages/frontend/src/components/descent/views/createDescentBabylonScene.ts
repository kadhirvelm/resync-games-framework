import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Registers Scene.pick and createPickingRay; without it picking silently
// returns null (every click lands on map 0,0) or throws.
import "@babylonjs/core/Culling/ray";
import type { Bone } from "@babylonjs/core/Bones/bone";
import type { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateDisc } from "@babylonjs/core/Meshes/Builders/discBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateDashedLines } from "@babylonjs/core/Meshes/Builders/linesBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/loaders/glTF/2.0/glTFLoader";
import type { ThreeDAsset } from "@resync-game-framework/api";
import { attachBabylonRuntimeLifecycle } from "../../babylonGame/babylonRuntimeLifecycle";
import {
  getCharacterModelScale,
  getModelHeight,
} from "../../babylonGame/modelSizing";
import type { AshenGateTextureSet } from "../data/layers/ashen_gate/environmentArt";
import {
  type AshenGateAssetRole,
  type AshenGateAssetSet,
  assetRoleForBuilding,
  assetRoleForResource,
  assetRoleForUnit,
  assetRoleForVent,
  isResourceAssetRole,
  isSceneryAssetRole,
} from "../data/layers/ashen_gate/threeDAssets";
import { isFogVisible } from "../logic/fog";
import { elevationAt } from "../logic/layers/elevation";
import { ASHEN_HAZE, ASHEN_VOID, addAshenBackdrop } from "./ashenBackdrop";
import { addCinderFlock } from "./ashenCinders";
import { PLATEAU_RIM } from "./ashenTerrainLayout";
import {
  cameraKeyFromInput,
  cameraPanDirection,
  cameraRotationInput,
  type EdgeScrollPointer,
  edgeScrollPanDirection,
  emptyCameraKeys,
  isPointerInEdgeScrollBand,
} from "./cameraControls";
import { createCarryIconLayer } from "./carryIcons";
import type { MinimapView } from "./DescentMinimap";
import { createFogOverlay } from "./fogOverlay";
import { applyHillsToGroundMesh, hillsSignature } from "./hillMesh";
import { type TrackLoad, untrackedLoad } from "./loadingProgress";
import {
  cameraAlphaToMinimapRotation,
  mapYToWorldZ,
  worldZToMapY,
} from "./mapOrientation";
import {
  advanceGait,
  advancePresentationTime,
  animationClipMatches,
  type CharacterClip,
  defaultStepInterval,
  estimateStepInterval,
  type Gait,
  gaitMotion,
  motionBlend,
  proceduralWorkPose,
  selectCharacterLoopClip,
  smoothAngle,
  stepProgress,
  unitMotionPhase,
  type VillagerWorkPose,
} from "./motion";
import { buildProgressScale, placementPreviewTint } from "./preview";
import { type RouteFlag, routePlan } from "./routeFlags";
import { revealedSceneryIds } from "./sceneryFog";
import { type ScreenPoint, unitAtScreenPoint } from "./screenPick";
import type { MapPoint, OrderMarker, Selection } from "./selection";
import {
  type ShellBuilding,
  type ShellModel,
  type ShellUnit,
  unitDisplayScale,
} from "./shellModel";
import {
  buildTerrainLandmark,
  createTerrainMaterials,
  riverBankRockPlacements,
} from "./terrainMeshes";
import {
  SILHOUETTE_OUTLINE_COLOR,
  selectionRingDiameter,
  UNIT_MARKER_RING,
  unitFallbackScale,
  unitHealthBarHeight,
  unitMarkerDiameter,
  unitOutlineWidth,
  unitOwnerRingColor,
  unitTargetHeight,
} from "./unitContrast";
import { isTypingTarget } from "./useHotkeys";

/** A pick result translated back into renderer-neutral map coordinates. */
export interface DescentScenePick {
  buildingId: string | null;
  point: MapPoint;
  sceneryId: string | null;
  unitId: string | null;
}

/** Optional callbacks and overrides for the Babylon scene adapter. */
export interface DescentBabylonSceneOptions {
  /** Explicitly enable or disable edge scrolling (defaults to fullscreen-only). */
  edgeScrollEnabled?: boolean;
  /** Called when the browser reports WebGL context loss. */
  onContextLost?: () => void;
  /** Called when the browser restores the WebGL context. */
  onContextRestored?: () => void;
}

/** Screen-space box used by the React input adapter. */
export interface DescentScreenBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Imperative presentation adapter; the deterministic sim remains authoritative. */
export interface DescentBabylonSceneHandle {
  dispose: () => void;
  focusCamera: (point: MapPoint) => void;
  pick: (clientX: number, clientY: number) => DescentScenePick;
  /**
   * Loads generated models into their roles. Resolves once each one is
   * placed or has failed back to its stand-in.
   */
  setAssets: (assets: AshenGateAssetSet, track?: TrackLoad) => Promise<void>;
  /**
   * Swaps procedural ground, cliff, and lava for generated paintings.
   * Resolves once each painting is applied or has failed.
   */
  setTextures: (
    textures: AshenGateTextureSet,
    track?: TrackLoad,
  ) => Promise<void>;
  /** Resolves once the scene can draw without compiling anything new. */
  whenReady: () => Promise<void>;
  /**
   * Rings an inspected map feature (resource node, Spirit Vein, or vent), or
   * hides the ring when given null.
   */
  setInspectRing: (
    ring: { radius: number; x: number; y: number } | null,
  ) => void;
  setPlacementPoint: (
    point: MapPoint | null,
    footprint?: number,
    valid?: boolean | null,
  ) => void;
  /**
   * Shows a row of ghost pieces for a wall being dragged out, or hides them
   * when given null.
   */
  setPlacementLine: (
    cells: { valid: boolean; x: number; y: number }[] | null,
  ) => void;
  showOrderMarker: (marker: OrderMarker) => void;
  unitsInScreenBox: (box: DescentScreenBox) => string[];
  update: (
    model: ShellModel,
    selection: Selection,
    placing: boolean,
    placement?: {
      footprint: number;
      point: MapPoint | null;
      valid: boolean | null;
    },
  ) => void;
}

interface EntityMetadata {
  buildingId?: string;
  kind: "building" | "ground" | "unit";
  unitId?: string;
}

interface EntityVisual {
  actionUntil: number;
  activity?: string;
  animations: AnimationGroup[];
  clips: Partial<Record<CharacterClip, AnimationGroup>>;
  construction: TransformNode | null;
  currentClip: string;
  factionId: "hold" | "horde";
  /** Heading the unit turns toward, set once per sim step. */
  facing: number;
  fallback: TransformNode;
  generated: TransformNode | null;
  /** Lazily cached arm bones for the procedural gather swing. */
  workBones?: { left: Bone[]; right: Bone[] } | null;
  channelFill: AbstractMesh | null;
  channelProgress: number | null;
  channelTrack: AbstractMesh | null;
  hasMeditateClip: boolean;
  hasRunClip: boolean;
  hasWorkClip: boolean;
  health: AbstractMesh | null;
  healthInitialized: boolean;
  healthRatio: number;
  gait: Gait;
  id: string;
  kind: "building" | "unit";
  /** When the sim last moved this unit. */
  lastStepAt: number;
  meditating?: boolean;
  /** Cached per-entity animation phase offset in radians. */
  motionPhase: number;
  outlined: boolean;
  presentation: TransformNode;
  removeAt: number | null;
  role: AshenGateAssetRole;
  root: TransformNode;
  selection: AbstractMesh;
  skeletons: Skeleton[];
  /** Width a building is drawn at, in map cells; 0 for units. */
  span: number;
  /** How long the current glide lasts; zero snaps. */
  stepDuration: number;
  /** Where the current glide began. */
  stepFrom: Vector3;
  /** Running estimate of the gap between this unit's sim steps. */
  stepInterval: number;
  stepStartedAt: number;
  target: Vector3;
  targetHealthRatio: number;
  targetPresentationScale: Vector3;
  targetScale: Vector3;
}

interface DecorationMotion {
  amplitude: number;
  baseY: number;
  mesh: TransformNode;
  phase: number;
  speed: number;
  spin: number;
}

interface TransientEffect {
  animationGroups?: AnimationGroup[];
  duration: number;
  from: Vector3;
  kind: "marker" | "pulse" | "qi_nova" | "travel";
  mesh: TransformNode;
  onUpdate?: (progress: number, deltaMs: number) => void;
  orientAlongFlight?: boolean;
  skeletons?: Skeleton[];
  startedAt: number;
  to: Vector3;
}

/** Maximum number of live transient combat/order effects kept at once. */
const MAX_CONCURRENT_TRANSIENT_EFFECTS = 64;

/** Threshold above which seen sim FX ids are pruned to the current snapshot. */
const MAX_SEEN_EFFECTS = 512;

/** A position change larger than this (map cells) snaps instead of gliding. */
const TELEPORT_DISTANCE = 4;

/** Ground left open between neighboring buildings, in map cells. */
const BUILDING_MARGIN = 0.3;

/**
 * Width the building stand-ins, construction frames, and rings are modeled
 * at. Each building scales them by its own span over this.
 */
const BUILDING_REFERENCE_SPAN = 2.75;

/** Height of the building stand-in at the reference span. */
const BUILDING_STAND_IN_HEIGHT = 2.13;

/** Tallest a generated building may stand, as a multiple of its span. */
const BUILDING_MAX_HEIGHT_RATIO = 1.4;

/**
 * Buildings drawn with extra presence: a little wider than their square and
 * allowed to stand taller, so an upgraded Hold reads as a bigger keep.
 */
const BUILDING_ROLE_PRESENCE: Partial<
  Record<AshenGateAssetRole, { heightRatio: number; spanScale: number }>
> = {
  citadel: { heightRatio: 2.2, spanScale: 1.24 },
  outpost: { heightRatio: 1.55, spanScale: 1.07 },
  stronghold: { heightRatio: 1.9, spanScale: 1.14 },
  wardTower: { heightRatio: 2.1, spanScale: 0.95 },
};

/** Model to try when an upgraded Hold's own model is not generated yet. */
const HOLD_MODEL_FALLBACK: Partial<
  Record<AshenGateAssetRole, AshenGateAssetRole>
> = {
  citadel: "stronghold",
  housing: "camp",
  outpost: "camp",
  stronghold: "outpost",
  wardTower: "camp",
};

/** Health bar clearance above a building's roof, in world units. */
const BUILDING_HEALTH_CLEARANCE = 0.5;

/**
 * @param span - Width the building is drawn at
 * @returns Width of its health bar, never narrower than a readable minimum
 */
function healthBarWidth(span: number): number {
  return Math.max(1.2, span * 0.65);
}

/**
 * @param footprint - Side of the building's square in map cells
 * @returns Width to draw the building at. One-cell pieces such as walls fill
 *   their cell so a row of them reads as one wall; larger buildings leave a
 *   thin margin so neighbors stay distinct.
 */
function buildingSpan(footprint: number): number {
  if (footprint <= 1) return 1;
  return footprint - BUILDING_MARGIN;
}

/** Creates a shared flat-shaded scene material. */
function material(
  scene: Scene,
  name: string,
  color: string,
  emissive = false,
): StandardMaterial {
  const result = new StandardMaterial(name, scene);
  result.diffuseColor = Color3.FromHexString(color);
  result.specularColor = Color3.Black();
  if (emissive) result.emissiveColor = result.diffuseColor.scale(0.55);
  return result;
}

/**
 * Paints a soft dark disc and a faction or player-color ring into one foot marker.
 * @param context - Marker texture context
 * @param size - Texture size in pixels
 * @param ring - Faction or player ring color
 * @param prominent - Draw a bolder ring for multiplayer player colors
 */
function paintUnitMarker(
  context: CanvasRenderingContext2D,
  size: number,
  ring: string,
  prominent = false,
): void {
  const center = size / 2;
  context.clearRect(0, 0, size, size);
  const shadow = context.createRadialGradient(
    center,
    center,
    size * 0.04,
    center,
    center,
    size * 0.46,
  );
  shadow.addColorStop(0, "rgba(7, 5, 4, 0.72)");
  shadow.addColorStop(0.62, "rgba(7, 5, 4, 0.5)");
  shadow.addColorStop(1, "rgba(7, 5, 4, 0)");
  context.fillStyle = shadow;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = "rgba(8, 6, 5, 0.92)";
  context.lineWidth = size * (prominent ? 0.092 : 0.058);
  context.beginPath();
  context.arc(center, center, size * 0.4, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = ring;
  context.lineWidth = size * (prominent ? 0.058 : 0.032);
  context.beginPath();
  context.arc(center, center, size * 0.4, 0, Math.PI * 2);
  context.stroke();
}

/**
 * Creates the shared unlit foot marker for one faction or player color.
 * @param scene - Battlefield that owns the material
 * @param name - Unique material name
 * @param ring - Faction or player ring color
 * @param prominent - Draw a bolder ring for multiplayer player colors
 * @returns A transparent ground material
 */
function createUnitMarkerMaterial(
  scene: Scene,
  name: string,
  ring: string,
  prominent = false,
): StandardMaterial {
  const size = 128;
  const texture = new DynamicTexture(
    name,
    { height: size, width: size },
    scene,
    false,
  );
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  paintUnitMarker(context, size, ring, prominent);
  texture.hasAlpha = true;
  texture.update();
  const result = new StandardMaterial(name, scene);
  result.emissiveTexture = texture;
  result.opacityTexture = texture;
  result.diffuseColor = Color3.Black();
  result.emissiveColor = Color3.White();
  result.transparencyMode = Material.MATERIAL_ALPHABLEND;
  result.disableLighting = true;
  result.specularColor = Color3.Black();
  result.backFaceCulling = false;
  result.disableDepthWrite = true;
  return result;
}

/**
 * Draws a thin dark ink line around one unit or building mesh, so its
 * silhouette reads against the ground without changing its colors.
 * @param mesh - Stand-in or generated mesh
 * @param width - Outline width in world units
 */
function markSilhouette(mesh: AbstractMesh, width: number): void {
  mesh.renderOutline = true;
  mesh.outlineColor = Color3.FromHexString(SILHOUETTE_OUTLINE_COLOR);
  mesh.outlineWidth = width;
}

/** Reads entity metadata from a picked mesh or one of its parents. */
function entityMetadata(node: Node | null): EntityMetadata | null {
  let current = node;
  while (current !== null) {
    const value = current.metadata as EntityMetadata | null;
    if (
      value !== null &&
      typeof value === "object" &&
      (value.kind === "unit" ||
        value.kind === "building" ||
        value.kind === "ground")
    ) {
      return value;
    }
    current = current.parent;
  }
  return null;
}

/** Reads a fixed scenery placement id from a picked mesh or one of its parents. */
function sceneryPlacementId(node: Node | null): string | null {
  let current = node;
  while (current !== null) {
    const value = current.metadata as
      | { placementId?: unknown }
      | null
      | undefined;
    if (
      value !== null &&
      value !== undefined &&
      typeof value.placementId === "string"
    ) {
      return value.placementId;
    }
    current = current.parent;
  }
  return null;
}

/** Applies pick metadata to the meshes below one entity root. */
function markEntity(root: TransformNode, metadata: EntityMetadata): void {
  root.metadata = metadata;
  // Units are hit-tested on screen via `unitAtScreenPoint`, so their skinned
  // GLB meshes stay non-pickable to avoid CPU ray-triangle intersection work.
  const pickable = metadata.kind !== "unit";
  for (const mesh of root.getChildMeshes()) {
    mesh.metadata = metadata;
    mesh.isPickable = pickable;
  }
}

/** Canonical character animation clips indexed once per instantiated model. */
const CHARACTER_CLIPS: readonly CharacterClip[] = [
  "attack",
  "death",
  "hit",
  "idle",
  "meditate",
  "run",
  "walk",
  "work",
];

/** Finds a canonical clip after Babylon has prefixed its instance name. */
function findClip(
  animations: readonly AnimationGroup[],
  name: CharacterClip,
): AnimationGroup | undefined {
  return animations.find((candidate) =>
    animationClipMatches(candidate.name, name),
  );
}

/**
 * Indexes canonical character clips once when a model is instantiated so
 * per-frame updates avoid scanning and normalizing animation group names.
 * @param animations - Instantiated animation groups for one visual
 * @returns Lookup map from canonical clip names to animation groups
 */
function indexCharacterClips(
  animations: readonly AnimationGroup[],
): Partial<Record<CharacterClip, AnimationGroup>> {
  const clips: Partial<Record<CharacterClip, AnimationGroup>> = {};
  for (const clip of CHARACTER_CLIPS) {
    const match = findClip(animations, clip);
    if (match !== undefined) clips[clip] = match;
  }
  return clips;
}

/** Starts a looping generated clip only when its desired state changed. */
function playClip(
  visual: EntityVisual,
  name: "idle" | "meditate" | "run" | "walk" | "work",
): void {
  if (visual.currentClip === name) return;
  const requested = visual.clips[name];
  let resolvedName: "idle" | "meditate" | "run" | "walk" | "work" = name;
  if (requested === undefined) {
    if (name === "work" || name === "meditate") resolvedName = "idle";
    else if (name === "run") resolvedName = "walk";
  }
  if (visual.currentClip === resolvedName) return;
  const clip = requested ?? visual.clips[resolvedName];
  if (clip === undefined) return;
  for (const animation of visual.animations) animation.stop();
  let speed = 0.88;
  if (resolvedName === "run") speed = 1.15;
  else if (resolvedName === "walk") speed = 1.12;
  else if (resolvedName === "work") speed = 1.0;
  else if (resolvedName === "meditate") speed = 0.85;
  clip.start(true, speed);
  visual.currentClip = resolvedName;
}

/**
 * Finds each skeleton's arm bones once per visual; multipart GLBs often share
 * one skeleton across meshes, so bones are deduplicated by identity.
 * @param visual - Unit whose generated rig is inspected
 * @returns Cached left and right arm bones
 */
function workBonesFor(visual: EntityVisual): {
  left: Bone[];
  right: Bone[];
} {
  if (visual.workBones !== undefined && visual.workBones !== null) {
    return visual.workBones;
  }
  const found = { left: [] as Bone[], right: [] as Bone[] };
  const seen = new Set<Bone>();
  for (const mesh of visual.generated?.getChildMeshes() ?? []) {
    const skeleton = mesh.skeleton;
    if (!skeleton) continue;
    for (const bone of skeleton.bones) {
      if (seen.has(bone)) continue;
      seen.add(bone);
      const name = bone.name.toLowerCase();
      if (name === "leftarm" || name.endsWith("-leftarm")) {
        found.left.push(bone);
      }
      if (name === "rightarm" || name.endsWith("-rightarm")) {
        found.right.push(bone);
      }
    }
  }
  visual.workBones = found;
  return found;
}

/**
 * Applies a procedural work pose to the presentation and canonical rig arms.
 * @param visual - Unit presentation to pose
 * @param pose - Current procedural joint angles
 */
function applyWorkPose(visual: EntityVisual, pose: VillagerWorkPose): void {
  visual.presentation.rotation.x = pose.torsoPitch;
  const bones = workBonesFor(visual);
  for (const bone of bones.left) {
    const rotation = bone.rotation;
    rotation.x = pose.leftArmPitch;
    bone.rotation = rotation;
  }
  for (const bone of bones.right) {
    const rotation = bone.rotation;
    rotation.x = pose.rightArmPitch;
    bone.rotation = rotation;
  }
}

/**
 * Plays one short character action before locomotion resumes.
 * @param visual - Unit presentation to animate
 * @param name - Canonical one-shot clip
 * @param duration - Presentation-clock duration in milliseconds
 * @param now - Current presentation time
 * @returns Nothing
 */
function playAction(
  visual: EntityVisual,
  name: "attack" | "death" | "hit",
  duration: number,
  now: number,
): void {
  const clip = visual.clips[name];
  if (clip === undefined) return;
  for (const animation of visual.animations) animation.stop();
  clip.start(false);
  visual.actionUntil = now + duration;
  visual.currentClip = name;
}

/**
 * Creates the Ashen Gate RTS renderer and owns every GPU/browser resource.
 * @param canvas - Dedicated WebGL canvas
 * @param initialModel - First immutable simulation read model
 * @param initialSelection - Current UI-only selection
 * @param initialAssets - Generated model roster, which may be empty
 * @param status - Non-fatal loading status callback
 * @param onCameraView - Publishes the camera footprint for the minimap
 * @param options - Optional edge-scroll and WebGL context lifecycle callbacks
 * @returns An imperative adapter used only by the React view boundary
 */
export function createDescentBabylonScene(
  canvas: HTMLCanvasElement,
  initialModel: ShellModel,
  initialSelection: Selection,
  initialAssets: AshenGateAssetSet,
  status: (message: string) => void,
  onCameraView: (view: MinimapView) => void,
  options?: DescentBabylonSceneOptions,
): DescentBabylonSceneHandle {
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: true },
    true,
  );
  /**
   * Caps effective render density at 1.5x DPR so Retina displays stay crisp
   * without over-rendering pixels.
   */
  const applyHardwareScaling = (): void => {
    const dpr =
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    engine.setHardwareScalingLevel(1 / Math.min(dpr, 1.5));
  };
  applyHardwareScaling();
  try {
    const scene = new Scene(engine);
    scene.skipPointerMovePicking = true;
    const void_ = Color3.FromHexString(ASHEN_VOID);
    scene.clearColor = new Color4(void_.r, void_.g, void_.b, 1);
    scene.ambientColor = Color3.FromHexString("#262a36");
    scene.fogMode = Scene.FOGMODE_EXP2;
    scene.fogColor = Color3.FromHexString(ASHEN_HAZE);
    scene.fogDensity = 0.0085;
    const imaging = scene.imageProcessingConfiguration;
    imaging.contrast = 1.16;
    imaging.exposure = 1.08;
    imaging.toneMappingEnabled = true;
    imaging.vignetteEnabled = true;
    imaging.vignetteWeight = 1.4;
    imaging.vignetteColor = new Color4(0.02, 0.01, 0.02, 0);
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const openingAnchor =
      initialModel.buildings.find(
        (building) =>
          building.factionId === "hold" && building.buildingType === "camp",
      ) ??
      initialModel.buildings.find((building) => building.factionId === "hold");
    const openingTarget =
      openingAnchor === undefined
        ? new Vector3(
            initialModel.map.width * (18 / 64),
            0,
            initialModel.map.height / 2,
          )
        : new Vector3(
            openingAnchor.x + 12,
            0,
            mapYToWorldZ(openingAnchor.y, initialModel.map.height),
          );
    const camera = new ArcRotateCamera(
      "descent-rts-camera",
      -Math.PI / 2,
      Math.PI / 3.15,
      27,
      openingTarget,
      scene,
    );
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 72;
    camera.lowerBetaLimit = Math.PI / 3.15;
    camera.upperBetaLimit = Math.PI / 3.15;
    camera.wheelDeltaPercentage = 0.015;
    camera.inertia = 0.84;
    camera.attachControl(canvas, false);
    camera.inputs.removeByType("ArcRotateCameraPointersInput");
    // Babylon's keyboard input orbits on the arrow keys, which fought the RTS
    // pan. The scene reads held keys itself so panning follows the heading.
    camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
    const desiredCameraTarget = camera.target.clone();
    const smoothedCameraTarget = camera.target.clone();
    let desiredCameraAlpha = camera.alpha;
    const cameraKeys = emptyCameraKeys();
    const groundPlane = Plane.FromPositionAndNormal(
      Vector3.Zero(),
      Vector3.Up(),
    );

    let canvasRect: DOMRect = canvas.getBoundingClientRect();
    /** Refreshes the cached canvas client rect after resize or scroll. */
    const updateCanvasRect = (): void => {
      canvasRect = canvas.getBoundingClientRect();
    };
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            if (disposed) return;
            applyHardwareScaling();
            engine.resize();
            updateCanvasRect();
          })
        : null;
    resizeObserver?.observe(canvas);
    window.addEventListener("resize", updateCanvasRect, { passive: true });
    window.addEventListener("scroll", updateCanvasRect, { passive: true });

    /** Prevents browser page scrolling while zooming with the wheel over the canvas. */
    const onCanvasWheel = (event: WheelEvent): void => {
      event.preventDefault();
    };
    canvas.addEventListener("wheel", onCanvasWheel, { passive: false });

    /**
     * Tracks held camera keys on the window so panning works without canvas
     * focus. Text fields and modified shortcuts are left alone.
     * @param event - Window key event
     */
    const onCameraKey = (event: KeyboardEvent): void => {
      const key = cameraKeyFromInput(event.key);
      if (key === null) return;
      const pressed = event.type === "keydown";
      if (pressed && isTypingTarget(event.target)) return;
      if (pressed && (event.altKey || event.ctrlKey || event.metaKey)) return;
      if (event.key.startsWith("Arrow")) {
        event.preventDefault();
      }
      cameraKeys[key] = pressed;
    };

    /** Releases every camera key when the window loses focus mid-press. */
    const releaseCameraKeys = (): void => {
      Object.assign(cameraKeys, emptyCameraKeys());
    };
    window.addEventListener("keydown", onCameraKey);
    window.addEventListener("keyup", onCameraKey);
    window.addEventListener("blur", releaseCameraKeys);

    let edgeScrollPointer: EdgeScrollPointer | null = null;

    /**
     * Tracks the browser pointer for RTS edge scrolling.
     * @param event - Window pointer event
     */
    const onEdgeScrollPointerMove = (event: PointerEvent): void => {
      edgeScrollPointer = { x: event.clientX, y: event.clientY };
    };

    /** Stops edge scrolling when the pointer leaves the canvas or window. */
    const releaseEdgeScrollPointer = (): void => {
      edgeScrollPointer = null;
    };
    window.addEventListener("pointermove", onEdgeScrollPointerMove, {
      passive: true,
    });
    canvas.addEventListener("pointerleave", releaseEdgeScrollPointer);
    document.addEventListener("mouseleave", releaseEdgeScrollPointer);
    window.addEventListener("blur", releaseEdgeScrollPointer);

    let middleDragAnchor: Vector3 | null = null;
    let middleDragPointerId: number | null = null;

    /**
     * Ends an active middle-mouse drag pan and releases pointer capture.
     * @param event - Optional pointer event to match pointer id
     */
    const releaseMiddleDrag = (event?: PointerEvent): void => {
      if (
        event !== undefined &&
        middleDragPointerId !== null &&
        event.pointerId !== middleDragPointerId
      ) {
        return;
      }
      if (middleDragPointerId !== null) {
        try {
          canvas.releasePointerCapture?.(middleDragPointerId);
        } catch {
          // Pointer capture may already have been released by the browser.
        }
      }
      middleDragPointerId = null;
      middleDragAnchor = null;
    };

    /** Clears held camera state when the browser tab becomes hidden. */
    const onVisibilityChange = (): void => {
      if (!document.hidden) return;
      releaseCameraKeys();
      releaseEdgeScrollPointer();
      releaseMiddleDrag();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const ambient = new HemisphericLight(
      "ashen-ambient",
      new Vector3(0.2, 1, -0.3),
      scene,
    );
    // Cool cavern light from above, lava light bouncing up from below.
    ambient.intensity = 0.95;
    ambient.diffuse = Color3.FromHexString("#a9b6d6");
    ambient.groundColor = Color3.FromHexString("#b4471c");
    const sun = new DirectionalLight(
      "ashen-sun",
      new Vector3(-0.55, -1, 0.35),
      scene,
    );
    sun.intensity = 1.25;
    sun.diffuse = Color3.FromHexString("#ffc792");
    const carryIcons = createCarryIconLayer(scene);
    const shadows = new ShadowGenerator(1024, sun);
    shadows.bias = 0.001;
    shadows.normalBias = 0.03;
    shadows.usePercentageCloserFiltering = true;
    const shadowMap = shadows.getShadowMap();
    if (shadowMap !== null) shadowMap.refreshRate = 2;
    const glow = new GlowLayer("ashen-glow", scene, {
      blurKernelSize: 24,
    });
    glow.intensity = 0.38;

    const ground = CreateGround(
      "ashen-ground",
      {
        height: initialModel.map.height,
        subdivisions: 64,
        updatable: true,
        width: initialModel.map.width,
      },
      scene,
    );
    ground.position.set(
      initialModel.map.width / 2,
      -0.08,
      initialModel.map.height / 2,
    );
    // The plateau draws the terrain; this map-sized plane only takes clicks.
    ground.isVisible = false;
    ground.metadata = { kind: "ground" } satisfies EntityMetadata;
    ground.isPickable = true;
    const backdrop = addAshenBackdrop(
      scene,
      initialModel.map.width,
      initialModel.map.height,
      glow,
      reducedMotion,
    );
    const cinders = reducedMotion
      ? null
      : addCinderFlock(scene, initialModel.map.width, initialModel.map.height);
    const fogOverlay = createFogOverlay(scene, PLATEAU_RIM, glow);
    const terrainMaterials = createTerrainMaterials(scene);

    let appliedGroundHillsSignature = "";
    /** Evaluates walkable ground Y at a map coordinate for entity placement. */
    const groundY = (x: number, y: number): number =>
      elevationAt(currentModel.hills, x, y);
    /** Syncs sculpted hill geometry across plateau, fog sheet, and pick ground. */
    const syncHills = (model: ShellModel): void => {
      backdrop.setHills(model.hills);
      fogOverlay.setHills(model.hills);
      const nextSignature = hillsSignature(model.hills);
      if (nextSignature === appliedGroundHillsSignature) return;
      appliedGroundHillsSignature = nextSignature;
      applyHillsToGroundMesh(ground, model.hills, model.map.height, false);
    };
    syncHills(initialModel);

    const holdMaterial = material(scene, "hold-bronze", "#d0aa66");
    holdMaterial.freeze();
    const holdDarkMaterial = material(scene, "hold-dark", "#473126");
    holdDarkMaterial.freeze();
    const hordeMaterial = material(scene, "horde-cinder", "#a93627");
    hordeMaterial.freeze();
    const hordeDarkMaterial = material(scene, "horde-dark", "#351516");
    hordeDarkMaterial.freeze();
    const constructionTimberMaterial = material(
      scene,
      "construction-timber",
      "#bc8247",
    );
    constructionTimberMaterial.freeze();
    const constructionFoundationMaterial = material(
      scene,
      "construction-foundation",
      "#594136",
    );
    constructionFoundationMaterial.freeze();
    const selectedMaterial = material(scene, "selected-gold", "#fff6d4", true);
    selectedMaterial.freeze();
    const holdMarkerMaterial = createUnitMarkerMaterial(
      scene,
      "hold-foot-marker",
      UNIT_MARKER_RING.hold,
    );
    holdMarkerMaterial.freeze();
    const hordeMarkerMaterial = createUnitMarkerMaterial(
      scene,
      "horde-foot-marker",
      UNIT_MARKER_RING.horde,
    );
    hordeMarkerMaterial.freeze();
    const playerMarkerMaterials = new Map<string, StandardMaterial>();
    /** Returns a cached colored foot-marker material for one co-op player. */
    const markerMaterialFor = (
      factionId: "hold" | "horde",
      ownerColor: string | undefined,
    ): StandardMaterial => {
      if (factionId !== "hold") return hordeMarkerMaterial;
      if (ownerColor === undefined) return holdMarkerMaterial;
      let cached = playerMarkerMaterials.get(ownerColor);
      if (cached === undefined) {
        cached = createUnitMarkerMaterial(
          scene,
          `player-foot-marker-${ownerColor}`,
          unitOwnerRingColor(factionId, ownerColor),
          true,
        );
        cached.freeze();
        playerMarkerMaterials.set(ownerColor, cached);
      }
      return cached;
    };
    const playerSelectionMaterials = new Map<string, StandardMaterial>();
    /** Returns an owner-colored selection material for co-op Hold units. */
    const selectionMaterialFor = (
      factionId: "hold" | "horde",
      ownerColor: string | undefined,
    ): StandardMaterial => {
      if (factionId !== "hold" || ownerColor === undefined) {
        return selectedMaterial;
      }
      let cached = playerSelectionMaterials.get(ownerColor);
      if (cached === undefined) {
        cached = material(
          scene,
          `player-selection-${ownerColor}`,
          unitOwnerRingColor(factionId, ownerColor),
          true,
        );
        cached.freeze();
        playerSelectionMaterials.set(ownerColor, cached);
      }
      return cached;
    };
    const healthMaterial = material(scene, "health", "#67c977", true);
    healthMaterial.freeze();
    const channelTrackMaterial = material(
      scene,
      "channel-track",
      "#1c140d",
      false,
    );
    channelTrackMaterial.freeze();
    const channelFillMaterial = material(
      scene,
      "channel-fill",
      "#f3cf73",
      true,
    );
    channelFillMaterial.freeze();
    const veinMaterial = material(scene, "spirit-vein", "#36a9c4", true);
    veinMaterial.alpha = 0.34;
    veinMaterial.freeze();
    const ventMaterial = material(scene, "ember-vent", "#f05e2f", true);
    ventMaterial.alpha = 0.7;
    ventMaterial.freeze();
    const telegraphMaterial = material(
      scene,
      "boss-telegraph",
      "#ffc45d",
      true,
    );
    telegraphMaterial.freeze();
    const projectileMaterial = material(
      scene,
      "projectile-ember",
      "#ffb34e",
      true,
    );
    projectileMaterial.freeze();
    const healMaterial = material(scene, "healing-aether", "#7dffad", true);
    healMaterial.freeze();
    const markerMaterials: Record<OrderMarker["kind"], StandardMaterial> = {
      attack: material(scene, "order-attack", "#ff5a3c", true),
      build: material(scene, "order-build", "#ffd36b", true),
      gather: material(scene, "order-gather", "#ffd36b", true),
      move: material(scene, "order-move", "#7dff9a", true),
    };
    for (const orderMaterial of Object.values(markerMaterials)) {
      orderMaterial.freeze();
    }
    const markerTemplates = new Map<StandardMaterial, Mesh>();
    /**
     * Returns a hidden unit-sized ground marker template for one material so
     * every unit shares geometry via `createInstance`.
     * @param markerMat - Foot marker material
     * @returns Disabled source template mesh
     */
    const markerTemplateFor = (markerMat: StandardMaterial): Mesh => {
      let template = markerTemplates.get(markerMat);
      if (template !== undefined) return template;
      template = CreateGround(
        `template-unit-marker-${markerMat.name}`,
        { height: 1, subdivisions: 1, width: 1 },
        scene,
      );
      template.material = markerMat;
      template.isPickable = false;
      template.setEnabled(false);
      glow.addExcludedMesh(template);
      markerTemplates.set(markerMat, template);
      return template;
    };
    const ownerRingTemplates = new Map<StandardMaterial, Mesh>();
    /**
     * Returns a hidden unit-diameter owner ring template (tessellation 16) for
     * one material so co-op units share geometry via `createInstance`.
     * @param ringMat - Owner ring material
     * @returns Disabled source template mesh
     */
    const ownerRingTemplateFor = (ringMat: StandardMaterial): Mesh => {
      let template = ownerRingTemplates.get(ringMat);
      if (template !== undefined) return template;
      template = CreateTorus(
        `template-owner-ring-${ringMat.name}`,
        { diameter: 1, tessellation: 16, thickness: 0.06 },
        scene,
      );
      template.material = ringMat;
      template.isPickable = false;
      template.setEnabled(false);
      glow.addExcludedMesh(template);
      ownerRingTemplates.set(ringMat, template);
      return template;
    };
    const selectionRingTemplates = new Map<StandardMaterial, Mesh>();
    /**
     * Returns a hidden unit-diameter selection ring template (tessellation 16)
     * for one material so units share geometry via `createInstance`.
     * @param ringMat - Selection ring material
     * @returns Disabled source template mesh
     */
    const selectionRingTemplateFor = (ringMat: StandardMaterial): Mesh => {
      let template = selectionRingTemplates.get(ringMat);
      if (template !== undefined) return template;
      template = CreateTorus(
        `template-selection-ring-${ringMat.name}`,
        { diameter: 1, tessellation: 16, thickness: 0.04 },
        scene,
      );
      template.material = ringMat;
      template.isPickable = false;
      template.setEnabled(false);
      selectionRingTemplates.set(ringMat, template);
      return template;
    };
    const unitHealthTemplate = CreateBox(
      "template-unit-health",
      { depth: 0.055, height: 0.07, width: 0.9 },
      scene,
    );
    unitHealthTemplate.material = healthMaterial;
    unitHealthTemplate.billboardMode = Mesh.BILLBOARDMODE_ALL;
    unitHealthTemplate.isPickable = false;
    unitHealthTemplate.setEnabled(false);
    const channelTrackTemplate = CreateBox(
      "template-channel-track",
      { depth: 0.05, height: 0.075, width: 0.94 },
      scene,
    );
    channelTrackTemplate.material = channelTrackMaterial;
    channelTrackTemplate.billboardMode = Mesh.BILLBOARDMODE_ALL;
    channelTrackTemplate.isPickable = false;
    channelTrackTemplate.setEnabled(false);
    const channelFillTemplate = CreateBox(
      "template-channel-fill",
      { depth: 0.06, height: 0.055, width: 0.9 },
      scene,
    );
    channelFillTemplate.material = channelFillMaterial;
    channelFillTemplate.billboardMode = Mesh.BILLBOARDMODE_ALL;
    channelFillTemplate.isPickable = false;
    channelFillTemplate.setEnabled(false);
    const routeRoot = new TransformNode("unit-route", scene);
    let routeFlagRoot: TransformNode | null = null;
    let routeLine: Mesh | null = null;
    let routeFlagSignature = "";
    let routeLineSignature = "";
    const nodeMaterials = new Map<string, StandardMaterial>();
    const placementMaterial = material(
      scene,
      "placement-preview",
      "#7fd1df",
      true,
    );
    placementMaterial.alpha = 0.48;
    const placementPreview = CreateBox(
      "placement-preview",
      { depth: 1, height: 0.18, width: 1 },
      scene,
    );
    placementPreview.material = placementMaterial;
    placementPreview.isPickable = false;
    placementPreview.setEnabled(false);
    const rallyMaterial = material(scene, "rally-point", "#ffd978", true);
    rallyMaterial.freeze();
    const rallyMarker = new TransformNode("rally-point", scene);
    const rallyRing = CreateTorus(
      "rally-point-ring",
      { diameter: 1.45, tessellation: 32, thickness: 0.09 },
      scene,
    );
    rallyRing.parent = rallyMarker;
    rallyRing.position.y = 0.05;
    rallyRing.material = rallyMaterial;
    rallyRing.isPickable = false;
    const rallyBeacon = CreateCylinder(
      "rally-point-beacon",
      {
        diameterBottom: 0.12,
        diameterTop: 0.04,
        height: 1.35,
        tessellation: 8,
      },
      scene,
    );
    rallyBeacon.parent = rallyMarker;
    rallyBeacon.position.y = 0.72;
    rallyBeacon.material = rallyMaterial;
    rallyBeacon.isPickable = false;
    const rallyCrown = CreateSphere(
      "rally-point-crown",
      { diameter: 0.28, segments: 8 },
      scene,
    );
    rallyCrown.parent = rallyMarker;
    rallyCrown.position.y = 1.42;
    rallyCrown.material = rallyMaterial;
    rallyCrown.isPickable = false;
    rallyMarker.setEnabled(false);
    const entities = new Map<string, EntityVisual>();
    const containers = new Map<AshenGateAssetRole, AssetContainer>();
    const loadedAssetIds = new Map<AshenGateAssetRole, string>();
    const loadingAssetIds = new Map<
      AshenGateAssetRole,
      { assetId: string; done: Promise<void> }
    >();
    const decorationMotions: DecorationMotion[] = [];
    const decorationEntries = new Map<
      string,
      {
        motions: DecorationMotion[];
        node: TransformNode;
        visualSignature: string;
      }
    >();
    const telegraphMotions: DecorationMotion[] = [];
    const transientEffects: TransientEffect[] = [];
    const seenEffects = new Set<number>();
    const decorationRoot = new TransformNode("map-decoration", scene);
    let telegraphRoot = new TransformNode("map-telegraphs", scene);
    let decorationAssetsDirty = false;
    let decorationSignature = "";
    let telegraphSignature = "";
    let sceneryRoot: TransformNode | null = null;
    const sceneryNodes = new Map<string, TransformNode>();
    let revealedScenery = revealedSceneryIds(
      initialModel.fog,
      backdrop.placements,
      initialModel.map.height,
    );
    let revealedSceneryCells = initialModel.fog?.cells ?? null;
    backdrop.revealStandIns(revealedScenery);
    let currentModel = initialModel;
    let currentAssets = initialAssets;
    let disposed = false;
    let lastCameraViewAt = Number.NEGATIVE_INFINITY;
    let presentationNow = performance.now();
    let presentationPaused = false;

    /**
     * Freezes or resumes Babylon clips and ambient backdrop particles alongside
     * the manual world clock.
     * @param paused - Whether every world animation should hold its frame
     * @returns Nothing
     */
    const setPresentationPaused = (paused: boolean): void => {
      if (presentationPaused === paused) return;
      presentationPaused = paused;
      scene.animationsEnabled = !paused;
      backdrop.setPaused(paused);
    };

    let outlinedAtRadius = Number.NaN;
    let outlinedAtHeight = -1;

    /**
     * Rim width for the camera's current zoom, in world units.
     * @returns Outline width that stays a few pixels thick
     */
    const currentOutlineWidth = (): number =>
      unitOutlineWidth(
        camera.radius,
        Math.max(1, engine.getRenderHeight()),
        camera.fov,
      );

    /**
     * Keeps every figure's rim a few pixels thick while the camera zooms.
     * New figures pick up the width when they are created.
     */
    const syncOutlineWidth = (): void => {
      const height = Math.max(1, engine.getRenderHeight());
      if (
        Math.abs(camera.radius - outlinedAtRadius) < 0.05 &&
        height === outlinedAtHeight
      ) {
        return;
      }
      outlinedAtRadius = camera.radius;
      outlinedAtHeight = height;
      const width = unitOutlineWidth(camera.radius, height, camera.fov);
      for (const visual of entities.values()) {
        for (const mesh of visual.presentation.getChildMeshes()) {
          if (mesh.renderOutline) mesh.outlineWidth = width;
        }
      }
    };

    const inspectMaterial = material(scene, "inspect-ring", "#b8ffe0", true);
    inspectMaterial.emissiveColor = Color3.FromHexString("#7fe8b8");
    inspectMaterial.disableLighting = true;
    inspectMaterial.freeze();
    const inspectMarker = CreateTorus(
      "inspect-ring",
      { diameter: 2, tessellation: 48, thickness: 0.09 },
      scene,
    );
    inspectMarker.material = inspectMaterial;
    inspectMarker.isPickable = false;
    inspectMarker.setEnabled(false);

    /**
     * Rings the inspected map feature.
     * @param ring - Center and radius in map space, or null to hide it
     */
    const setInspectRing = (
      ring: { radius: number; x: number; y: number } | null,
    ): void => {
      if (ring === null) {
        inspectMarker.setEnabled(false);
        return;
      }
      inspectMarker.position.set(
        ring.x,
        groundY(ring.x, ring.y) + 0.08,
        mapYToWorldZ(ring.y, currentModel.map.height),
      );
      inspectMarker.scaling.set(ring.radius, 1, ring.radius);
      inspectMarker.setEnabled(true);
    };

    /**
     * Shows or hides the snapped building footprint under the cursor.
     * @param point - Cursor on the map, or null to hide the preview
     * @param footprint - Side of the building's square in map cells
     * @param valid - Whether the ground allows placement; null keeps neutral
     */
    const setPlacementPoint = (
      point: MapPoint | null,
      footprint = 1,
      valid: boolean | null = null,
    ): void => {
      if (point === null) {
        placementPreview.setEnabled(false);
        return;
      }
      const tint = Color3.FromHexString(placementPreviewTint(valid));
      placementMaterial.diffuseColor.copyFrom(tint);
      placementMaterial.emissiveColor.copyFrom(tint.scale(0.55));
      placementPreview.scaling.set(footprint, 1, footprint);
      const snappedX = Math.round(point.x);
      const snappedY = Math.round(point.y);
      placementPreview.position.set(
        snappedX,
        groundY(snappedX, snappedY) + 0.04,
        mapYToWorldZ(snappedY, currentModel.map.height),
      );
      placementPreview.setEnabled(true);
    };

    const lineGhosts: Mesh[] = [];
    const lineMaterials = new Map<boolean, StandardMaterial>();
    /**
     * Draws one ghost per wall cell, reusing a pool of boxes.
     * @param cells - Snapped cells with ground validity, or null to hide all
     */
    const setPlacementLine = (
      cells: { valid: boolean; x: number; y: number }[] | null,
    ): void => {
      const shown = cells ?? [];
      while (lineGhosts.length < shown.length) {
        const ghost = placementPreview.clone(
          `placement-line-${lineGhosts.length}`,
        );
        ghost.scaling.set(1, 1, 1);
        ghost.isPickable = false;
        lineGhosts.push(ghost);
      }
      lineGhosts.forEach((ghost, index) => {
        const cell = shown[index];
        if (cell === undefined) {
          ghost.setEnabled(false);
          return;
        }
        let ghostMaterial = lineMaterials.get(cell.valid);
        if (ghostMaterial === undefined) {
          ghostMaterial = placementMaterial.clone(
            `placement-line-${cell.valid}`,
          );
          const tint = Color3.FromHexString(placementPreviewTint(cell.valid));
          ghostMaterial.diffuseColor.copyFrom(tint);
          ghostMaterial.emissiveColor.copyFrom(tint.scale(0.55));
          ghostMaterial.freeze();
          lineMaterials.set(cell.valid, ghostMaterial);
        }
        ghost.material = ghostMaterial;
        ghost.position.set(
          cell.x,
          groundY(cell.x, cell.y) + 0.04,
          mapYToWorldZ(cell.y, currentModel.map.height),
        );
        ghost.setEnabled(true);
      });
      if (cells !== null) placementPreview.setEnabled(false);
    };

    /** Creates the low-cost silhouette shown until its generated GLB is ready. */
    const createFallback = (
      id: string,
      kind: "building" | "unit",
      factionId: "hold" | "horde",
      role: AshenGateAssetRole,
      root: TransformNode,
    ): TransformNode => {
      const fallback = new TransformNode(`stand-in-${id}`, scene);
      fallback.parent = root;
      const primary = factionId === "hold" ? holdMaterial : hordeMaterial;
      const dark = factionId === "hold" ? holdDarkMaterial : hordeDarkMaterial;
      if (kind === "building") {
        const base = CreateBox(
          `stand-in-base-${id}`,
          { depth: 2.25, height: 1.15, width: 2.25 },
          scene,
        );
        base.parent = fallback;
        base.position.y = 0.58;
        base.material = dark;
        const crown = CreateCylinder(
          `stand-in-crown-${id}`,
          {
            diameterBottom: 2.25,
            diameterTop: role === "fireWard" ? 1.8 : 0.5,
            height: role === "fireWard" ? 0.8 : 1.15,
            tessellation: role === "fireWard" ? 4 : 6,
          },
          scene,
        );
        crown.parent = fallback;
        crown.position.y = 1.55;
        crown.material = primary;
        return fallback;
      }
      const body = CreateCylinder(
        `stand-in-body-${id}`,
        {
          diameterBottom: role === "cinderjaw" ? 1.15 : 0.58,
          diameterTop: role === "cinderjaw" ? 0.8 : 0.43,
          height: role === "cinderjaw" ? 1.8 : 0.95,
          tessellation: 6,
        },
        scene,
      );
      body.parent = fallback;
      body.position.y = role === "cinderjaw" ? 0.9 : 0.58;
      body.material = primary;
      const head = CreateSphere(
        `stand-in-head-${id}`,
        { diameter: role === "cinderjaw" ? 0.9 : 0.42, segments: 6 },
        scene,
      );
      head.parent = fallback;
      head.position.y = role === "cinderjaw" ? 1.95 : 1.25;
      head.material = dark;
      if (
        role === "warden" ||
        role === "cultivator" ||
        role === "raider" ||
        role === "cinderjaw"
      ) {
        const weapon = CreateBox(
          `stand-in-weapon-${id}`,
          {
            depth: 0.12,
            height: role === "cinderjaw" ? 2.2 : 1.25,
            width: 0.12,
          },
          scene,
        );
        weapon.parent = fallback;
        weapon.position.set(role === "raider" ? -0.5 : 0.5, 0.85, 0);
        weapon.rotation.z = role === "raider" ? 0.35 : -0.35;
        weapon.material = dark;
      }
      return fallback;
    };

    /**
     * Builds a lightweight timber frame around an unfinished building.
     * @param id - Building id used to keep Babylon node names unique
     * @param root - Entity root that anchors the frame in the world
     * @returns Construction frame that can be toggled with sim state
     */
    const createConstructionFrame = (
      id: string,
      root: TransformNode,
    ): TransformNode => {
      const frame = new TransformNode(`construction-${id}`, scene);
      frame.parent = root;
      /**
       * Adds one non-interactive timber beam to the construction frame.
       * @param name - Beam-specific name fragment
       * @param position - Local center of the beam
       * @param scaling - Beam dimensions from the unit box
       * @param rotationZ - Optional diagonal rotation around the local z-axis
       */
      const addBeam = (
        name: string,
        position: Vector3,
        scaling: Vector3,
        rotationZ = 0,
      ): void => {
        const beam = CreateBox(
          `construction-${name}-${id}`,
          { depth: 1, height: 1, width: 1 },
          scene,
        );
        beam.parent = frame;
        beam.position.copyFrom(position);
        beam.scaling.copyFrom(scaling);
        beam.rotation.z = rotationZ;
        beam.material = constructionTimberMaterial;
        beam.isPickable = false;
        beam.receiveShadows = true;
        shadows.addShadowCaster(beam);
      };

      const foundation = CreateBox(
        `construction-foundation-${id}`,
        { depth: 2.9, height: 0.12, width: 2.9 },
        scene,
      );
      foundation.parent = frame;
      foundation.position.y = 0.06;
      foundation.material = constructionFoundationMaterial;
      foundation.isPickable = false;
      foundation.receiveShadows = true;

      for (const x of [-1.25, 1.25]) {
        for (const z of [-1.25, 1.25]) {
          addBeam(
            `post-${x}-${z}`,
            new Vector3(x, 1.2, z),
            new Vector3(0.13, 2.4, 0.13),
          );
        }
      }
      for (const y of [1.15, 2.35]) {
        for (const z of [-1.25, 1.25]) {
          addBeam(
            `rail-x-${y}-${z}`,
            new Vector3(0, y, z),
            new Vector3(2.65, 0.12, 0.12),
          );
        }
        for (const x of [-1.25, 1.25]) {
          addBeam(
            `rail-z-${y}-${x}`,
            new Vector3(x, y, 0),
            new Vector3(0.12, 0.12, 2.65),
          );
        }
      }
      for (const z of [-1.27, 1.27]) {
        addBeam(
          `brace-${z}`,
          new Vector3(0, 1.18, z),
          new Vector3(2.7, 0.1, 0.1),
          z < 0 ? -0.7 : 0.7,
        );
      }
      frame.setEnabled(false);
      return frame;
    };

    /**
     * Fits a generated building into its square without letting a slender
     * model tower over the map.
     * @param span - Width the building is drawn at
     * @param modelWidth - Model's wider ground side, in model units
     * @param modelHeight - Model's height, in model units
     * @returns Uniform scale for the model
     */
    const buildingModelScale = (
      role: AshenGateAssetRole,
      span: number,
      modelWidth: number,
      modelHeight: number,
    ): number => {
      const presence = BUILDING_ROLE_PRESENCE[role];
      const drawnSpan = span * (presence?.spanScale ?? 1);
      const heightRatio = presence?.heightRatio ?? BUILDING_MAX_HEIGHT_RATIO;
      return Math.min(
        drawnSpan / modelWidth,
        (drawnSpan * heightRatio) / Math.max(0.01, modelHeight),
      );
    };

    /**
     * The model role for a building. An upgraded Camp steps back through
     * Citadel, Stronghold, and Camp until it finds a generated model.
     * @param building - Published building
     * @returns Role whose model to draw
     */
    const roleForBuilding = (building: ShellBuilding): AshenGateAssetRole => {
      let role = assetRoleForBuilding(building.buildingType, building.tier);
      let fallback = HOLD_MODEL_FALLBACK[role];
      while (fallback !== undefined && currentAssets[role] === undefined) {
        role = fallback;
        fallback = HOLD_MODEL_FALLBACK[role];
      }
      return role;
    };

    /**
     * Returns whether an entity should cast dynamic directional shadows.
     * Regular units use ground foot markers instead to keep shadow passes fast.
     * @param kind - Entity kind
     * @param role - Asset role
     * @returns True for buildings and bosses
     */
    const castsShadow = (
      kind: "building" | "unit",
      role: AshenGateAssetRole,
    ): boolean => kind === "building" || role === "cinderjaw";

    /**
     * Toggles the silhouette outline on one entity's presentation meshes only
     * when its desired outline state changes.
     * @param visual - Entity visual to update
     * @param enabled - Whether the silhouette outline should be rendered
     */
    const setVisualOutline = (visual: EntityVisual, enabled: boolean): void => {
      if (visual.outlined === enabled) return;
      visual.outlined = enabled;
      const width = enabled ? currentOutlineWidth() : 0;
      for (const mesh of visual.presentation.getChildMeshes()) {
        if (enabled) {
          markSilhouette(mesh, width);
        } else {
          mesh.renderOutline = false;
        }
      }
    };

    /**
     * Disposes a building's timber construction frame and removes its child
     * meshes from the shadow map once construction finishes or is canceled.
     * @param visual - Building visual whose frame should be released
     */
    const disposeConstructionFrame = (visual: EntityVisual): void => {
      if (visual.construction === null) return;
      for (const mesh of visual.construction.getChildMeshes()) {
        shadows.removeShadowCaster(mesh);
      }
      visual.construction.dispose();
      visual.construction = null;
    };

    /**
     * Releases every GPU and scene resource owned by one entity visual:
     * animation groups, skeletons, shadow-caster/glow registrations, carried
     * loads, and the root transform hierarchy.
     * @param visual - Entity visual being removed or replaced
     */
    const disposeEntityVisual = (visual: EntityVisual): void => {
      for (const animation of visual.animations) animation.dispose();
      visual.animations = [];
      visual.clips = {};
      visual.hasWorkClip = false;
      visual.hasMeditateClip = false;
      visual.hasRunClip = false;
      for (const skeleton of visual.skeletons) skeleton.dispose();
      visual.skeletons = [];
      disposeConstructionFrame(visual);
      for (const mesh of visual.root.getChildMeshes()) {
        shadows.removeShadowCaster(mesh);
        if (mesh instanceof Mesh) glow.removeExcludedMesh(mesh);
      }
      carryIcons.remove(visual.id);
      visual.root.dispose();
    };

    /**
     * Lazily instantiates a unit's overhead health bar from the shared box
     * template only when the unit is damaged or selected.
     * @param visual - Unit visual
     * @returns The unit's health bar instance
     */
    const ensureUnitHealthBar = (visual: EntityVisual): AbstractMesh => {
      if (visual.health !== null) return visual.health;
      const health = unitHealthTemplate.createInstance(`health-${visual.id}`);
      health.parent = visual.root;
      health.position.set(
        -(1 - visual.healthRatio) * 0.45,
        unitHealthBarHeight(visual.role),
        0,
      );
      health.scaling.x = visual.healthRatio;
      health.billboardMode = Mesh.BILLBOARDMODE_ALL;
      health.isPickable = false;
      visual.health = health;
      return health;
    };

    /**
     * Lazily instantiates a unit's channeling progress bar pair from the
     * shared box templates only when the unit is actively channeling.
     * @param visual - Unit visual
     */
    const ensureChannelBars = (visual: EntityVisual): void => {
      const channelY = unitHealthBarHeight(visual.role) + 0.17;
      if (visual.channelTrack === null) {
        const track = channelTrackTemplate.createInstance(
          `channel-track-${visual.id}`,
        );
        track.parent = visual.root;
        track.position.set(0, channelY, 0);
        track.billboardMode = Mesh.BILLBOARDMODE_ALL;
        track.isPickable = false;
        visual.channelTrack = track;
      }
      if (visual.channelFill === null) {
        const fill = channelFillTemplate.createInstance(
          `channel-fill-${visual.id}`,
        );
        fill.parent = visual.root;
        fill.position.set(0, channelY, 0);
        fill.billboardMode = Mesh.BILLBOARDMODE_ALL;
        fill.isPickable = false;
        visual.channelFill = fill;
      }
    };

    /** Adds a model instance to a gameplay visual and retires its stand-in. */
    const instantiateModel = (
      visual: EntityVisual,
      asset: ThreeDAsset,
      container: AssetContainer,
    ): void => {
      if (visual.generated !== null) {
        for (const mesh of visual.generated.getChildMeshes()) {
          shadows.removeShadowCaster(mesh);
        }
        visual.generated.dispose();
      }
      for (const animation of visual.animations) animation.dispose();
      visual.animations = [];
      visual.clips = {};
      visual.hasWorkClip = false;
      visual.hasMeditateClip = false;
      visual.hasRunClip = false;
      for (const skeleton of visual.skeletons) skeleton.dispose();
      visual.skeletons = [];
      const generated = new TransformNode(`generated-${visual.id}`, scene);
      generated.parent = visual.presentation;
      const instance = container.instantiateModelsToScene(
        (name) => `${visual.id}-${name}`,
        false,
      );
      for (const rootNode of instance.rootNodes) rootNode.parent = generated;
      const { min, max } = asset.validation.bounds;
      const width = Math.max(0.01, (max[0] ?? 1) - (min[0] ?? 0));
      const height = getModelHeight(asset);
      const depth = Math.max(0.01, (max[2] ?? 1) - (min[2] ?? 0));
      const scale =
        visual.kind === "unit"
          ? getCharacterModelScale(asset, unitTargetHeight(visual.role))
          : buildingModelScale(
              visual.role,
              visual.span,
              Math.max(width, depth),
              height,
            );
      generated.scaling.setAll(scale);
      if (visual.kind === "building" && visual.health !== null) {
        visual.health.position.y = height * scale + BUILDING_HEALTH_CLEARANCE;
      }
      generated.position.set(
        -(((max[0] ?? 0) + (min[0] ?? 0)) / 2) * scale,
        -(min[1] ?? 0) * scale,
        -(((max[2] ?? 0) + (min[2] ?? 0)) / 2) * scale,
      );
      const shouldCastShadow = castsShadow(visual.kind, visual.role);
      const outlineWidth = visual.outlined ? currentOutlineWidth() : 0;
      for (const mesh of generated.getChildMeshes()) {
        mesh.receiveShadows = true;
        if (shouldCastShadow) shadows.addShadowCaster(mesh);
        if (visual.outlined) markSilhouette(mesh, outlineWidth);
      }
      visual.generated = generated;
      visual.workBones = null;
      visual.animations = instance.animationGroups;
      visual.clips = indexCharacterClips(instance.animationGroups);
      visual.hasWorkClip = visual.clips.work !== undefined;
      visual.hasMeditateClip = visual.clips.meditate !== undefined;
      visual.hasRunClip = visual.clips.run !== undefined;
      visual.skeletons = instance.skeletons;
      // Crossfade from the current pose instead of snapping between clips.
      for (const animation of visual.animations) {
        animation.enableBlending = true;
        animation.blendingSpeed = 0.08;
      }
      visual.currentClip = "";
      for (const mesh of visual.fallback.getChildMeshes()) {
        shadows.removeShadowCaster(mesh);
        mesh.dispose();
      }
      visual.fallback.setEnabled(false);
      markEntity(visual.root, {
        buildingId: visual.kind === "building" ? visual.id : undefined,
        kind: visual.kind,
        unitId: visual.kind === "unit" ? visual.id : undefined,
      });
      if (visual.kind === "unit") playClip(visual, "idle");
    };

    /**
     * Creates a static resource silhouette while its generated prop is absent.
     * @param role - Harvestable prop family
     * @param root - Node-local parent at the gather point
     * @param nodeMaterial - Resource-specific color cue
     */
    const createResourceStandIn = (
      role: AshenGateAssetRole,
      root: TransformNode,
      nodeMaterial: StandardMaterial,
    ): void => {
      if (role === "explorerCache") {
        const base = CreateBox(
          `${root.name}-cache-base`,
          { depth: 0.85, height: 0.58, width: 1.35 },
          scene,
        );
        base.parent = root;
        base.position.y = 0.31;
        base.material = holdDarkMaterial;
        base.isPickable = false;
        const lid = CreateBox(
          `${root.name}-cache-lid`,
          { depth: 0.94, height: 0.18, width: 1.43 },
          scene,
        );
        lid.parent = root;
        lid.position.y = 0.69;
        lid.material = holdDarkMaterial;
        lid.isPickable = false;
        for (const x of [-0.46, 0.46]) {
          const band = CreateBox(
            `${root.name}-cache-band-${x}`,
            { depth: 0.9, height: 0.72, width: 0.09 },
            scene,
          );
          band.parent = root;
          band.position.set(x, 0.38, 0);
          band.material = nodeMaterial;
          band.isPickable = false;
        }
        const clasp = CreateBox(
          `${root.name}-cache-clasp`,
          { depth: 0.08, height: 0.2, width: 0.2 },
          scene,
        );
        clasp.parent = root;
        clasp.position.set(0, 0.46, 0.47);
        clasp.material = nodeMaterial;
        clasp.isPickable = false;
        const runes = CreateTorus(
          `${root.name}-cache-runes`,
          { diameter: 2.25, tessellation: 28, thickness: 0.045 },
          scene,
        );
        runes.parent = root;
        runes.position.y = 0.025;
        runes.material = nodeMaterial;
        runes.isPickable = false;
        return;
      }
      if (role === "resourceTree") {
        const trunk = CreateCylinder(
          `${root.name}-trunk`,
          {
            diameterBottom: 0.85,
            diameterTop: 0.55,
            height: 1.8,
            tessellation: 7,
          },
          scene,
        );
        trunk.parent = root;
        trunk.position.y = 0.9;
        trunk.material = nodeMaterial;
        const log = CreateCylinder(
          `${root.name}-log`,
          { diameter: 0.48, height: 1.25, tessellation: 7 },
          scene,
        );
        log.parent = root;
        log.position.set(0.65, 0.25, 0.35);
        log.rotation.z = Math.PI / 2;
        log.material = nodeMaterial;
        return;
      }
      if (role === "resourceEssence") {
        const ring = CreateTorus(
          `${root.name}-essence-ring`,
          { diameter: 1.55, tessellation: 24, thickness: 0.08 },
          scene,
        );
        ring.parent = root;
        ring.position.y = 0.12;
        ring.material = nodeMaterial;
        for (const [index, point] of [
          { x: -0.38, y: 0.38, z: 0.08 },
          { x: 0.08, y: 0.62, z: -0.2 },
          { x: 0.42, y: 0.32, z: 0.22 },
        ].entries()) {
          const mote = CreateSphere(
            `${root.name}-essence-mote-${index}`,
            { diameter: 0.34, segments: 6 },
            scene,
          );
          mote.parent = root;
          mote.position.set(point.x, point.y, point.z);
          mote.material = nodeMaterial;
        }
        return;
      }
      if (role === "resourceWell") {
        const basin = CreateTorus(
          `${root.name}-basin`,
          { diameter: 1.55, tessellation: 24, thickness: 0.22 },
          scene,
        );
        basin.parent = root;
        basin.position.y = 0.2;
        basin.material = nodeMaterial;
        const spring = CreateCylinder(
          `${root.name}-spring`,
          {
            diameterBottom: 0.65,
            diameterTop: 0.18,
            height: 0.72,
            tessellation: 10,
          },
          scene,
        );
        spring.parent = root;
        spring.position.y = 0.48;
        spring.material = nodeMaterial;
        return;
      }
      if (role === "resourceSpiritHerbs") {
        for (const [index, x] of [-0.6, -0.3, 0, 0.3, 0.6].entries()) {
          const height = 0.38 + (index % 3) * 0.12;
          const stem = CreateCylinder(
            `${root.name}-herb-stem-${index}`,
            { diameter: 0.07, height, tessellation: 6 },
            scene,
          );
          stem.parent = root;
          stem.position.set(x, height / 2, index % 2 === 0 ? -0.16 : 0.16);
          stem.material = holdDarkMaterial;
          const leaf = CreateSphere(
            `${root.name}-herb-leaf-${index}`,
            { diameter: 0.3, segments: 6 },
            scene,
          );
          leaf.parent = root;
          leaf.position.set(x, height, stem.position.z);
          leaf.scaling.set(1.35, 0.45, 0.8);
          leaf.material = nodeMaterial;
        }
        return;
      }
      if (role === "resourceGrove") {
        for (const [index, x] of [-0.48, 0, 0.48].entries()) {
          const stem = CreateCylinder(
            `${root.name}-stem-${index}`,
            { diameter: 0.2, height: 0.55 + index * 0.14, tessellation: 7 },
            scene,
          );
          stem.parent = root;
          stem.position.set(x, 0.3 + index * 0.07, index === 1 ? -0.18 : 0.12);
          stem.material = holdDarkMaterial;
          const cap = CreateSphere(
            `${root.name}-cap-${index}`,
            { diameter: 0.52 + index * 0.08, segments: 7 },
            scene,
          );
          cap.parent = root;
          cap.position.set(x, 0.62 + index * 0.14, stem.position.z);
          cap.scaling.y = 0.45;
          cap.material = nodeMaterial;
        }
        return;
      }
      if (role === "resourceCoin") {
        const ruin = CreateBox(
          `${root.name}-coin-ruin`,
          { depth: 1.25, height: 0.22, width: 1.05 },
          scene,
        );
        ruin.parent = root;
        ruin.position.y = 0.11;
        ruin.rotation.y = 0.25;
        ruin.material = holdDarkMaterial;
        for (let index = 0; index < 6; index += 1) {
          const coin = CreateCylinder(
            `${root.name}-coin-${index}`,
            { diameter: 0.42, height: 0.07, tessellation: 12 },
            scene,
          );
          coin.parent = root;
          coin.position.set(
            -0.4 + (index % 3) * 0.38,
            0.27 + Math.floor(index / 3) * 0.09,
            index < 3 ? -0.12 : 0.24,
          );
          coin.material = nodeMaterial;
        }
        return;
      }
      for (const [index, point] of [
        { x: -0.45, y: 0.38, z: 0.12 },
        { x: 0.2, y: 0.52, z: -0.2 },
        { x: 0.55, y: 0.27, z: 0.32 },
      ].entries()) {
        const rock = CreateBox(
          `${root.name}-rock-${index}`,
          { depth: 0.62, height: point.y * 2, width: 0.72 },
          scene,
        );
        rock.parent = root;
        rock.position.set(point.x, point.y, point.z);
        rock.rotation.y = index * 0.7;
        rock.rotation.z = (index - 1) * 0.16;
        rock.material = nodeMaterial;
      }
    };

    /**
     * Instantiates and sizes one generated map prop at its authored origin.
     * @param id - Stable decoration id
     * @param asset - Validated generated prop
     * @param container - Loaded Babylon asset container
     * @param root - Decoration-local parent at the map point
     * @param targetFootprint - Maximum x/z span in world units
     * @param targetHeight - Maximum height in world units
     */
    const instantiateDecorationProp = (
      id: string,
      asset: ThreeDAsset,
      container: AssetContainer,
      root: TransformNode,
      targetFootprint: number,
      targetHeight: number,
    ): void => {
      const generated = new TransformNode(`generated-decoration-${id}`, scene);
      generated.parent = root;
      const instance = container.instantiateModelsToScene(
        (name) => `${id}-${name}`,
        false,
      );
      if (
        instance.animationGroups.length > 0 ||
        instance.skeletons.length > 0
      ) {
        generated.onDisposeObservable.addOnce(() => {
          for (const animation of instance.animationGroups) {
            animation.dispose();
          }
          for (const skeleton of instance.skeletons) {
            skeleton.dispose();
          }
        });
      }
      for (const rootNode of instance.rootNodes) rootNode.parent = generated;
      const { min, max } = asset.validation.bounds;
      const width = Math.max(0.01, (max[0] ?? 1) - (min[0] ?? 0));
      const height = Math.max(0.01, (max[1] ?? 1) - (min[1] ?? 0));
      const depth = Math.max(0.01, (max[2] ?? 1) - (min[2] ?? 0));
      const scale = Math.min(
        targetFootprint / Math.max(width, depth),
        targetHeight / height,
      );
      generated.scaling.setAll(scale);
      generated.position.set(
        -(((max[0] ?? 0) + (min[0] ?? 0)) / 2) * scale,
        -(min[1] ?? 0) * scale,
        -(((max[2] ?? 0) + (min[2] ?? 0)) / 2) * scale,
      );
      for (const mesh of generated.getChildMeshes()) {
        mesh.isPickable = false;
        mesh.receiveShadows = true;
        shadows.addShadowCaster(mesh);
      }
    };

    /**
     * Removes a node and all of its descendant meshes from the shadow generator
     * before disposal so deleted props do not leak shadow-caster references.
     * @param node - Root node about to be disposed
     */
    const removeShadowCasters = (node: Node): void => {
      if (node instanceof AbstractMesh) {
        shadows.removeShadowCaster(node);
      }
      for (const mesh of node.getChildMeshes()) {
        shadows.removeShadowCaster(mesh);
      }
    };

    /**
     * Places every fixed scenery copy of one generated model around the
     * plateau and hides that role's stand-ins.
     * @param role - Scenery role that just loaded
     * @param asset - Validated generated prop
     * @param container - Loaded Babylon asset container
     */
    const placeScenery = (
      role: AshenGateAssetRole,
      asset: ThreeDAsset,
      container: AssetContainer,
    ): void => {
      if (!isSceneryAssetRole(role)) return;
      sceneryRoot ??= new TransformNode("ashen-scenery", scene);
      for (const node of sceneryRoot.getChildren()) {
        if (node.name.startsWith(`scenery-${role}-`)) {
          removeShadowCasters(node);
          node.dispose();
        }
      }
      for (const placement of backdrop.placements) {
        if (placement.role === role) sceneryNodes.delete(placement.id);
      }
      for (const placement of backdrop.placements) {
        if (placement.role !== role) continue;
        const root = new TransformNode(
          `scenery-${role}-${placement.id}`,
          scene,
        );
        root.parent = sceneryRoot;
        root.metadata = { placementId: placement.id };
        const interactive = placement.role === "hordeGate";
        root.position.set(placement.x, placement.y, placement.z);
        root.rotation.y = placement.rotation;
        root.setEnabled(revealedScenery.has(placement.id));
        sceneryNodes.set(placement.id, root);
        instantiateDecorationProp(
          placement.id,
          asset,
          container,
          root,
          placement.footprint,
          placement.height,
        );
        for (const mesh of root.getChildMeshes()) {
          mesh.isPickable = interactive;
        }
      }
      backdrop.hideStandIns(role);
    };

    /**
     * Loads one role once, then instantiates it for all matching entities.
     * @param role - Asset role to fill
     * @param asset - Generated model for that role
     * @param track - Counts the download for the loading screen
     * @returns Resolves once the model is placed or its stand-in is kept
     */
    const loadRole = (
      role: AshenGateAssetRole,
      asset: ThreeDAsset,
      track: TrackLoad,
    ): Promise<void> => {
      if (loadedAssetIds.get(role) === asset.id) return Promise.resolve();
      const inFlight = loadingAssetIds.get(role);
      if (inFlight?.assetId === asset.id) return inFlight.done;
      const done = track(
        asset.name,
        LoadAssetContainerAsync(asset.url, scene, {
          pluginExtension: ".glb",
        }),
      )
        .then((container) => {
          loadingAssetIds.delete(role);
          if (disposed) {
            container.dispose();
            return;
          }
          containers.get(role)?.dispose();
          containers.set(role, container);
          loadedAssetIds.set(role, asset.id);
          for (const visual of entities.values()) {
            if (visual.role === role)
              instantiateModel(visual, asset, container);
          }
          if (
            isResourceAssetRole(role) ||
            role === "emberVent" ||
            role === "plankBridge" ||
            role === "riverRocks" ||
            role === "explorerCache" ||
            isSceneryAssetRole(role)
          ) {
            decorationAssetsDirty = true;
          }
          placeScenery(role, asset, container);
        })
        .catch(() => {
          loadingAssetIds.delete(role);
          if (!disposed)
            status(`${asset.name} could not load · stand-in active`);
        });
      loadingAssetIds.set(role, { assetId: asset.id, done });
      return done;
    };

    /**
     * Applies all newly discovered generated models without resetting the
     * scene.
     * @param assets - Generated models keyed by role
     * @param track - Counts each download for the loading screen
     * @returns Resolves once every model is placed or kept as a stand-in
     */
    const setAssets = async (
      assets: AshenGateAssetSet,
      track: TrackLoad = untrackedLoad,
    ): Promise<void> => {
      currentAssets = assets;
      await Promise.all(
        (Object.entries(assets) as [AshenGateAssetRole, ThreeDAsset][]).map(
          ([role, asset]) => loadRole(role, asset, track),
        ),
      );
    };

    /**
     * Waits until every mesh, material, and texture in the scene is ready to
     * draw, so the first visible frame does not stall on shader compiles.
     * @returns Resolves when the scene is ready or has been disposed
     */
    const whenReady = async (): Promise<void> => {
      if (disposed) return;
      await scene.whenReadyAsync();
    };

    /** Creates a selectable entity root from the current read model. */
    const createEntity = (
      entity: ShellUnit | ShellBuilding,
      kind: "building" | "unit",
    ): EntityVisual => {
      const factionId = entity.factionId;
      const role =
        kind === "unit"
          ? assetRoleForUnit(entity as ShellUnit)
          : roleForBuilding(entity as ShellBuilding);
      const span =
        kind === "building"
          ? buildingSpan((entity as ShellBuilding).footprint)
          : 0;
      const buildingScale = span / BUILDING_REFERENCE_SPAN;
      const root = new TransformNode(`${kind}-${entity.id}`, scene);
      const worldZ = mapYToWorldZ(entity.y, currentModel.map.height);
      root.position.set(entity.x, groundY(entity.x, entity.y), worldZ);
      root.scaling.setAll(reducedMotion ? 1 : 0.18);
      const presentation = new TransformNode(
        `presentation-${entity.id}`,
        scene,
      );
      presentation.parent = root;
      const fallback = createFallback(
        entity.id,
        kind,
        factionId,
        role,
        presentation,
      );
      const construction =
        kind === "building" && (entity as ShellBuilding).constructing
          ? createConstructionFrame(entity.id, root)
          : null;
      if (kind === "building") fallback.scaling.setAll(buildingScale);
      if (kind === "unit") {
        const unitScale = unitFallbackScale(role);
        if (unitScale !== 1) fallback.scaling.setAll(unitScale);
      }
      if (construction !== null) {
        construction.scaling.setAll(buildingScale);
        construction.setEnabled(true);
      }
      const shouldCastShadow = castsShadow(kind, role);
      const initialOutlined = role === "cinderjaw";
      const initialOutlineWidth = initialOutlined ? currentOutlineWidth() : 0;
      for (const mesh of fallback.getChildMeshes()) {
        mesh.receiveShadows = true;
        if (shouldCastShadow) shadows.addShadowCaster(mesh);
        if (initialOutlined) markSilhouette(mesh, initialOutlineWidth);
      }
      const markerDiameter = kind === "unit" ? unitMarkerDiameter(role) : 0;
      const marker =
        kind === "unit"
          ? markerTemplateFor(
              markerMaterialFor(factionId, entity.ownerColor),
            ).createInstance(`unit-marker-${entity.id}`)
          : null;
      if (marker !== null) {
        marker.parent = root;
        marker.position.y = 0.01;
        marker.scaling.set(markerDiameter, 1, markerDiameter);
        marker.isPickable = false;
      }
      if (kind === "unit" && factionId === "hold" && entity.ownerColor) {
        const ownerRing = ownerRingTemplateFor(
          selectionMaterialFor(factionId, entity.ownerColor),
        ).createInstance(`owner-marker-${entity.id}`);
        ownerRing.parent = root;
        ownerRing.position.y = 0.018;
        ownerRing.scaling.set(markerDiameter, 1, markerDiameter);
        ownerRing.isPickable = false;
      }
      let ring: AbstractMesh;
      if (kind === "unit") {
        const ringDiameter = selectionRingDiameter(role);
        ring = selectionRingTemplateFor(
          selectionMaterialFor(factionId, entity.ownerColor),
        ).createInstance(`selection-${entity.id}`);
        ring.parent = root;
        ring.position.y = 0.022;
        ring.scaling.set(ringDiameter, 1, ringDiameter);
        ring.isPickable = false;
        ring.setEnabled(false);
      } else {
        ring = CreateTorus(
          `selection-${entity.id}`,
          {
            diameter: span + 0.5,
            tessellation: 48,
            thickness: 0.08,
          },
          scene,
        );
        ring.parent = root;
        ring.position.y = 0.025;
        ring.material = selectionMaterialFor(factionId, entity.ownerColor);
        ring.isPickable = false;
        ring.setEnabled(false);
      }
      let health: AbstractMesh | null = null;
      if (kind === "building") {
        health = CreateBox(
          `health-${entity.id}`,
          {
            depth: 0.055,
            height: 0.1,
            width: healthBarWidth(span),
          },
          scene,
        );
        health.parent = root;
        health.position.set(
          0,
          BUILDING_STAND_IN_HEIGHT * buildingScale + BUILDING_HEALTH_CLEARANCE,
          0,
        );
        health.material = healthMaterial;
        health.billboardMode = Mesh.BILLBOARDMODE_ALL;
        health.isPickable = false;
        health.setEnabled(false);
      }
      const motionPhase = unitMotionPhase(entity.id);
      const visual: EntityVisual = {
        actionUntil: 0,
        activity:
          kind === "unit"
            ? ((entity as ShellUnit).activity ?? undefined)
            : undefined,
        animations: [],
        channelFill: null,
        channelProgress: null,
        channelTrack: null,
        clips: {},
        construction,
        currentClip: "",
        facing: 0,
        factionId,
        fallback,
        gait: { phase: motionPhase, weight: 0 },
        generated: null,
        hasMeditateClip: false,
        hasRunClip: false,
        hasWorkClip: false,
        health,
        healthInitialized: false,
        healthRatio: 1,
        id: entity.id,
        kind,
        lastStepAt: Number.NEGATIVE_INFINITY,
        motionPhase,
        outlined: initialOutlined,
        presentation,
        removeAt: null,
        role,
        root,
        selection: ring,
        skeletons: [],
        span,
        stepDuration: 0,
        stepFrom: new Vector3(entity.x, 0, worldZ),
        stepInterval: defaultStepInterval(role),
        stepStartedAt: 0,
        target: new Vector3(entity.x, 0, worldZ),
        targetHealthRatio: 1,
        targetPresentationScale: Vector3.One(),
        targetScale: Vector3.One(),
      };
      markEntity(root, {
        buildingId: kind === "building" ? entity.id : undefined,
        kind,
        unitId: kind === "unit" ? entity.id : undefined,
      });
      // The marker is wider than the body. Leave clicks on the figure itself
      // so a packed formation does not select whoever's ring is on top.
      if (marker !== null) marker.isPickable = false;
      const generatedAsset = currentAssets[role];
      const container = containers.get(role);
      if (generatedAsset !== undefined && container !== undefined) {
        instantiateModel(visual, generatedAsset, container);
      }
      return visual;
    };

    /** Updates one health bar from simulation-published hit points. */
    const updateHealth = (
      visual: EntityVisual,
      hitPoints: number | null,
      maxHitPoints: number | null,
    ): void => {
      if (hitPoints === null || maxHitPoints === null || !(maxHitPoints > 0)) {
        visual.health?.setEnabled(false);
        visual.targetHealthRatio = 1;
        return;
      }
      const ratio = Math.max(0.03, Math.min(1, hitPoints / maxHitPoints));
      if (
        visual.healthInitialized &&
        ratio < visual.targetHealthRatio - 0.015 &&
        visual.kind === "unit"
      ) {
        playAction(visual, "hit", 280, presentationNow);
      }
      if (!visual.healthInitialized) visual.healthRatio = ratio;
      visual.healthInitialized = true;
      visual.targetHealthRatio = ratio;
      // Like AoE2, a selected unit always shows its health, even at full HP.
      const shouldShow = ratio < 0.999 || visual.selection.isEnabled();
      if (!shouldShow) {
        visual.health?.setEnabled(false);
        return;
      }
      if (visual.kind === "unit" && visual.health === null) {
        ensureUnitHealthBar(visual);
      }
      visual.health?.setEnabled(true);
    };

    /**
     * Computes a compact structural signature for static and semi-static map
     * decorations (nodes, terrain, veins, vents) without JSON serialization.
     * @param model - Latest shell model
     * @returns Signature string that changes only when decoration features change
     */
    const buildDecorationSignature = (model: ShellModel): string => {
      let signature = `n${model.nodes.length}:`;
      for (const node of model.nodes) {
        signature += `${node.id},${node.resource},${node.x},${node.y};`;
      }
      signature += `|t${model.terrain.length}:`;
      for (const feature of model.terrain) {
        signature += `${feature.id},${feature.kind},${feature.x},${feature.y},${feature.radius},${feature.angle ?? ""};`;
      }
      signature += `|v${model.veins.length}:`;
      for (const vein of model.veins) {
        signature += `${vein.id},${vein.x},${vein.y},${vein.radius};`;
      }
      signature += `|e${model.vents.length}:`;
      for (const vent of model.vents) {
        signature += `${vent.id},${vent.x},${vent.y},${vent.radius};`;
      }
      signature += "|camps:";
      for (const camp of model.exploration?.camps ?? []) {
        signature += `${camp.id},${camp.x},${camp.y},${camp.cleared};`;
      }
      return signature;
    };

    /**
     * Incrementally reconciles non-interactive veins, vents, terrain landmarks,
     * and resource nodes keyed by stable feature id so fog reveals only build
     * newly uncovered features instead of tearing down the entire map.
     * @param model - Latest shell model
     */
    const syncDecorations = (model: ShellModel): void => {
      const signature = buildDecorationSignature(model);
      if (signature === decorationSignature && !decorationAssetsDirty) return;
      decorationSignature = signature;

      const activeKeys = new Set<string>();
      let motionsDirty = false;

      /**
       * Creates or replaces one decoration entry only when it is missing or its
       * visual signature has changed.
       * @param key - Stable map feature key
       * @param visualSignature - Signature covering position, geometry, and loaded asset id
       * @param build - Builds the feature root and returns any ambient motions
       */
      const upsertEntry = (
        key: string,
        visualSignature: string,
        build: () => { motions: DecorationMotion[]; node: TransformNode },
      ): void => {
        activeKeys.add(key);
        const existing = decorationEntries.get(key);
        if (existing !== undefined) {
          if (existing.visualSignature === visualSignature) return;
          removeShadowCasters(existing.node);
          existing.node.dispose();
          decorationEntries.delete(key);
          motionsDirty = true;
        }
        const built = build();
        decorationEntries.set(key, {
          motions: built.motions,
          node: built.node,
          visualSignature,
        });
        if (built.motions.length > 0) motionsDirty = true;
      };

      const bridgeAsset = currentAssets.plankBridge;
      const bridgeContainer = containers.get("plankBridge");
      const bridgeAssetId =
        bridgeAsset !== undefined && bridgeContainer !== undefined
          ? bridgeAsset.id
          : "";
      const riverRocksAsset = currentAssets.riverRocks;
      const riverRocksContainer = containers.get("riverRocks");
      const useGeneratedRiverRocks =
        riverRocksAsset !== undefined && riverRocksContainer !== undefined;
      const riverRocksAssetId = useGeneratedRiverRocks
        ? riverRocksAsset.id
        : "";

      for (const feature of model.terrain) {
        const key = `terrain:${feature.id}`;
        let visualSignature = `${feature.kind},${feature.x},${feature.y},${feature.radius},${feature.height},${feature.width ?? ""},${feature.angle ?? ""}`;
        if (feature.kind === "bridge") {
          visualSignature += `,b:${bridgeAssetId}`;
        } else if (feature.kind === "deep_water") {
          // Include nearby water/bridge ids so shoreline rock placement updates
          // if an adjacent river disk or crossing is revealed.
          let neighbors = "";
          for (const other of model.terrain) {
            if (other.id === feature.id) continue;
            if (other.kind !== "deep_water" && other.kind !== "bridge") {
              continue;
            }
            const maxRange = feature.radius * 1.2 + other.radius + 1.5;
            if (
              Math.hypot(feature.x - other.x, feature.y - other.y) <= maxRange
            ) {
              neighbors += `${other.id};`;
            }
          }
          visualSignature += `,r:${riverRocksAssetId},${neighbors}`;
        }

        upsertEntry(key, visualSignature, () => {
          const worldZ = mapYToWorldZ(feature.y, model.map.height);
          const entryMotions: DecorationMotion[] = [];
          const useGeneratedBridge =
            feature.kind === "bridge" &&
            bridgeAsset !== undefined &&
            bridgeContainer !== undefined;
          if (useGeneratedBridge) {
            const bridgeRoot = new TransformNode(
              `terrain-${feature.id}`,
              scene,
            );
            bridgeRoot.parent = decorationRoot;
            bridgeRoot.position.set(
              feature.x,
              groundY(feature.x, feature.y),
              worldZ,
            );
            bridgeRoot.rotation.y = feature.angle ?? 0;
            // The model is one short, roughly square span whose rails run along
            // its z axis: turn it 90° and tile it along the crossing.
            const deckWidth = feature.width ?? 3.6;
            const spans = Math.max(
              1,
              Math.round((feature.radius * 2) / deckWidth),
            );
            const spacing = (feature.radius * 2) / spans;
            for (let span = 0; span < spans; span += 1) {
              const spanRoot = new TransformNode(
                `terrain-${feature.id}-span-${span}`,
                scene,
              );
              spanRoot.parent = bridgeRoot;
              spanRoot.position.x = -feature.radius + spacing * (span + 0.5);
              spanRoot.rotation.y = Math.PI / 2;
              instantiateDecorationProp(
                `${feature.id}-${span}`,
                bridgeAsset,
                bridgeContainer,
                spanRoot,
                Math.max(deckWidth, spacing),
                2.2,
              );
            }
            return { motions: entryMotions, node: bridgeRoot };
          }

          const landmarkRoot = buildTerrainLandmark(
            scene,
            decorationRoot,
            feature,
            worldZ,
            terrainMaterials,
            entryMotions,
            {
              allTerrain: model.terrain,
              skipProceduralRocks: useGeneratedRiverRocks,
            },
          );
          landmarkRoot.position.y = groundY(feature.x, feature.y);
          if (feature.kind === "deep_water" && useGeneratedRiverRocks) {
            const rocks = riverBankRockPlacements(feature, model.terrain);
            for (let i = 0; i < rocks.length; i += 1) {
              const rock = rocks[i];
              if (rock === undefined) continue;
              const rockRoot = new TransformNode(
                `terrain-${feature.id}-rock-${i}`,
                scene,
              );
              rockRoot.parent = landmarkRoot;
              rockRoot.position.set(
                rock.x - feature.x,
                0,
                mapYToWorldZ(rock.y, model.map.height) - worldZ,
              );
              rockRoot.rotation.y = rock.angle;
              instantiateDecorationProp(
                `${feature.id}-rock-${i}`,
                riverRocksAsset,
                riverRocksContainer,
                rockRoot,
                0.9 * rock.scale,
                0.65 * rock.scale,
              );
            }
          }
          return { motions: entryMotions, node: landmarkRoot };
        });
      }

      const veinAsset = currentAssets.spiritCrystals;
      const veinContainer = containers.get("spiritCrystals");
      const veinAssetId =
        veinAsset !== undefined && veinContainer !== undefined
          ? veinAsset.id
          : "";
      for (const vein of model.veins) {
        const key = `vein:${vein.id}`;
        const visualSignature = `${vein.x},${vein.y},${vein.radius},${veinAssetId}`;
        upsertEntry(key, visualSignature, () => {
          const veinRoot = new TransformNode(`vein-entry-${vein.id}`, scene);
          veinRoot.parent = decorationRoot;
          const worldZ = mapYToWorldZ(vein.y, model.map.height);
          veinRoot.position.set(vein.x, groundY(vein.x, vein.y), worldZ);
          const marker = CreateTorus(
            `vein-ring-${vein.id}`,
            {
              diameter: Math.max(1.5, vein.radius * 1.2),
              tessellation: 28,
              thickness: 0.055,
            },
            scene,
          );
          marker.parent = veinRoot;
          marker.position.y = 0.018;
          marker.material = veinMaterial;
          marker.isPickable = false;
          const innerRune = CreateTorus(
            `vein-rune-${vein.id}`,
            { diameter: 0.72, tessellation: 6, thickness: 0.045 },
            scene,
          );
          innerRune.parent = veinRoot;
          innerRune.position.y = 0.022;
          innerRune.material = veinMaterial;
          innerRune.isPickable = false;
          if (veinAsset !== undefined && veinContainer !== undefined) {
            const crystalRoot = new TransformNode(
              `vein-crystals-${vein.id}`,
              scene,
            );
            crystalRoot.parent = veinRoot;
            // Offset the cluster so a building on the vein leaves it visible.
            crystalRoot.position.set(0.65, 0, 0.35);
            instantiateDecorationProp(
              vein.id,
              veinAsset,
              veinContainer,
              crystalRoot,
              1.2,
              1.55,
            );
          }
          return {
            motions: [
              {
                amplitude: 0.012,
                baseY: marker.position.y,
                mesh: marker,
                phase: vein.x * 0.27,
                speed: 1.1,
                spin: 0.04,
              },
              {
                amplitude: 0.008,
                baseY: innerRune.position.y,
                mesh: innerRune,
                phase: vein.y * 0.21,
                speed: 1.25,
                spin: -0.09,
              },
            ],
            node: veinRoot,
          };
        });
      }

      for (const vent of model.vents) {
        const role = assetRoleForVent(vent.id);
        const ventAsset = currentAssets[role];
        const ventContainer = containers.get(role);
        const ventAssetId =
          ventAsset !== undefined && ventContainer !== undefined
            ? ventAsset.id
            : "";
        const key = `vent:${vent.id}`;
        const visualSignature = `${vent.x},${vent.y},${vent.radius},${role},${ventAssetId}`;
        upsertEntry(key, visualSignature, () => {
          const entryRoot = new TransformNode(`vent-entry-${vent.id}`, scene);
          entryRoot.parent = decorationRoot;
          const worldZ = mapYToWorldZ(vent.y, model.map.height);
          entryRoot.position.set(vent.x, groundY(vent.x, vent.y), worldZ);
          const ring = CreateTorus(
            `vent-${vent.id}`,
            {
              diameter: vent.radius * 2,
              tessellation: 32,
              thickness: 0.12,
            },
            scene,
          );
          ring.parent = entryRoot;
          ring.position.y = 0.03;
          ring.material = ventMaterial;
          ring.visibility = 0.52;
          ring.isPickable = false;
          const ventRoot = new TransformNode(`vent-prop-${vent.id}`, scene);
          ventRoot.parent = entryRoot;
          ventRoot.rotation.y = (vent.x * 0.31 + vent.y * 0.17) % (Math.PI * 2);
          if (ventAsset !== undefined && ventContainer !== undefined) {
            instantiateDecorationProp(
              vent.id,
              ventAsset,
              ventContainer,
              ventRoot,
              Math.min(3.2, vent.radius * 1.35),
              role === "abyssSpire" ? 3.1 : 2.25,
            );
          } else {
            const flame = CreateCylinder(
              `vent-flame-${vent.id}`,
              {
                diameterBottom: vent.radius * 0.85,
                diameterTop: 0.15,
                height: 0.8,
                tessellation: 8,
              },
              scene,
            );
            flame.parent = ventRoot;
            flame.position.y = 0.36;
            flame.material = ventMaterial;
            flame.isPickable = false;
          }
          const emberCore = CreateSphere(
            `vent-ember-${vent.id}`,
            { diameter: 0.34, segments: 8 },
            scene,
          );
          emberCore.parent = ventRoot;
          emberCore.position.y = 0.48;
          emberCore.material = ventMaterial;
          emberCore.isPickable = false;
          return {
            motions: [
              {
                amplitude: 0.12,
                baseY: emberCore.position.y,
                mesh: emberCore,
                phase: vent.x + vent.y,
                speed: 3.1,
                spin: 0.35,
              },
            ],
            node: entryRoot,
          };
        });
      }

      for (const node of model.nodes) {
        const key = `node:${node.id}:${node.resource}`;
        const role =
          node.explorationCacheId === undefined
            ? assetRoleForResource(node.resource, node.id)
            : "explorerCache";
        const asset = currentAssets[role];
        const container = containers.get(role);
        const assetId =
          asset !== undefined && container !== undefined ? asset.id : "";
        const visualSignature = `${node.x},${node.y},${assetId}`;
        upsertEntry(key, visualSignature, () => {
          let nodeMaterial = nodeMaterials.get(node.resource);
          if (nodeMaterial === undefined) {
            const colors: Record<string, string> = {
              coin: "#e4bd58",
              essence: "#a56ee2",
              food: "#91b45d",
              iron: "#8a9aa5",
              spirit_herbs: "#d66ca3",
              stone: "#8d8175",
              water: "#5ba9c9",
              wood: "#765038",
            };
            nodeMaterial = material(
              scene,
              `node-${node.resource}`,
              colors[node.resource] ?? "#bbb19a",
              true,
            );
            nodeMaterial.freeze();
            nodeMaterials.set(node.resource, nodeMaterial);
          }
          const entryRoot = new TransformNode(`node-entry-${node.id}`, scene);
          entryRoot.parent = decorationRoot;
          const worldZ = mapYToWorldZ(node.y, model.map.height);
          entryRoot.position.set(node.x, groundY(node.x, node.y), worldZ);
          // A colored plate keeps the exact resource readable even when two
          // economy resources share one harvestable prop family.
          const plate = CreateCylinder(
            `node-plate-${node.id}`,
            { diameter: 2.1, height: 0.05, tessellation: 24 },
            scene,
          );
          plate.parent = entryRoot;
          plate.position.y = 0.01;
          plate.material = nodeMaterial;
          plate.visibility = 0.55;
          plate.isPickable = false;
          const resourceRoot = new TransformNode(`node-${node.id}`, scene);
          resourceRoot.parent = entryRoot;
          if (asset !== undefined && container !== undefined) {
            const cache = node.explorationCacheId !== undefined;
            instantiateDecorationProp(
              node.id,
              asset,
              container,
              resourceRoot,
              cache ? 1.65 : 2.35,
              cache ? 1.35 : 2.7,
            );
          } else {
            createResourceStandIn(role, resourceRoot, nodeMaterial);
          }
          return { motions: [], node: entryRoot };
        });
      }

      for (const camp of model.exploration?.camps ?? []) {
        // Guarded prizes become ordinary haulable nodes after combat.
        if (camp.cleared) continue;
        const key = `exploration-camp:${camp.id}`;
        const bossCamp = camp.id === "cinderjaw-hoard";
        const campAsset = bossCamp ? currentAssets.rimRuin : undefined;
        const campContainer = bossCamp ? containers.get("rimRuin") : undefined;
        const campAssetId =
          campAsset !== undefined && campContainer !== undefined
            ? campAsset.id
            : "";
        const visualSignature = `${camp.x},${camp.y},${camp.cleared},${campAssetId}`;
        upsertEntry(key, visualSignature, () => {
          const materialKey = camp.cleared
            ? "exploration-cleared"
            : "exploration-guarded";
          let campMaterial = nodeMaterials.get(materialKey);
          if (campMaterial === undefined) {
            campMaterial = material(
              scene,
              materialKey,
              camp.cleared ? "#73946b" : "#d4a74e",
              true,
            );
            campMaterial.freeze();
            nodeMaterials.set(materialKey, campMaterial);
          }
          const campRoot = new TransformNode(
            `exploration-camp-${camp.id}`,
            scene,
          );
          campRoot.parent = decorationRoot;
          campRoot.position.set(
            camp.x,
            groundY(camp.x, camp.y),
            mapYToWorldZ(camp.y, model.map.height),
          );
          const ring = CreateTorus(
            `exploration-camp-ring-${camp.id}`,
            { diameter: 5.2, tessellation: 36, thickness: 0.08 },
            scene,
          );
          ring.parent = campRoot;
          ring.position.y = 0.025;
          ring.material = campMaterial;
          ring.isPickable = false;
          if (campAsset !== undefined && campContainer !== undefined) {
            const ruinRoot = new TransformNode(
              `exploration-camp-ruin-${camp.id}`,
              scene,
            );
            ruinRoot.parent = campRoot;
            ruinRoot.position.z = -1.4;
            instantiateDecorationProp(
              camp.id,
              campAsset,
              campContainer,
              ruinRoot,
              3,
              3.8,
            );
          } else {
            const chest = CreateBox(
              `exploration-camp-chest-${camp.id}`,
              { depth: 0.9, height: 0.62, width: 1.35 },
              scene,
            );
            chest.parent = campRoot;
            chest.position.y = 0.34;
            chest.material = campMaterial;
            chest.isPickable = false;
            const lid = CreateBox(
              `exploration-camp-lid-${camp.id}`,
              { depth: 0.98, height: 0.22, width: 1.43 },
              scene,
            );
            lid.parent = campRoot;
            lid.position.y = 0.76;
            lid.material = campMaterial;
            lid.isPickable = false;
          }
          const beacon = CreateCylinder(
            `exploration-camp-beacon-${camp.id}`,
            {
              diameterBottom: 0.32,
              diameterTop: 0.08,
              height: camp.cleared ? 0.45 : 1.2,
              tessellation: 6,
            },
            scene,
          );
          beacon.parent = campRoot;
          beacon.position.set(0, camp.cleared ? 0.95 : 1.3, -0.8);
          beacon.material = campMaterial;
          beacon.isPickable = false;
          return {
            motions: camp.cleared
              ? []
              : [
                  {
                    amplitude: 0.025,
                    baseY: ring.position.y,
                    mesh: ring,
                    phase: camp.threat,
                    speed: 1.4,
                    spin: 0.12,
                  },
                ],
            node: campRoot,
          };
        });
      }

      for (const [key, entry] of decorationEntries) {
        if (activeKeys.has(key)) continue;
        removeShadowCasters(entry.node);
        entry.node.dispose();
        decorationEntries.delete(key);
        if (entry.motions.length > 0) motionsDirty = true;
      }

      if (motionsDirty) {
        decorationMotions.length = 0;
        for (const entry of decorationEntries.values()) {
          for (const motion of entry.motions) decorationMotions.push(motion);
        }
      }
    };

    /**
     * Rebuilds only the transient boss telegraph warning rings when they change,
     * leaving static map decorations untouched.
     * @param model - Latest shell model
     */
    const syncTelegraphs = (model: ShellModel): void => {
      let signature = "";
      for (const warning of model.telegraphs) {
        signature += `${warning.id}:${warning.x},${warning.y},${warning.radius};`;
      }
      if (signature === telegraphSignature) return;
      telegraphSignature = signature;
      telegraphRoot.dispose();
      telegraphMotions.length = 0;
      telegraphRoot = new TransformNode("map-telegraphs", scene);
      for (const warning of model.telegraphs) {
        const ring = CreateTorus(
          `telegraph-${warning.id}`,
          {
            diameter: warning.radius * 2,
            tessellation: 40,
            thickness: 0.1,
          },
          scene,
        );
        ring.parent = telegraphRoot;
        ring.position.set(
          warning.x,
          groundY(warning.x, warning.y) + 0.05,
          mapYToWorldZ(warning.y, model.map.height),
        );
        ring.material = telegraphMaterial;
        ring.isPickable = false;
        telegraphMotions.push({
          amplitude: 0.025,
          baseY: ring.position.y,
          mesh: ring,
          phase: warning.x + warning.y,
          speed: 2.8,
          spin: -0.2,
        });
      }
    };

    /**
     * Disposes one transient effect along with any animation groups or
     * skeletons instantiated for it from a model container.
     * @param effect - Transient effect to release
     */
    const disposeTransientEffect = (effect: TransientEffect): void => {
      if (effect.animationGroups !== undefined) {
        for (const group of effect.animationGroups) group.dispose();
      }
      if (effect.skeletons !== undefined) {
        for (const skeleton of effect.skeletons) skeleton.dispose();
      }
      effect.mesh.dispose();
    };

    /**
     * Appends a transient effect while enforcing the concurrent cap by
     * disposing the oldest effect first when full.
     * @param effect - New transient effect
     */
    const pushTransientEffect = (effect: TransientEffect): void => {
      while (transientEffects.length >= MAX_CONCURRENT_TRANSIENT_EFFECTS) {
        const oldest = transientEffects.shift();
        if (oldest !== undefined) disposeTransientEffect(oldest);
      }
      transientEffects.push(effect);
    };

    /**
     * Acknowledges a right-click with a ring that tightens onto the target and
     * fades, plus a small pin, so the player sees where units were sent.
     * @param marker - Order kind and map point
     */
    const showOrderMarker = (marker: OrderMarker): void => {
      const position = new Vector3(
        marker.point.x,
        0.06,
        mapYToWorldZ(marker.point.y, currentModel.map.height),
      );
      const ring = CreateTorus(
        "order-marker",
        { diameter: 1.3, tessellation: 32, thickness: 0.09 },
        scene,
      );
      ring.position.copyFrom(position);
      ring.material = markerMaterials[marker.kind];
      ring.isPickable = false;
      const pin = CreateCylinder(
        "order-marker-pin",
        { diameterBottom: 0, diameterTop: 0.32, height: 0.55, tessellation: 4 },
        scene,
      );
      pin.parent = ring;
      pin.position.y = 0.55;
      pin.material = ring.material;
      pin.isPickable = false;
      pushTransientEffect({
        duration: reducedMotion ? 500 : 900,
        from: position.clone(),
        kind: "marker",
        mesh: ring,
        startedAt: presentationNow,
        to: position.clone(),
      });
    };

    /** Returns the closest visible unit to one published map position. */
    const closestUnit = (point: {
      x: number;
      y: number;
    }): EntityVisual | null => {
      let closest: EntityVisual | null = null;
      let closestDistance = 2.25;
      const worldZ = mapYToWorldZ(point.y, currentModel.map.height);
      for (const visual of entities.values()) {
        if (visual.kind !== "unit" || visual.removeAt !== null) continue;
        const distance = Math.hypot(
          visual.root.position.x - point.x,
          visual.root.position.z - worldZ,
        );
        if (distance >= closestDistance) continue;
        closest = visual;
        closestDistance = distance;
      }
      return closest;
    };

    /**
     * Instantiates the generated Ember Bolt prop for a ranged projectile,
     * orienting its longest axis along +Z so `lookAt` points it downrange.
     * Falls back to `null` when the model is not loaded yet.
     * @param effectId - Unique sim FX id
     * @returns Instantiated projectile root and owned animations/skeletons, or null
     */
    const createEmberBoltNode = (
      effectId: number,
    ): {
      animationGroups: AnimationGroup[];
      node: TransformNode;
      skeletons: Skeleton[];
    } | null => {
      const container = containers.get("emberBolt");
      const asset = currentAssets.emberBolt;
      if (container === undefined || asset === undefined) return null;
      const root = new TransformNode(`fx-bolt-${effectId}`, scene);
      const instance = container.instantiateModelsToScene(
        (name) => `fx-bolt-${effectId}-${name}`,
        false,
      );
      const modelRoot = new TransformNode(`fx-bolt-model-${effectId}`, scene);
      modelRoot.parent = root;
      for (const node of instance.rootNodes) node.parent = modelRoot;
      const { min, max } = asset.validation.bounds;
      const width = Math.max(0.01, (max[0] ?? 1) - (min[0] ?? 0));
      const height = Math.max(0.01, (max[1] ?? 1) - (min[1] ?? 0));
      const depth = Math.max(0.01, (max[2] ?? 1) - (min[2] ?? 0));
      const longest = Math.max(width, height, depth);
      const scale = 1.15 / longest;
      modelRoot.scaling.setAll(scale);
      const centerX = ((min[0] ?? 0) + (max[0] ?? 0)) / 2;
      const centerY = ((min[1] ?? 0) + (max[1] ?? 0)) / 2;
      const centerZ = ((min[2] ?? 0) + (max[2] ?? 0)) / 2;
      modelRoot.position.set(
        -centerX * scale,
        -centerY * scale,
        -centerZ * scale,
      );
      // Align the bolt's longest dimension along +Z for `lookAt`.
      if (width >= height && width >= depth) {
        modelRoot.rotation.y = Math.PI / 2;
      } else if (height >= width && height >= depth) {
        modelRoot.rotation.x = Math.PI / 2;
      }
      for (const child of root.getChildMeshes()) {
        child.isPickable = false;
      }
      const glow = CreateSphere(
        `fx-bolt-glow-${effectId}`,
        { diameter: 0.22, segments: 8 },
        scene,
      );
      glow.parent = root;
      glow.material = projectileMaterial;
      glow.isPickable = false;
      return {
        animationGroups: instance.animationGroups,
        node: root,
        skeletons: instance.skeletons,
      };
    };

    /**
     * Instantiates a generated Qi combat prop (`qiSword` or `qiLotus`) normalized
     * to `targetSize`, optionally aligning its longest axis along +Z.
     * @param role - Generated prop role (`qiSword` or `qiLotus`)
     * @param namePrefix - Unique mesh prefix
     * @param targetSize - Longest dimension in world units
     * @param alignLongAxisToZ - True for flying swords so `lookAt` points tip-first
     * @returns Normalized root node with owned animations/skeletons, or null
     */
    const createQiPropNode = (
      role: "qiSword" | "qiLotus",
      namePrefix: string,
      targetSize: number,
      alignLongAxisToZ: boolean,
    ): {
      animationGroups: AnimationGroup[];
      node: TransformNode;
      skeletons: Skeleton[];
    } | null => {
      const container = containers.get(role);
      const asset = currentAssets[role];
      if (container === undefined || asset === undefined) return null;
      const root = new TransformNode(namePrefix, scene);
      const instance = container.instantiateModelsToScene(
        (name) => `${namePrefix}-${name}`,
        false,
      );
      const modelRoot = new TransformNode(`${namePrefix}-model`, scene);
      modelRoot.parent = root;
      for (const node of instance.rootNodes) node.parent = modelRoot;
      const { min, max } = asset.validation.bounds;
      const width = Math.max(0.01, (max[0] ?? 1) - (min[0] ?? 0));
      const height = Math.max(0.01, (max[1] ?? 1) - (min[1] ?? 0));
      const depth = Math.max(0.01, (max[2] ?? 1) - (min[2] ?? 0));
      const longest = Math.max(width, height, depth);
      const scale = targetSize / longest;
      modelRoot.scaling.setAll(scale);
      const centerX = ((min[0] ?? 0) + (max[0] ?? 0)) / 2;
      const centerY = ((min[1] ?? 0) + (max[1] ?? 0)) / 2;
      const centerZ = ((min[2] ?? 0) + (max[2] ?? 0)) / 2;
      modelRoot.position.set(
        -centerX * scale,
        -centerY * scale,
        -centerZ * scale,
      );
      if (alignLongAxisToZ) {
        if (width >= height && width >= depth) {
          modelRoot.rotation.y = Math.PI / 2;
        } else if (height >= width && height >= depth) {
          modelRoot.rotation.x = Math.PI / 2;
        }
      }
      for (const child of root.getChildMeshes()) {
        child.isPickable = false;
      }
      return {
        animationGroups: instance.animationGroups,
        node: root,
        skeletons: instance.skeletons,
      };
    };

    /**
     * Picks the emissive material matching a Qi Art school.
     * @param school - Cultivator school id, if chosen
     * @returns Scene material for the school's Qi aura
     */
    const qiSchoolMaterial = (school?: string): StandardMaterial => {
      if (school === "ember" || school === "blood") return ventMaterial;
      if (school === "rime") return veinMaterial;
      return healMaterial;
    };

    /**
     * Builds a procedural glowing flying-sword stand-in when the Meshy
     * `qiSword` asset is still loading or unavailable.
     * @param namePrefix - Unique mesh prefix
     * @param mat - School aura material
     * @returns Sleek blade node oriented along +Z
     */
    const createFallbackQiSword = (
      namePrefix: string,
      mat: StandardMaterial,
    ): TransformNode => {
      const root = new TransformNode(namePrefix, scene);
      const blade = CreateBox(
        `${namePrefix}-blade`,
        { depth: 1.05, height: 0.06, width: 0.16 },
        scene,
      );
      blade.parent = root;
      blade.material = mat;
      blade.isPickable = false;
      const guard = CreateBox(
        `${namePrefix}-guard`,
        { depth: 0.08, height: 0.09, width: 0.34 },
        scene,
      );
      guard.parent = root;
      guard.position.z = -0.32;
      guard.material = telegraphMaterial;
      guard.isPickable = false;
      return root;
    };

    /** Creates short-lived animated combat feedback from resolved sim FX. */
    const syncEffects = (model: ShellModel): void => {
      for (const effect of model.fx) {
        if (seenEffects.has(effect.id)) continue;
        seenEffects.add(effect.id);
        const now = presentationNow;
        let mesh: TransformNode;
        if (
          effect.kind === "projectile" ||
          effect.kind === "melee" ||
          effect.kind === "heal"
        ) {
          const magicProjectile =
            effect.kind === "projectile" && effect.sound === "magic";
          const qiSword = magicProjectile
            ? createQiPropNode(
                "qiSword",
                `fx-qi-sword-${effect.id}`,
                1.35,
                true,
              )
            : null;
          const bolt =
            qiSword ??
            (effect.kind === "projectile"
              ? createEmberBoltNode(effect.id)
              : null);
          if (bolt !== null) {
            if (qiSword !== null) {
              const aura = CreateSphere(
                `fx-qi-sword-aura-${effect.id}`,
                { diameter: 0.28, segments: 8 },
                scene,
              );
              aura.parent = qiSword.node;
              aura.material = healMaterial;
              aura.isPickable = false;
            }
            mesh = bolt.node;
          } else {
            const sphere = CreateSphere(
              `fx-${effect.id}`,
              {
                diameter: effect.kind === "melee" ? 0.38 : 0.26,
                segments: 8,
              },
              scene,
            );
            sphere.material =
              effect.kind === "heal" ? healMaterial : projectileMaterial;
            sphere.isPickable = false;
            mesh = sphere;
          }
          const from = new Vector3(
            effect.from.x,
            groundY(effect.from.x, effect.from.y) + 0.62,
            mapYToWorldZ(effect.from.y, model.map.height),
          );
          const to = new Vector3(
            effect.to.x,
            groundY(effect.to.x, effect.to.y) + 0.62,
            mapYToWorldZ(effect.to.y, model.map.height),
          );
          mesh.position.copyFrom(from);
          if (bolt !== null) mesh.lookAt(to);
          pushTransientEffect({
            animationGroups: bolt?.animationGroups,
            duration: effect.kind === "melee" ? 180 : 340,
            from,
            kind: "travel",
            mesh,
            orientAlongFlight: bolt !== null,
            skeletons: bolt?.skeletons,
            startedAt: now,
            to,
          });
          const source = closestUnit(effect.from);
          if (source !== null && effect.kind !== "heal") {
            playAction(source, "attack", 420, presentationNow);
          }
          const target = closestUnit(effect.to);
          if (target !== null && effect.kind !== "heal") {
            playAction(target, "hit", 280, presentationNow);
          }
        } else if (effect.kind === "qi_nova") {
          const centerPos = new Vector3(
            effect.x,
            groundY(effect.x, effect.y) + 0.22,
            mapYToWorldZ(effect.y, model.map.height),
          );
          const root = new TransformNode(`fx-qi-nova-${effect.id}`, scene);
          root.position.copyFrom(centerPos);
          const schoolMat = qiSchoolMaterial(effect.school);
          const burstRadius = Math.max(2.2, effect.radius * 0.95);
          const effectAnimationGroups: AnimationGroup[] = [];
          const effectSkeletons: Skeleton[] = [];

          // 1. Center blooming Spirit Lotus (Meshy prop or procedural petals)
          const lotus = createQiPropNode(
            "qiLotus",
            `fx-qi-lotus-${effect.id}`,
            1.65,
            false,
          );
          const lotusRoot = new TransformNode(
            `fx-qi-lotus-wrap-${effect.id}`,
            scene,
          );
          lotusRoot.parent = root;
          if (lotus !== null) {
            lotus.node.parent = lotusRoot;
            effectAnimationGroups.push(...lotus.animationGroups);
            effectSkeletons.push(...lotus.skeletons);
          } else {
            for (let petalIndex = 0; petalIndex < 6; petalIndex += 1) {
              const angle = (petalIndex / 6) * Math.PI * 2;
              const petal = CreateBox(
                `fx-qi-petal-${effect.id}-${petalIndex}`,
                { depth: 0.52, height: 0.12, width: 0.22 },
                scene,
              );
              petal.parent = lotusRoot;
              petal.position.set(
                Math.sin(angle) * 0.35,
                0,
                Math.cos(angle) * 0.35,
              );
              petal.rotation.y = angle;
              petal.rotation.x = -0.35;
              petal.material = schoolMat;
              petal.isPickable = false;
            }
          }
          lotusRoot.scaling.setAll(0.25);

          // 2. Dual shockwave rings (outer school ring + inner golden ring)
          const outerRing = CreateTorus(
            `fx-qi-outer-${effect.id}`,
            {
              diameter: Math.max(2.4, effect.radius * 1.15),
              tessellation: 32,
              thickness: 0.16,
            },
            scene,
          );
          outerRing.parent = root;
          outerRing.material = schoolMat;
          outerRing.scaling.setAll(0.18);
          outerRing.isPickable = false;

          const innerRing = CreateTorus(
            `fx-qi-inner-${effect.id}`,
            {
              diameter: Math.max(1.5, effect.radius * 0.72),
              tessellation: 24,
              thickness: 0.11,
            },
            scene,
          );
          innerRing.parent = root;
          innerRing.position.y = 0.25;
          innerRing.material = telegraphMaterial;
          innerRing.scaling.setAll(0.12);
          innerRing.isPickable = false;

          // 3. Six flying swords spiraling outward in a radial volley
          const swordCount = 6;
          const swords: { angle: number; node: TransformNode }[] = [];
          for (let i = 0; i < swordCount; i += 1) {
            const angle = (i / swordCount) * Math.PI * 2;
            const swordProp = createQiPropNode(
              "qiSword",
              `fx-qi-volley-${effect.id}-${i}`,
              1.2,
              true,
            );
            if (swordProp !== null) {
              effectAnimationGroups.push(...swordProp.animationGroups);
              effectSkeletons.push(...swordProp.skeletons);
            }
            const swordNode =
              swordProp?.node ??
              createFallbackQiSword(
                `fx-qi-volley-${effect.id}-${i}`,
                schoolMat,
              );
            swordNode.parent = root;
            swordNode.position.set(
              Math.sin(angle) * 0.45,
              0.55,
              Math.cos(angle) * 0.45,
            );
            swordNode.rotation.y = angle;
            swords.push({ angle, node: swordNode });
          }

          // 4. Six rising Qi motes spiraling around the caster
          const motes: { angle: number; node: AbstractMesh }[] = [];
          for (let i = 0; i < 6; i += 1) {
            const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
            const mote = CreateSphere(
              `fx-qi-mote-${effect.id}-${i}`,
              { diameter: 0.22, segments: 8 },
              scene,
            );
            mote.parent = root;
            mote.material = i % 2 === 0 ? schoolMat : telegraphMaterial;
            mote.isPickable = false;
            motes.push({ angle, node: mote });
          }

          mesh = root;
          pushTransientEffect({
            animationGroups: effectAnimationGroups,
            duration: 900,
            from: centerPos.clone(),
            kind: "qi_nova",
            mesh: root,
            onUpdate: (progress, deltaMs) => {
              const easeOut = 1 - (1 - progress) ** 3;
              // Lotus rises, blooms, and spins
              lotusRoot.position.y = 0.08 + easeOut * 0.95;
              lotusRoot.scaling.setAll(0.28 + easeOut * 1.35);
              lotusRoot.rotation.y += (deltaMs / 1000) * 5.2;

              // Rings expand and spin
              outerRing.scaling.setAll(0.2 + easeOut * 1.35);
              outerRing.rotation.y += deltaMs / 240;
              innerRing.scaling.setAll(0.15 + progress * 1.75);
              innerRing.position.y = 0.22 + Math.sin(progress * Math.PI) * 0.55;

              // Flying swords spiral outward, arc up, and bank
              for (const sword of swords) {
                const spiralAngle = sword.angle + progress * 1.45;
                const dist = 0.45 + easeOut * burstRadius;
                sword.node.position.set(
                  Math.sin(spiralAngle) * dist,
                  0.55 + Math.sin(progress * Math.PI) * 1.15,
                  Math.cos(spiralAngle) * dist,
                );
                sword.node.rotation.y = spiralAngle + 0.35;
                sword.node.rotation.z = progress * Math.PI * 2;
                const sScale =
                  progress > 0.78 ? Math.max(0.05, (1 - progress) / 0.22) : 1;
                sword.node.scaling.setAll(sScale);
              }

              // Motes spiral upward
              for (const mote of motes) {
                const moteAngle = mote.angle - progress * 3.4;
                const moteDist = 0.6 + progress * (burstRadius * 0.55);
                mote.node.position.set(
                  Math.sin(moteAngle) * moteDist,
                  0.2 + progress * 2.1,
                  Math.cos(moteAngle) * moteDist,
                );
                const mScale = Math.max(0.05, 1 - progress * 0.85);
                mote.node.scaling.setAll(mScale);
              }

              // Fade out near the end of the burst
              const alpha =
                progress > 0.7 ? Math.max(0, (1 - progress) / 0.3) : 1;
              for (const child of root.getChildMeshes()) {
                child.visibility = alpha;
              }
            },
            skeletons: effectSkeletons,
            startedAt: now,
            to: centerPos.clone(),
          });
          const caster = closestUnit({ x: effect.x, y: effect.y });
          if (caster !== null) {
            playAction(caster, "attack", 520, presentationNow);
          }
        } else {
          const ring = CreateTorus(
            `fx-${effect.id}`,
            {
              diameter: effect.kind === "damage" ? 0.8 : 1.6,
              tessellation: 20,
              thickness: 0.09,
            },
            scene,
          );
          const x = "x" in effect ? effect.x : 0;
          const y = "y" in effect ? effect.y : 0;
          ring.position.set(
            x,
            groundY(x, y) + 0.12,
            mapYToWorldZ(y, model.map.height),
          );
          ring.material =
            effect.kind === "damage" ? ventMaterial : telegraphMaterial;
          ring.scaling.setAll(0.25);
          ring.isPickable = false;
          mesh = ring;
          pushTransientEffect({
            duration: effect.kind === "death" ? 620 : 440,
            from: ring.position.clone(),
            kind: "pulse",
            mesh: ring,
            startedAt: now,
            to: ring.position.clone(),
          });
          const target = closestUnit({ x, y });
          if (target !== null) {
            if (effect.kind === "death") {
              playAction(target, "death", 580, presentationNow);
            } else if (effect.kind === "damage") {
              playAction(target, "hit", 280, presentationNow);
            }
          }
        }
      }
      if (seenEffects.size > MAX_SEEN_EFFECTS) {
        seenEffects.clear();
        for (const effect of model.fx) seenEffects.add(effect.id);
      }
    };

    /** Keeps the camera focus point inside the current map bounds. */
    const clampCameraTarget = (): void => {
      desiredCameraTarget.x = Math.max(
        0,
        Math.min(currentModel.map.width, desiredCameraTarget.x),
      );
      desiredCameraTarget.y = 0;
      desiredCameraTarget.z = Math.max(
        0,
        Math.min(currentModel.map.height, desiredCameraTarget.z),
      );
    };

    /**
     * Recenters the RTS camera from a minimap click.
     * @param point - Desired map-space focus
     */
    const focusCamera = (point: MapPoint): void => {
      desiredCameraTarget.set(
        point.x,
        0,
        mapYToWorldZ(point.y, currentModel.map.height),
      );
      clampCameraTarget();
    };

    let lastPublishedCameraView: MinimapView | null = null;
    const CAMERA_VIEW_EPSILON = 0.01;

    /**
     * Intersects one viewport corner ray with the y = 0 ground plane.
     * @param x - Canvas-relative CSS pixel x
     * @param y - Canvas-relative CSS pixel y
     * @returns World-space hit on y = 0, or null when the ray is parallel or points away
     */
    const groundCornerHit = (x: number, y: number): Vector3 | null => {
      const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
      const distance = ray.intersectsPlane(groundPlane);
      if (distance === null || distance <= 0) return null;
      return ray.origin.add(ray.direction.scale(distance));
    };

    /**
     * Publishes the ground-plane camera frustum footprint for the strategic
     * minimap when the camera view has meaningfully changed, falling back to
     * the radius heuristic if any corner ray is parallel to the ground.
     * @param now - Current animation timestamp
     */
    const publishCameraView = (now: number): void => {
      if (now - lastCameraViewAt < 100) return;
      lastCameraViewAt = now;
      const canvasWidth = Math.max(1, canvas.clientWidth);
      const canvasHeight = Math.max(1, canvas.clientHeight);
      const rotation = cameraAlphaToMinimapRotation(camera.alpha);
      const topLeft = groundCornerHit(0, 0);
      const topRight = groundCornerHit(canvasWidth, 0);
      const bottomRight = groundCornerHit(canvasWidth, canvasHeight);
      const bottomLeft = groundCornerHit(0, canvasHeight);

      let nextView: MinimapView;
      if (
        topLeft !== null &&
        topRight !== null &&
        bottomRight !== null &&
        bottomLeft !== null
      ) {
        const centerWorldX =
          (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
        const centerWorldZ =
          (topLeft.z + topRight.z + bottomRight.z + bottomLeft.z) / 4;
        const topWidth = Math.hypot(
          topRight.x - topLeft.x,
          topRight.z - topLeft.z,
        );
        const bottomWidth = Math.hypot(
          bottomRight.x - bottomLeft.x,
          bottomRight.z - bottomLeft.z,
        );
        const topMidX = (topLeft.x + topRight.x) / 2;
        const topMidZ = (topLeft.z + topRight.z) / 2;
        const bottomMidX = (bottomLeft.x + bottomRight.x) / 2;
        const bottomMidZ = (bottomLeft.z + bottomRight.z) / 2;
        const frustumWidth = (topWidth + bottomWidth) / 2;
        const frustumHeight = Math.hypot(
          topMidX - bottomMidX,
          topMidZ - bottomMidZ,
        );
        nextView = {
          centerX: centerWorldX,
          centerY: worldZToMapY(centerWorldZ, currentModel.map.height),
          height: Math.min(currentModel.map.height, frustumHeight),
          rotation,
          width: Math.min(currentModel.map.width, frustumWidth),
        };
      } else {
        const aspect = Math.max(0.5, Math.min(3, canvasWidth / canvasHeight));
        const footprint = camera.radius * 1.3;
        nextView = {
          centerX: camera.target.x,
          centerY: worldZToMapY(camera.target.z, currentModel.map.height),
          height: Math.min(currentModel.map.height, footprint),
          rotation,
          width: Math.min(currentModel.map.width, footprint * aspect),
        };
      }
      if (
        lastPublishedCameraView !== null &&
        Math.abs(nextView.centerX - lastPublishedCameraView.centerX) <=
          CAMERA_VIEW_EPSILON &&
        Math.abs(nextView.centerY - lastPublishedCameraView.centerY) <=
          CAMERA_VIEW_EPSILON &&
        Math.abs(nextView.width - lastPublishedCameraView.width) <=
          CAMERA_VIEW_EPSILON &&
        Math.abs(nextView.height - lastPublishedCameraView.height) <=
          CAMERA_VIEW_EPSILON &&
        Math.abs(nextView.rotation - lastPublishedCameraView.rotation) <=
          CAMERA_VIEW_EPSILON
      ) {
        return;
      }
      lastPublishedCameraView = nextView;
      onCameraView(nextView);
    };

    /**
     * Returns whether edge scrolling is currently enabled (fullscreen by
     * default, or explicitly overridden in scene options).
     * @returns True when edge scrolling may pan the camera
     */
    const isEdgeScrollEnabled = (): boolean => {
      if (options?.edgeScrollEnabled !== undefined) {
        return options.edgeScrollEnabled;
      }
      return (
        typeof document !== "undefined" && document.fullscreenElement !== null
      );
    };

    /**
     * Moves the camera focus and heading from the held keys. Panning speed
     * scales with zoom so the screen moves at a steady rate.
     * @param deltaMs - Elapsed frame time in milliseconds
     */
    const applyCameraKeys = (deltaMs: number): void => {
      const seconds = deltaMs / 1000;
      desiredCameraAlpha += cameraRotationInput(cameraKeys) * 1.9 * seconds;
      const keyDirection = cameraPanDirection(cameraKeys, camera.alpha);
      let direction = keyDirection;
      // Keyboard panning wins; the screen edge pans only when no key is held,
      // edge scrolling is active, and the pointer sits inside the cached
      // canvas rect's 24px edge band.
      if (
        keyDirection.x === 0 &&
        keyDirection.z === 0 &&
        isEdgeScrollEnabled() &&
        isPointerInEdgeScrollBand(edgeScrollPointer, canvasRect)
      ) {
        direction = edgeScrollPanDirection(
          edgeScrollPointer,
          canvasRect,
          camera.alpha,
          {
            isPointerOverHud: (position) =>
              document.elementFromPoint(position.x, position.y) !== canvas,
          },
        );
      }
      if (direction.x === 0 && direction.z === 0) return;
      const speed = camera.radius * 0.95;
      desiredCameraTarget.x += direction.x * speed * seconds;
      desiredCameraTarget.z += direction.z * speed * seconds;
      clampCameraTarget();
    };

    /**
     * Starts gliding a unit toward a new sim position. Each glide lasts the
     * expected gap until the sim's next step, so a chain of cell hops reads as
     * one steady walk instead of dash-and-stop.
     * @param visual - Unit visual
     * @param x - New map x
     * @param y - New top-origin map y
     */
    const beginStep = (visual: EntityVisual, x: number, y: number): void => {
      const targetZ = mapYToWorldZ(y, currentModel.map.height);
      const dx = x - visual.root.position.x;
      const dz = targetZ - visual.root.position.z;
      if (Math.hypot(visual.target.x - x, visual.target.z - targetZ) <= 0.01)
        return;
      const now = presentationNow;
      visual.stepInterval = estimateStepInterval(
        visual.stepInterval,
        now - visual.lastStepAt,
      );
      visual.lastStepAt = now;
      visual.target.set(x, groundY(x, y), targetZ);
      visual.stepFrom.copyFrom(visual.root.position);
      visual.stepStartedAt = now;
      const teleported = Math.hypot(dx, dz) > TELEPORT_DISTANCE;
      visual.stepDuration =
        reducedMotion || teleported ? 0 : visual.stepInterval;
      if (Math.hypot(dx, dz) > 0.01) visual.facing = Math.atan2(dx, dz);
    };

    /**
     * Hides rim and abyss scenery whose nearest map edge is still unseen,
     * since tall props would otherwise stand above the flat fog sheet.
     * @param model - Latest shell model
     */
    const syncSceneryFog = (model: ShellModel): void => {
      const cells = model.fog?.cells ?? null;
      if (cells === revealedSceneryCells) return;
      revealedSceneryCells = cells;
      revealedScenery = revealedSceneryIds(
        model.fog,
        backdrop.placements,
        model.map.height,
      );
      backdrop.revealStandIns(revealedScenery);
      for (const [id, node] of sceneryNodes) {
        node.setEnabled(revealedScenery.has(id));
      }
    };

    /**
     * Plants one waypoint flag: a dark pole, a pennant in the order color,
     * and a ring on the ground.
     * @param flag - Flag to draw
     * @param parent - Node that owns this set of flags
     */
    const plantRouteFlag = (flag: RouteFlag, parent: TransformNode): void => {
      const color = markerMaterials[flag.attack ? "attack" : "move"];
      const root = new TransformNode(`route-flag-${flag.order}`, scene);
      root.parent = parent;
      root.position.set(
        flag.x,
        groundY(flag.x, flag.y),
        mapYToWorldZ(flag.y, currentModel.map.height),
      );
      const pole = CreateCylinder(
        "route-flag-pole",
        { diameter: 0.06, height: 1.5, tessellation: 6 },
        scene,
      );
      pole.parent = root;
      pole.position.y = 0.75;
      pole.material = holdDarkMaterial;
      const pennant = CreateDisc(
        "route-flag-pennant",
        { radius: 0.32, sideOrientation: Mesh.DOUBLESIDE, tessellation: 3 },
        scene,
      );
      pennant.parent = root;
      pennant.position.set(0.24, 1.3, 0);
      pennant.material = color;
      const ring = CreateTorus(
        "route-flag-ring",
        { diameter: 0.7, tessellation: 24, thickness: 0.05 },
        scene,
      );
      ring.parent = root;
      ring.position.y = 0.05;
      ring.material = color;
      for (const mesh of root.getChildMeshes()) mesh.isPickable = false;
    };

    /**
     * Shows where the selected Hold units are headed: a flag per click and a
     * dashed line from the group through each one. Hidden with no selection.
     * @param model - Latest shell model
     * @param selection - Current selection
     */
    const syncRoute = (model: ShellModel, selection: Selection): void => {
      const selected = new Set(selection.unitIds);
      const plan = routePlan(
        model.units.filter(
          (unit) => selected.has(unit.id) && unit.factionId === "hold",
        ),
      );
      const flagSignature = plan.flags
        .map(
          (flag) =>
            `${flag.attack ? "a" : "m"}${flag.x.toFixed(1)},${flag.y.toFixed(1)}`,
        )
        .join("|");
      if (flagSignature !== routeFlagSignature) {
        routeFlagSignature = flagSignature;
        routeFlagRoot?.dispose();
        routeFlagRoot = null;
        if (plan.flags.length > 0) {
          routeFlagRoot = new TransformNode("unit-route-flags", scene);
          routeFlagRoot.parent = routeRoot;
          for (const flag of plan.flags) plantRouteFlag(flag, routeFlagRoot);
        }
      }
      const lineSignature =
        plan.flags.length === 0
          ? ""
          : plan.path
              .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
              .join("|");
      if (lineSignature === routeLineSignature) return;
      routeLineSignature = lineSignature;
      if (routeLine !== null) {
        glow.removeExcludedMesh(routeLine);
        routeLine.dispose();
        routeLine = null;
      }
      if (lineSignature === "") return;
      const points = plan.path.map(
        (point) =>
          new Vector3(point.x, 0.09, mapYToWorldZ(point.y, model.map.height)),
      );
      let length = 0;
      for (let index = 1; index < points.length; index += 1) {
        length += Vector3.Distance(
          points[index - 1] as Vector3,
          points[index] as Vector3,
        );
      }
      const line = CreateDashedLines(
        "unit-route-line",
        {
          dashNb: Math.max(4, Math.round(length * 1.6)),
          dashSize: 3,
          gapSize: 2,
          points,
        },
        scene,
      );
      line.color = Color3.FromHexString(
        plan.flags.some((flag) => flag.attack) ? "#ff7a5c" : "#9dffb4",
      );
      line.alpha = 0.75;
      line.isPickable = false;
      line.parent = routeRoot;
      glow.addExcludedMesh(line);
      routeLine = line;
    };

    /** Synchronizes entity presentation to the latest immutable sim snapshot. */
    const update = (
      model: ShellModel,
      selection: Selection,
      placing: boolean,
      placement?: {
        footprint: number;
        point: MapPoint | null;
        valid: boolean | null;
      },
    ): void => {
      currentModel = model;
      syncHills(model);
      setPresentationPaused(model.paused);
      fogOverlay.update(model.fog);
      syncSceneryFog(model);
      if (!placing) {
        setPlacementPoint(null);
        setPlacementLine(null);
      }
      // Re-evaluate the ghost every model tick: the camera can scroll the map
      // under a stationary pointer, and queued placements change the ground.
      if (placing && placement !== undefined) {
        setPlacementPoint(
          placement.point,
          placement.footprint,
          placement.valid,
        );
      }
      const selectedUnitIds = new Set(selection.unitIds);
      const live = new Set<string>();
      for (const unit of model.units) {
        live.add(unit.id);
        let visual = entities.get(unit.id);
        const role = assetRoleForUnit(unit);
        if (visual !== undefined && visual.role !== role) {
          disposeEntityVisual(visual);
          entities.delete(unit.id);
          visual = undefined;
        }
        if (visual === undefined) {
          visual = createEntity(unit, "unit");
          entities.set(unit.id, visual);
        }
        visual.removeAt = null;
        visual.activity = unit.activity ?? undefined;
        visual.meditating = unit.meditating === true;
        visual.channelProgress = unit.breakthroughProgress;
        const channeling = unit.breakthroughProgress !== null;
        if (channeling) ensureChannelBars(visual);
        visual.channelTrack?.setEnabled(channeling);
        visual.channelFill?.setEnabled(channeling);
        beginStep(visual, unit.x, unit.y);
        visual.targetScale.setAll(unitDisplayScale(unit));
        visual.targetPresentationScale.setAll(1);
        const isSelected = selectedUnitIds.has(unit.id);
        visual.selection.setEnabled(isSelected);
        setVisualOutline(visual, isSelected || visual.role === "cinderjaw");
        updateHealth(visual, unit.hitPoints, unit.maxHitPoints);
        carryIcons.sync(unit.id, visual.root, unit.carrying?.resource ?? null);
      }
      for (const building of model.buildings) {
        live.add(building.id);
        let visual = entities.get(building.id);
        const role = roleForBuilding(building);
        if (visual !== undefined && visual.role !== role) {
          disposeEntityVisual(visual);
          entities.delete(building.id);
          visual = undefined;
        }
        if (visual === undefined) {
          visual = createEntity(building, "building");
          entities.set(building.id, visual);
        }
        visual.removeAt = null;
        visual.root.position.set(
          building.x,
          groundY(building.x, building.y),
          mapYToWorldZ(building.y, model.map.height),
        );
        visual.target.copyFrom(visual.root.position);
        const isSelected = selection.buildingId === building.id;
        visual.selection.setEnabled(isSelected);
        setVisualOutline(visual, isSelected);
        visual.targetScale.setAll(1);
        // Buildings rise out of their foundations as construction advances.
        visual.targetPresentationScale.set(
          1,
          building.constructing
            ? buildProgressScale(building.activityProgress ?? 0)
            : 1,
          1,
        );
        if (building.constructing) {
          if (visual.construction === null) {
            const frame = createConstructionFrame(building.id, visual.root);
            frame.scaling.setAll(visual.span / BUILDING_REFERENCE_SPAN);
            visual.construction = frame;
          }
          visual.construction.setEnabled(true);
        } else {
          disposeConstructionFrame(visual);
        }
        updateHealth(visual, building.hitPoints, building.maxHitPoints);
      }
      const selectedBuilding = model.buildings.find(
        (building) => building.id === selection.buildingId,
      );
      if (
        selectedBuilding === undefined ||
        selectedBuilding.rallyPoint === null
      ) {
        rallyMarker.setEnabled(false);
      } else {
        rallyMarker.position.set(
          selectedBuilding.rallyPoint.x,
          groundY(selectedBuilding.rallyPoint.x, selectedBuilding.rallyPoint.y),
          mapYToWorldZ(selectedBuilding.rallyPoint.y, model.map.height),
        );
        rallyMarker.setEnabled(true);
      }
      for (const visual of entities.values()) {
        if (live.has(visual.id)) continue;
        if (visual.removeAt !== null) continue;
        // A horde body that walked out of sight is gone, not dead: drop it
        // at once instead of playing a death.
        const lostInFog =
          visual.factionId === "horde" &&
          !isFogVisible(model.fog, {
            x: visual.target.x,
            y: worldZToMapY(visual.target.z, model.map.height),
          });
        // Corpses must not intercept picks or stay in the shadow map.
        for (const mesh of visual.root.getChildMeshes()) {
          mesh.isPickable = false;
          shadows.removeShadowCaster(mesh);
        }
        setVisualOutline(visual, false);
        // A body lingers briefly on the field, then clears away.
        // Destroyed buildings clear quickly instead of standing as ghosts.
        const lingerMs = visual.kind === "unit" ? 2500 : 700;
        visual.removeAt =
          presentationNow + (reducedMotion || lostInFog ? 0 : lingerMs);
        visual.target.copyFrom(visual.root.position);
        visual.stepFrom.copyFrom(visual.root.position);
        visual.health?.setEnabled(false);
        visual.selection.setEnabled(false);
        disposeConstructionFrame(visual);
        carryIcons.remove(visual.id);
        if (visual.kind === "building") {
          visual.targetScale.set(1.02, 0.06, 1.02);
        }
        if (visual.kind === "unit") {
          for (const animation of visual.animations) animation.stop();
          visual.currentClip = "";
          if (!lostInFog) {
            playAction(visual, "death", 520, presentationNow);
            if (!reducedMotion) {
              // Lie the body down and let it sink into the ash before removal.
              visual.targetPresentationScale.setAll(0.9);
              visual.presentation.rotation.x = -Math.PI / 2.2;
            }
          }
        }
      }
      clampCameraTarget();
      syncDecorations(model);
      syncTelegraphs(model);
      syncEffects(model);
      syncRoute(model, selection);
    };

    scene.onBeforeRenderObservable.add(() => {
      const deltaMs = Math.min(50, engine.getDeltaTime());
      const cameraBlend = reducedMotion ? 1 : motionBlend(deltaMs, 155);
      if (decorationAssetsDirty) {
        syncDecorations(currentModel);
        decorationAssetsDirty = false;
      }
      applyCameraKeys(deltaMs);
      camera.alpha = smoothAngle(camera.alpha, desiredCameraAlpha, cameraBlend);
      Vector3.LerpToRef(
        smoothedCameraTarget,
        desiredCameraTarget,
        cameraBlend,
        smoothedCameraTarget,
      );
      camera.setTarget(smoothedCameraTarget);
      syncOutlineWidth();
      publishCameraView(performance.now());
      fogOverlay.render(performance.now());
      setPresentationPaused(currentModel.paused);
      presentationNow = advancePresentationTime(
        presentationNow,
        deltaMs,
        presentationPaused,
      );
      if (presentationPaused) return;
      backdrop.update(deltaMs);
      if (waterTexture !== null && !reducedMotion) {
        waterTexture.uOffset += deltaMs * 0.000018;
        waterTexture.vOffset += deltaMs * 0.000011;
      }
      cinders?.update(deltaMs);
      const now = presentationNow;
      const facingBlend = reducedMotion ? 1 : motionBlend(deltaMs, 110);
      const scaleBlend = reducedMotion ? 1 : motionBlend(deltaMs, 135);
      for (const [id, visual] of entities) {
        if (visual.removeAt !== null && now >= visual.removeAt) {
          disposeEntityVisual(visual);
          entities.delete(id);
          continue;
        }
        Vector3.LerpToRef(
          visual.root.scaling,
          visual.targetScale,
          scaleBlend,
          visual.root.scaling,
        );
        Vector3.LerpToRef(
          visual.presentation.scaling,
          visual.targetPresentationScale,
          scaleBlend,
          visual.presentation.scaling,
        );
        visual.healthRatio +=
          (visual.targetHealthRatio - visual.healthRatio) * scaleBlend;
        if (visual.health !== null) {
          visual.health.scaling.x = visual.healthRatio;
          visual.health.position.x =
            -(1 - visual.healthRatio) *
            (visual.kind === "unit" ? 0.45 : healthBarWidth(visual.span) / 2);
        }
        if (visual.channelFill !== null && visual.channelProgress !== null) {
          const fill = Math.max(0.03, Math.min(1, visual.channelProgress));
          visual.channelFill.scaling.x = fill;
          visual.channelFill.position.x = -(1 - fill) * 0.45;
        }
        if (visual.kind !== "unit" || visual.removeAt !== null) continue;
        const progress = stepProgress(
          now,
          visual.stepStartedAt,
          visual.stepDuration,
        );
        Vector3.LerpToRef(
          visual.stepFrom,
          visual.target,
          progress,
          visual.root.position,
        );
        if (currentModel.hills.length > 0) {
          visual.root.position.y = groundY(
            visual.root.position.x,
            worldZToMapY(visual.root.position.z, currentModel.map.height),
          );
        }
        // Keep walking through the short wait for the next sim step so the
        // walk clip and gait do not restart on every cell.
        const locomoting =
          now - visual.lastStepAt <
          visual.stepInterval + Math.max(160, visual.stepInterval * 0.6);
        visual.root.rotation.y = smoothAngle(
          visual.root.rotation.y,
          visual.facing,
          facingBlend,
        );
        if (!reducedMotion) {
          visual.gait = advanceGait(visual.gait, deltaMs, locomoting);
          const motion = gaitMotion(visual.gait);
          visual.presentation.position.y = motion.bob;
          visual.presentation.rotation.z = motion.lean;
        }
        if (now < visual.actionUntil) {
          visual.presentation.rotation.x = 0;
          continue;
        }
        const workPose = reducedMotion
          ? null
          : proceduralWorkPose({
              activity: visual.activity,
              hasWorkClip: visual.hasWorkClip,
              locomoting,
              phase: visual.motionPhase,
              role: visual.role,
              timeMs: now,
            });
        if (workPose !== null) {
          for (const animation of visual.animations) animation.stop();
          visual.currentClip = "";
          visual.presentation.position.y += workPose.bob;
          visual.presentation.rotation.z += workPose.lean;
          applyWorkPose(visual, workPose);
          continue;
        }
        visual.presentation.rotation.x = 0;
        playClip(
          visual,
          selectCharacterLoopClip({
            activity: visual.activity,
            hasMeditateClip: visual.hasMeditateClip,
            hasRunClip: visual.hasRunClip,
            hasWorkClip: visual.hasWorkClip,
            locomoting,
            meditating: visual.meditating,
            role: visual.role,
          }),
        );
      }
      if (!reducedMotion) {
        const seconds = now / 1000;
        if (rallyMarker.isEnabled()) {
          const pulse = 1 + Math.sin(seconds * 3.2) * 0.07;
          rallyRing.scaling.setAll(pulse);
          rallyCrown.position.y = 1.42 + Math.sin(seconds * 2.6) * 0.08;
          rallyMarker.rotation.y += deltaMs / 900;
        }
        for (const motionList of [decorationMotions, telegraphMotions]) {
          for (const motion of motionList) {
            if (motion.mesh.isDisposed()) continue;
            const wave = Math.sin(seconds * motion.speed + motion.phase);
            motion.mesh.position.y = motion.baseY + wave * motion.amplitude;
            motion.mesh.rotation.y += motion.spin * (deltaMs / 1000);
            const pulse = 1 + wave * 0.06;
            motion.mesh.scaling.set(pulse, 1 + wave * 0.12, pulse);
          }
        }
      }
      for (let index = transientEffects.length - 1; index >= 0; index -= 1) {
        const effect = transientEffects[index];
        if (effect === undefined) continue;
        const progress = Math.min(
          1,
          (now - effect.startedAt) / effect.duration,
        );
        if (effect.kind === "marker") {
          const tighten = 1 - (1 - progress) ** 3;
          effect.mesh.scaling.setAll(1.7 - tighten * 1.0);
          const visibility = 1 - progress * progress;
          if ("visibility" in effect.mesh) {
            (effect.mesh as AbstractMesh).visibility = visibility;
          }
          for (const child of effect.mesh.getChildMeshes()) {
            child.visibility = visibility;
            child.position.y = 0.55 + (1 - tighten) * 0.6;
          }
        } else if (effect.kind === "travel") {
          Vector3.LerpToRef(
            effect.from,
            effect.to,
            progress,
            effect.mesh.position,
          );
          effect.mesh.position.y += Math.sin(progress * Math.PI) * 0.72;
          if (effect.orientAlongFlight) {
            const lookProgress = Math.min(1, progress + 0.06);
            const ahead = Vector3.Lerp(effect.from, effect.to, lookProgress);
            ahead.y += Math.sin(lookProgress * Math.PI) * 0.72;
            effect.mesh.lookAt(ahead);
          } else {
            const pulse = 0.8 + Math.sin(progress * Math.PI) * 0.65;
            effect.mesh.scaling.setAll(pulse);
          }
        } else if (effect.kind === "qi_nova") {
          effect.onUpdate?.(progress, deltaMs);
        } else {
          effect.mesh.scaling.setAll(0.25 + progress * 1.85);
          effect.mesh.rotation.y += deltaMs / 280;
        }
        if (progress < 1) continue;
        disposeTransientEffect(effect);
        transientEffects.splice(index, 1);
      }
    });

    /**
     * Intersects a picking ray with the ground plane, for clicks that miss
     * every mesh (off the map edge or through a gap).
     * @param x - Canvas-relative CSS pixel x
     * @param y - Canvas-relative CSS pixel y
     * @returns The ground-plane hit, or the camera focus if the ray is parallel
     */
    const groundPoint = (x: number, y: number): Vector3 => {
      const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera);
      const distance = ray.intersectsPlane(groundPlane);
      if (distance === null) return camera.target.clone();
      return ray.origin.add(ray.direction.scale(distance));
    };

    /**
     * Begins middle-mouse-button ground-plane drag panning and suppresses the
     * browser's default middle-click autoscroll.
     * @param event - Canvas pointerdown event
     */
    const onMiddlePointerDown = (event: PointerEvent): void => {
      if (event.button !== 1) return;
      event.preventDefault();
      updateCanvasRect();
      middleDragPointerId = event.pointerId;
      middleDragAnchor = groundPoint(
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top,
      );
      canvas.setPointerCapture?.(event.pointerId);
    };

    /**
     * Pans the camera target so the grabbed ground point stays under the cursor.
     * @param event - Canvas pointermove event
     */
    const onMiddlePointerMove = (event: PointerEvent): void => {
      if (
        middleDragAnchor === null ||
        event.pointerId !== middleDragPointerId
      ) {
        return;
      }
      const current = groundPoint(
        event.clientX - canvasRect.left,
        event.clientY - canvasRect.top,
      );
      const dx = middleDragAnchor.x - current.x;
      const dz = middleDragAnchor.z - current.z;
      if (dx === 0 && dz === 0) return;
      desiredCameraTarget.x += dx;
      desiredCameraTarget.z += dz;
      clampCameraTarget();
      smoothedCameraTarget.copyFrom(desiredCameraTarget);
      camera.setTarget(smoothedCameraTarget);
      camera.getViewMatrix(true);
    };

    /** Clears an active middle-mouse drag when the window loses focus. */
    const onMiddleDragBlur = (): void => {
      releaseMiddleDrag();
    };

    canvas.addEventListener("pointerdown", onMiddlePointerDown);
    canvas.addEventListener("pointermove", onMiddlePointerMove);
    canvas.addEventListener("pointerup", releaseMiddleDrag);
    canvas.addEventListener("pointercancel", releaseMiddleDrag);
    window.addEventListener("blur", onMiddleDragBlur);

    /**
     * Converts browser pointer coordinates into a Babylon pick. Babylon's
     * `scene.pick` takes canvas-relative CSS pixels and applies the device
     * pixel ratio itself, so render-pixel coordinates must not be passed.
     * @param clientX - Pointer x in viewport CSS pixels
     * @param clientY - Pointer y in viewport CSS pixels
     * @returns The entity under the pointer and its map-space ground point
     */
    const pick = (clientX: number, clientY: number): DescentScenePick => {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Skinned GLB characters are picked against their bind pose, which need
      // not match what is drawn, so units are hit-tested on screen first.
      const unitId = unitAtScreenPoint(
        { x: clientX, y: clientY },
        screenTargets(rect),
      );
      if (unitId !== null) {
        const point = groundPoint(x, y);
        return {
          buildingId: null,
          point: {
            x: Math.max(0, Math.min(currentModel.map.width, point.x)),
            y: Math.max(
              0,
              Math.min(
                currentModel.map.height,
                worldZToMapY(point.z, currentModel.map.height),
              ),
            ),
          },
          sceneryId: null,
          unitId,
        };
      }
      const result = scene.pick(x, y, (mesh) => mesh.isPickable);
      const metadata = entityMetadata(result?.pickedMesh ?? null);
      const sceneryId = sceneryPlacementId(result?.pickedMesh ?? null);
      // A mesh hit sits above y = 0; orders want the ground plane under it.
      const point =
        metadata?.kind === "ground" && result?.pickedPoint
          ? result.pickedPoint
          : groundPoint(x, y);
      return {
        buildingId: metadata?.buildingId ?? null,
        point: {
          x: Math.max(0, Math.min(currentModel.map.width, point.x)),
          y: Math.max(
            0,
            Math.min(
              currentModel.map.height,
              worldZToMapY(point.z, currentModel.map.height),
            ),
          ),
        },
        sceneryId,
        unitId: metadata?.unitId ?? null,
      };
    };

    /**
     * Projects a world position to viewport CSS pixels, returning null when the
     * point lies behind the camera or beyond the far clip plane.
     * @param position - World-space point
     * @param rect - Canvas client rectangle
     * @returns The point on screen, or null if outside `[0, 1]` clip depth
     */
    const projectToClient = (
      position: Vector3,
      rect: DOMRect,
    ): ScreenPoint | null => {
      const renderWidth = engine.getRenderWidth();
      const renderHeight = engine.getRenderHeight();
      if (renderWidth <= 0 || renderHeight <= 0) return null;
      const viewport = camera.viewport.toGlobal(renderWidth, renderHeight);
      const projected = Vector3.Project(
        position,
        Matrix.IdentityReadOnly,
        scene.getTransformMatrix(),
        viewport,
      );
      if (projected.z < 0 || projected.z > 1) return null;
      return {
        x: rect.left + (projected.x / renderWidth) * rect.width,
        y: rect.top + (projected.y / renderHeight) * rect.height,
      };
    };

    /**
     * Every living unit's on-screen body, feet to head, for click selection.
     * @param rect - Canvas client rectangle
     * @returns Projected unit segments
     */
    const screenTargets = (rect: DOMRect) => {
      const head = new Vector3();
      const targets: { feet: ScreenPoint; head: ScreenPoint; id: string }[] =
        [];
      for (const visual of entities.values()) {
        if (visual.kind !== "unit" || visual.removeAt !== null) continue;
        visual.root.position.addToRef(
          new Vector3(0, visual.role === "cinderjaw" ? 2.4 : 1.6, 0),
          head,
        );
        const feet = projectToClient(visual.root.position, rect);
        const headPoint = projectToClient(head, rect);
        if (feet === null || headPoint === null) continue;
        targets.push({
          feet,
          head: headPoint,
          id: visual.id,
        });
      }
      return targets;
    };

    /**
     * Projects living Hold units into a drag rectangle for box selection,
     * skipping dying units and units projected behind the camera.
     * @param box - Drag rectangle in viewport CSS pixels
     * @returns Ids of Hold units whose position falls inside the box
     */
    const unitsInScreenBox = (box: DescentScreenBox): string[] => {
      const rect = canvas.getBoundingClientRect();
      const left = Math.min(box.left, box.right);
      const right = Math.max(box.left, box.right);
      const top = Math.min(box.top, box.bottom);
      const bottom = Math.max(box.top, box.bottom);
      const selected: string[] = [];
      for (const visual of entities.values()) {
        if (
          visual.kind !== "unit" ||
          visual.factionId !== "hold" ||
          visual.removeAt !== null
        ) {
          continue;
        }
        const projected = projectToClient(visual.root.position, rect);
        if (projected === null) continue;
        if (
          projected.x >= left &&
          projected.x <= right &&
          projected.y >= top &&
          projected.y <= bottom
        ) {
          selected.push(visual.id);
        }
      }
      return selected;
    };

    let appliedWaterUrl: string | undefined;
    let waterTexture: Texture | null = null;
    const setTextures = async (
      textures: AshenGateTextureSet,
      track: TrackLoad = untrackedLoad,
    ): Promise<void> => {
      const tasks: Promise<void>[] = [backdrop.setTextures(textures, track)];
      if (textures.water && textures.water !== appliedWaterUrl) {
        appliedWaterUrl = textures.water;
        const waterUrl = textures.water;
        tasks.push(
          track(
            "Water texture",
            new Promise<Texture>((resolve, reject) => {
              const nextTexture = new Texture(waterUrl, scene, {
                onError: (message) =>
                  queueMicrotask(() => {
                    nextTexture.dispose();
                    reject(new Error(message ?? `Could not load ${waterUrl}`));
                  }),
                onLoad: () => queueMicrotask(() => resolve(nextTexture)),
              });
            }),
          ).then(
            (nextTexture) => {
              if (disposed) {
                nextTexture.dispose();
                return;
              }
              nextTexture.wrapU = Texture.WRAP_ADDRESSMODE;
              nextTexture.wrapV = Texture.WRAP_ADDRESSMODE;
              nextTexture.uScale = 1.6;
              nextTexture.vScale = 1.6;
              waterTexture?.dispose();
              waterTexture = nextTexture;
              terrainMaterials.water.diffuseTexture = nextTexture;
            },
            () => undefined,
          ),
        );
      }
      await Promise.all(tasks);
    };

    let contextLost = false;
    /** Render callback re-attached after a WebGL context restore. */
    const restoredRenderLoop = (): void => {
      if (!disposed) scene.render();
    };
    /** Pauses rendering when the browser loses the WebGL context. */
    const onWebglContextLost = (event: Event): void => {
      event.preventDefault();
      if (contextLost || disposed) return;
      contextLost = true;
      engine.stopRenderLoop();
      options?.onContextLost?.();
    };
    /** Resizes and resumes rendering once the WebGL context is restored. */
    const onWebglContextRestored = (): void => {
      if (!contextLost || disposed) return;
      contextLost = false;
      applyHardwareScaling();
      engine.resize();
      updateCanvasRect();
      engine.runRenderLoop(restoredRenderLoop);
      options?.onContextRestored?.();
    };
    canvas.addEventListener("webglcontextlost", onWebglContextLost);
    canvas.addEventListener("webglcontextrestored", onWebglContextRestored);

    const disposeRuntime = attachBabylonRuntimeLifecycle(engine, scene, window);
    update(initialModel, initialSelection, false);
    void setAssets(initialAssets);
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        resizeObserver?.disconnect();
        window.removeEventListener("resize", updateCanvasRect);
        window.removeEventListener("scroll", updateCanvasRect);
        canvas.removeEventListener("wheel", onCanvasWheel);
        window.removeEventListener("keydown", onCameraKey);
        window.removeEventListener("keyup", onCameraKey);
        window.removeEventListener("blur", releaseCameraKeys);
        window.removeEventListener("pointermove", onEdgeScrollPointerMove);
        canvas.removeEventListener("pointerleave", releaseEdgeScrollPointer);
        document.removeEventListener("mouseleave", releaseEdgeScrollPointer);
        window.removeEventListener("blur", releaseEdgeScrollPointer);
        canvas.removeEventListener("pointerdown", onMiddlePointerDown);
        canvas.removeEventListener("pointermove", onMiddlePointerMove);
        canvas.removeEventListener("pointerup", releaseMiddleDrag);
        canvas.removeEventListener("pointercancel", releaseMiddleDrag);
        window.removeEventListener("blur", onMiddleDragBlur);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        canvas.removeEventListener("webglcontextlost", onWebglContextLost);
        canvas.removeEventListener(
          "webglcontextrestored",
          onWebglContextRestored,
        );
        engine.stopRenderLoop(restoredRenderLoop);
        for (const visual of entities.values()) disposeEntityVisual(visual);
        entities.clear();
        for (const effect of transientEffects) disposeTransientEffect(effect);
        transientEffects.length = 0;
        for (const entry of decorationEntries.values()) {
          removeShadowCasters(entry.node);
          entry.node.dispose();
        }
        decorationEntries.clear();
        decorationMotions.length = 0;
        decorationRoot.dispose();
        if (sceneryRoot !== null) {
          removeShadowCasters(sceneryRoot);
          sceneryRoot.dispose();
          sceneryRoot = null;
        }
        sceneryNodes.clear();
        for (const container of containers.values()) container.dispose();
        containers.clear();
        loadedAssetIds.clear();
        loadingAssetIds.clear();
        carryIcons.dispose();
        fogOverlay.dispose();
        if (routeLine !== null) {
          glow.removeExcludedMesh(routeLine);
          routeLine.dispose();
          routeLine = null;
        }
        routeRoot.dispose();
        telegraphRoot.dispose();
        disposeRuntime();
      },
      focusCamera,
      pick,
      setAssets,
      setInspectRing,
      setPlacementLine,
      setPlacementPoint,
      setTextures,
      showOrderMarker,
      unitsInScreenBox,
      update,
      whenReady,
    };
  } catch (error) {
    engine.dispose();
    throw error;
  }
}
