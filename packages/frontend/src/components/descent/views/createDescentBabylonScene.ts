import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
// Registers Scene.pick and createPickingRay; without it picking silently
// returns null (every click lands on map 0,0) or throws.
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Plane } from "@babylonjs/core/Maths/math.plane";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
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
  isResourceAssetRole,
  isSceneryAssetRole,
} from "../data/layers/ashen_gate/threeDAssets";
import { isFogVisible } from "../logic/fog";
import { ASHEN_HAZE, ASHEN_VOID, addAshenBackdrop } from "./ashenBackdrop";
import { PLATEAU_RIM } from "./ashenTerrainLayout";
import {
  cameraKeyFromInput,
  cameraPanDirection,
  cameraRotationInput,
  emptyCameraKeys,
} from "./cameraControls";
import { createCarryIconLayer } from "./carryIcons";
import type { MinimapView } from "./DescentMinimap";
import { createFogOverlay } from "./fogOverlay";
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
  estimateStepInterval,
  type Gait,
  gaitMotion,
  motionBlend,
  smoothAngle,
  stepProgress,
  unitMotionPhase,
} from "./motion";
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
  SILHOUETTE_OUTLINE_COLOR,
  selectionRingDiameter,
  UNIT_MARKER_RING,
  unitMarkerDiameter,
  unitOutlineWidth,
} from "./unitContrast";
import { isTypingTarget } from "./useHotkeys";

/** A pick result translated back into renderer-neutral map coordinates. */
export interface DescentScenePick {
  buildingId: string | null;
  point: MapPoint;
  sceneryId: string | null;
  unitId: string | null;
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
  setPlacementPoint: (point: MapPoint | null, footprint?: number) => void;
  showOrderMarker: (marker: OrderMarker) => void;
  unitsInScreenBox: (box: DescentScreenBox) => string[];
  update: (model: ShellModel, selection: Selection, placing: boolean) => void;
}

interface EntityMetadata {
  buildingId?: string;
  kind: "building" | "ground" | "unit";
  unitId?: string;
}

interface EntityVisual {
  actionUntil: number;
  animations: AnimationGroup[];
  construction: TransformNode | null;
  currentClip: string;
  factionId: "hold" | "horde";
  /** Heading the unit turns toward, set once per sim step. */
  facing: number;
  fallback: TransformNode;
  generated: TransformNode | null;
  health: AbstractMesh | null;
  healthInitialized: boolean;
  healthRatio: number;
  gait: Gait;
  id: string;
  kind: "building" | "unit";
  /** When the sim last moved this unit. */
  lastStepAt: number;
  presentation: TransformNode;
  removeAt: number | null;
  role: AshenGateAssetRole;
  root: TransformNode;
  selection: AbstractMesh;
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
  duration: number;
  from: Vector3;
  kind: "marker" | "pulse" | "travel";
  mesh: AbstractMesh;
  startedAt: number;
  to: Vector3;
}

/** Sim cadence of a villager hop: ECONOMY_STEP_TICKS × TICK_MS at 1× speed. */
const DEFAULT_STEP_INTERVAL_MS = 500;

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
  stronghold: { heightRatio: 1.9, spanScale: 1.14 },
};

/** Model to try when an upgraded Hold's own model is not generated yet. */
const HOLD_MODEL_FALLBACK: Partial<
  Record<AshenGateAssetRole, AshenGateAssetRole>
> = {
  citadel: "stronghold",
  stronghold: "camp",
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
 * Paints a soft dark disc and a faction ring into one foot marker.
 * @param context - Marker texture context
 * @param size - Texture size in pixels
 * @param ring - Faction ring color
 */
function paintUnitMarker(
  context: CanvasRenderingContext2D,
  size: number,
  ring: string,
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
  context.strokeStyle = "rgba(8, 6, 5, 0.9)";
  context.lineWidth = size * 0.058;
  context.beginPath();
  context.arc(center, center, size * 0.4, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = ring;
  context.lineWidth = size * 0.032;
  context.beginPath();
  context.arc(center, center, size * 0.4, 0, Math.PI * 2);
  context.stroke();
}

/**
 * Creates the shared unlit foot marker for one faction.
 * @param scene - Battlefield that owns the material
 * @param name - Unique material name
 * @param ring - Faction ring color
 * @returns A transparent ground material
 */
function createUnitMarkerMaterial(
  scene: Scene,
  name: string,
  ring: string,
): StandardMaterial {
  const size = 128;
  const texture = new DynamicTexture(
    name,
    { height: size, width: size },
    scene,
    false,
  );
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  paintUnitMarker(context, size, ring);
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
  for (const mesh of root.getChildMeshes()) {
    mesh.metadata = metadata;
    mesh.isPickable = true;
  }
}

/** Finds a canonical clip after Babylon has prefixed its instance name. */
function findClip(
  animations: readonly AnimationGroup[],
  name: CharacterClip,
): AnimationGroup | undefined {
  return animations.find((candidate) =>
    animationClipMatches(candidate.name, name),
  );
}

/** Starts a looping generated clip only when its desired state changed. */
function playClip(visual: EntityVisual, name: "idle" | "walk"): void {
  if (visual.currentClip === name) return;
  const clip = findClip(visual.animations, name);
  if (clip === undefined) return;
  for (const animation of visual.animations) animation.stop();
  clip.start(true, name === "walk" ? 1.12 : 0.88);
  visual.currentClip = name;
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
  const clip = findClip(visual.animations, name);
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
 * @returns An imperative adapter used only by the React view boundary
 */
export function createDescentBabylonScene(
  canvas: HTMLCanvasElement,
  initialModel: ShellModel,
  initialSelection: Selection,
  initialAssets: AshenGateAssetSet,
  status: (message: string) => void,
  onCameraView: (view: MinimapView) => void,
): DescentBabylonSceneHandle {
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: false, stencil: true },
    true,
  );
  try {
    const scene = new Scene(engine);
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
    camera.attachControl(canvas, true);
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
      cameraKeys[key] = pressed;
    };

    /** Releases every camera key when the window loses focus mid-press. */
    const releaseCameraKeys = (): void => {
      Object.assign(cameraKeys, emptyCameraKeys());
    };
    window.addEventListener("keydown", onCameraKey);
    window.addEventListener("keyup", onCameraKey);
    window.addEventListener("blur", releaseCameraKeys);

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
    const glow = new GlowLayer("ashen-glow", scene, {
      blurKernelSize: 24,
    });
    glow.intensity = 0.38;

    const ground = CreateGround(
      "ashen-ground",
      {
        height: initialModel.map.height,
        subdivisions: 2,
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
    const fogOverlay = createFogOverlay(scene, PLATEAU_RIM, glow);

    const holdMaterial = material(scene, "hold-bronze", "#d0aa66");
    const holdDarkMaterial = material(scene, "hold-dark", "#473126");
    const hordeMaterial = material(scene, "horde-cinder", "#a93627");
    const hordeDarkMaterial = material(scene, "horde-dark", "#351516");
    const constructionTimberMaterial = material(
      scene,
      "construction-timber",
      "#bc8247",
    );
    const constructionFoundationMaterial = material(
      scene,
      "construction-foundation",
      "#594136",
    );
    const selectedMaterial = material(scene, "selected-gold", "#fff6d4", true);
    const holdMarkerMaterial = createUnitMarkerMaterial(
      scene,
      "hold-foot-marker",
      UNIT_MARKER_RING.hold,
    );
    const hordeMarkerMaterial = createUnitMarkerMaterial(
      scene,
      "horde-foot-marker",
      UNIT_MARKER_RING.horde,
    );
    const healthMaterial = material(scene, "health", "#67c977", true);
    const veinMaterial = material(scene, "spirit-vein", "#36a9c4", true);
    veinMaterial.alpha = 0.34;
    const ventMaterial = material(scene, "ember-vent", "#f05e2f", true);
    ventMaterial.alpha = 0.7;
    const telegraphMaterial = material(
      scene,
      "boss-telegraph",
      "#ffc45d",
      true,
    );
    const projectileMaterial = material(
      scene,
      "projectile-ember",
      "#ffb34e",
      true,
    );
    const healMaterial = material(scene, "healing-aether", "#7dffad", true);
    const markerMaterials: Record<OrderMarker["kind"], StandardMaterial> = {
      attack: material(scene, "order-attack", "#ff5a3c", true),
      build: material(scene, "order-build", "#ffd36b", true),
      gather: material(scene, "order-gather", "#ffd36b", true),
      move: material(scene, "order-move", "#7dff9a", true),
    };
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
    const transientEffects: TransientEffect[] = [];
    const seenEffects = new Set<number>();
    let decorationRoot = new TransformNode("map-decoration", scene);
    let decorationAssetsDirty = false;
    let decorationSignature = "";
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
     * Freezes or resumes Babylon clips alongside the manual world clock.
     * @param paused - Whether every world animation should hold its frame
     * @returns Nothing
     */
    const setPresentationPaused = (paused: boolean): void => {
      if (presentationPaused === paused) return;
      presentationPaused = paused;
      scene.animationsEnabled = !paused;
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
        0.08,
        mapYToWorldZ(ring.y, currentModel.map.height),
      );
      inspectMarker.scaling.set(ring.radius, 1, ring.radius);
      inspectMarker.setEnabled(true);
    };

    /**
     * Shows or hides the snapped building footprint under the cursor.
     * @param point - Cursor on the map, or null to hide the preview
     * @param footprint - Side of the building's square in map cells
     */
    const setPlacementPoint = (point: MapPoint | null, footprint = 1): void => {
      if (point === null) {
        placementPreview.setEnabled(false);
        return;
      }
      placementPreview.scaling.set(footprint, 1, footprint);
      placementPreview.position.set(
        Math.round(point.x),
        0.04,
        mapYToWorldZ(Math.round(point.y), currentModel.map.height),
      );
      placementPreview.setEnabled(true);
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
      if (role === "warden" || role === "raider" || role === "cinderjaw") {
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

    /** Adds a model instance to a gameplay visual and retires its stand-in. */
    const instantiateModel = (
      visual: EntityVisual,
      asset: ThreeDAsset,
      container: AssetContainer,
    ): void => {
      visual.generated?.dispose();
      for (const animation of visual.animations) animation.dispose();
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
          ? getCharacterModelScale(asset, 1.8)
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
      for (const mesh of generated.getChildMeshes()) {
        mesh.receiveShadows = true;
        shadows.addShadowCaster(mesh);
        markSilhouette(mesh, currentOutlineWidth());
      }
      visual.generated = generated;
      visual.animations = instance.animationGroups;
      // Crossfade from the current pose instead of snapping between clips.
      for (const animation of visual.animations) {
        animation.enableBlending = true;
        animation.blendingSpeed = 0.08;
      }
      visual.currentClip = "";
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
        if (node.name.startsWith(`scenery-${role}-`)) node.dispose();
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
        for (const mesh of root.getChildMeshes()) mesh.isPickable = true;
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
          if (isResourceAssetRole(role) || role === "emberVent") {
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
      root.position.set(entity.x, 0, worldZ);
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
        kind === "building" ? createConstructionFrame(entity.id, root) : null;
      if (kind === "building") fallback.scaling.setAll(buildingScale);
      construction?.scaling.setAll(buildingScale);
      for (const mesh of fallback.getChildMeshes()) {
        mesh.receiveShadows = true;
        shadows.addShadowCaster(mesh);
        markSilhouette(mesh, currentOutlineWidth());
      }
      const markerDiameter = kind === "unit" ? unitMarkerDiameter(role) : 0;
      const marker =
        kind === "unit"
          ? CreateGround(
              `unit-marker-${entity.id}`,
              {
                height: markerDiameter,
                subdivisions: 1,
                width: markerDiameter,
              },
              scene,
            )
          : null;
      if (marker !== null) {
        marker.parent = root;
        marker.position.y = 0.01;
        marker.material =
          factionId === "hold" ? holdMarkerMaterial : hordeMarkerMaterial;
        marker.isPickable = false;
        glow.addExcludedMesh(marker);
      }
      const ring = CreateTorus(
        `selection-${entity.id}`,
        {
          diameter: kind === "unit" ? selectionRingDiameter(role) : span + 0.5,
          tessellation: kind === "unit" ? 32 : 48,
          thickness: kind === "unit" ? 0.04 : 0.08,
        },
        scene,
      );
      ring.parent = root;
      ring.position.y = kind === "unit" ? 0.022 : 0.025;
      ring.material = selectedMaterial;
      ring.isPickable = false;
      ring.setEnabled(false);
      const health = CreateBox(
        `health-${entity.id}`,
        {
          depth: 0.055,
          height: kind === "unit" ? 0.07 : 0.1,
          width: kind === "unit" ? 0.9 : healthBarWidth(span),
        },
        scene,
      );
      health.parent = root;
      health.position.set(
        0,
        kind === "unit"
          ? 1.75
          : BUILDING_STAND_IN_HEIGHT * buildingScale +
              BUILDING_HEALTH_CLEARANCE,
        0,
      );
      health.material = healthMaterial;
      health.billboardMode = Mesh.BILLBOARDMODE_ALL;
      health.isPickable = false;
      health.setEnabled(false);
      const visual: EntityVisual = {
        actionUntil: 0,
        animations: [],
        construction,
        currentClip: "",
        facing: 0,
        factionId,
        fallback,
        gait: { phase: unitMotionPhase(entity.id), weight: 0 },
        generated: null,
        health,
        healthInitialized: false,
        healthRatio: 1,
        id: entity.id,
        kind,
        lastStepAt: Number.NEGATIVE_INFINITY,
        presentation,
        removeAt: null,
        role,
        root,
        selection: ring,
        span,
        stepDuration: 0,
        stepFrom: new Vector3(entity.x, 0, worldZ),
        stepInterval: DEFAULT_STEP_INTERVAL_MS,
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
      if (visual.health === null) return;
      if (hitPoints === null || maxHitPoints === null || !(maxHitPoints > 0)) {
        visual.health.setEnabled(false);
        visual.targetHealthRatio = 1;
        return;
      }
      const ratio = Math.max(0.03, Math.min(1, hitPoints / maxHitPoints));
      visual.health.setEnabled(ratio < 0.999);
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
    };

    /** Rebuilds non-interactive veins, vents, nodes, and warning rings. */
    const syncDecorations = (model: ShellModel): void => {
      const signature = JSON.stringify({
        nodes: model.nodes.map((node) => ({
          id: node.id,
          resource: node.resource,
          x: node.x,
          y: node.y,
        })),
        telegraphs: model.telegraphs,
        veins: model.veins,
        vents: model.vents,
      });
      if (signature === decorationSignature) return;
      decorationSignature = signature;
      decorationRoot.dispose();
      decorationMotions.length = 0;
      decorationRoot = new TransformNode("map-decoration", scene);
      for (const vein of model.veins) {
        const marker = CreateTorus(
          `vein-ring-${vein.id}`,
          {
            diameter: Math.max(1.5, vein.radius * 1.2),
            tessellation: 28,
            thickness: 0.055,
          },
          scene,
        );
        marker.parent = decorationRoot;
        const worldZ = mapYToWorldZ(vein.y, model.map.height);
        marker.position.set(vein.x, 0.018, worldZ);
        marker.material = veinMaterial;
        marker.isPickable = false;
        const innerRune = CreateTorus(
          `vein-rune-${vein.id}`,
          { diameter: 0.72, tessellation: 6, thickness: 0.045 },
          scene,
        );
        innerRune.parent = decorationRoot;
        innerRune.position.set(vein.x, 0.022, worldZ);
        innerRune.material = veinMaterial;
        innerRune.isPickable = false;
        decorationMotions.push({
          amplitude: 0.012,
          baseY: marker.position.y,
          mesh: marker,
          phase: vein.x * 0.27,
          speed: 1.1,
          spin: 0.04,
        });
        decorationMotions.push({
          amplitude: 0.008,
          baseY: innerRune.position.y,
          mesh: innerRune,
          phase: vein.y * 0.21,
          speed: 1.25,
          spin: -0.09,
        });
      }
      for (const vent of model.vents) {
        const ring = CreateTorus(
          `vent-${vent.id}`,
          {
            diameter: vent.radius * 2,
            tessellation: 32,
            thickness: 0.12,
          },
          scene,
        );
        ring.parent = decorationRoot;
        const worldZ = mapYToWorldZ(vent.y, model.map.height);
        ring.position.set(vent.x, 0.03, worldZ);
        ring.material = ventMaterial;
        ring.visibility = 0.52;
        ring.isPickable = false;
        const ventRoot = new TransformNode(`vent-prop-${vent.id}`, scene);
        ventRoot.parent = decorationRoot;
        ventRoot.position.set(vent.x, 0, worldZ);
        ventRoot.rotation.y = (vent.x * 0.31 + vent.y * 0.17) % (Math.PI * 2);
        const ventAsset = currentAssets.emberVent;
        const ventContainer = containers.get("emberVent");
        if (ventAsset !== undefined && ventContainer !== undefined) {
          instantiateDecorationProp(
            vent.id,
            ventAsset,
            ventContainer,
            ventRoot,
            Math.min(3.2, vent.radius * 1.35),
            2.25,
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
        decorationMotions.push({
          amplitude: 0.12,
          baseY: emberCore.position.y,
          mesh: emberCore,
          phase: vent.x + vent.y,
          speed: 3.1,
          spin: 0.35,
        });
      }
      for (const node of model.nodes) {
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
          nodeMaterials.set(node.resource, nodeMaterial);
        }
        // A colored plate keeps the exact resource readable even when two
        // economy resources share one harvestable prop family.
        const plate = CreateCylinder(
          `node-plate-${node.id}`,
          { diameter: 2.1, height: 0.05, tessellation: 24 },
          scene,
        );
        plate.parent = decorationRoot;
        const worldZ = mapYToWorldZ(node.y, model.map.height);
        plate.position.set(node.x, 0.01, worldZ);
        plate.material = nodeMaterial;
        plate.visibility = 0.55;
        plate.isPickable = false;
        const resourceRoot = new TransformNode(`node-${node.id}`, scene);
        resourceRoot.parent = decorationRoot;
        resourceRoot.position.set(node.x, 0, worldZ);
        const role = assetRoleForResource(node.resource);
        const asset = currentAssets[role];
        const container = containers.get(role);
        if (asset !== undefined && container !== undefined) {
          instantiateDecorationProp(
            node.id,
            asset,
            container,
            resourceRoot,
            2.35,
            2.7,
          );
        } else {
          createResourceStandIn(role, resourceRoot, nodeMaterial);
        }
      }
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
        ring.parent = decorationRoot;
        ring.position.set(
          warning.x,
          0.05,
          mapYToWorldZ(warning.y, model.map.height),
        );
        ring.material = telegraphMaterial;
        ring.isPickable = false;
        decorationMotions.push({
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
      transientEffects.push({
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

    /** Creates short-lived animated combat feedback from resolved sim FX. */
    const syncEffects = (model: ShellModel): void => {
      for (const effect of model.fx) {
        if (seenEffects.has(effect.id)) continue;
        seenEffects.add(effect.id);
        const now = presentationNow;
        let mesh: AbstractMesh;
        if (
          effect.kind === "projectile" ||
          effect.kind === "melee" ||
          effect.kind === "heal"
        ) {
          mesh = CreateSphere(
            `fx-${effect.id}`,
            {
              diameter: effect.kind === "melee" ? 0.38 : 0.26,
              segments: 8,
            },
            scene,
          );
          mesh.material =
            effect.kind === "heal" ? healMaterial : projectileMaterial;
          const from = new Vector3(
            effect.from.x,
            0.62,
            mapYToWorldZ(effect.from.y, model.map.height),
          );
          const to = new Vector3(
            effect.to.x,
            0.62,
            mapYToWorldZ(effect.to.y, model.map.height),
          );
          mesh.position.copyFrom(from);
          transientEffects.push({
            duration: effect.kind === "melee" ? 180 : 340,
            from,
            kind: "travel",
            mesh,
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
        } else {
          mesh = CreateTorus(
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
          mesh.position.set(x, 0.12, mapYToWorldZ(y, model.map.height));
          mesh.material =
            effect.kind === "damage" ? ventMaterial : telegraphMaterial;
          mesh.scaling.setAll(0.25);
          transientEffects.push({
            duration: effect.kind === "death" ? 620 : 440,
            from: mesh.position.clone(),
            kind: "pulse",
            mesh,
            startedAt: now,
            to: mesh.position.clone(),
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
        mesh.isPickable = false;
      }
      if (seenEffects.size > 2_000) seenEffects.clear();
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

    /**
     * Publishes an approximate ground footprint for the strategic minimap.
     * @param now - Current animation timestamp
     */
    const publishCameraView = (now: number): void => {
      if (now - lastCameraViewAt < 100) return;
      lastCameraViewAt = now;
      const canvasHeight = Math.max(1, canvas.clientHeight);
      const aspect = Math.max(
        0.5,
        Math.min(3, canvas.clientWidth / canvasHeight),
      );
      const footprint = camera.radius * 1.3;
      onCameraView({
        centerX: camera.target.x,
        centerY: worldZToMapY(camera.target.z, currentModel.map.height),
        height: Math.min(currentModel.map.height, footprint),
        rotation: cameraAlphaToMinimapRotation(camera.alpha),
        width: Math.min(currentModel.map.width, footprint * aspect),
      });
    };

    /**
     * Moves the camera focus and heading from the held keys. Panning speed
     * scales with zoom so the screen moves at a steady rate.
     * @param deltaMs - Elapsed frame time in milliseconds
     */
    const applyCameraKeys = (deltaMs: number): void => {
      const seconds = deltaMs / 1000;
      desiredCameraAlpha += cameraRotationInput(cameraKeys) * 1.9 * seconds;
      const direction = cameraPanDirection(cameraKeys, camera.alpha);
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
      visual.target.set(x, 0, targetZ);
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
        0,
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
      routeLine?.dispose();
      routeLine = null;
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
    ): void => {
      currentModel = model;
      setPresentationPaused(model.paused);
      fogOverlay.update(model.fog);
      syncSceneryFog(model);
      if (!placing) setPlacementPoint(null);
      const live = new Set<string>();
      for (const unit of model.units) {
        live.add(unit.id);
        let visual = entities.get(unit.id);
        const role = assetRoleForUnit(unit);
        if (visual !== undefined && visual.role !== role) {
          visual.root.dispose();
          entities.delete(unit.id);
          visual = undefined;
        }
        if (visual === undefined) {
          visual = createEntity(unit, "unit");
          entities.set(unit.id, visual);
        }
        visual.removeAt = null;
        beginStep(visual, unit.x, unit.y);
        visual.targetScale.setAll(unitDisplayScale(unit));
        visual.targetPresentationScale.setAll(1);
        visual.selection.setEnabled(selection.unitIds.includes(unit.id));
        updateHealth(visual, unit.hitPoints, unit.maxHitPoints);
        carryIcons.sync(unit.id, visual.root, unit.carrying?.resource ?? null);
      }
      for (const building of model.buildings) {
        live.add(building.id);
        let visual = entities.get(building.id);
        const role = roleForBuilding(building);
        if (visual !== undefined && visual.role !== role) {
          visual.root.dispose();
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
          0,
          mapYToWorldZ(building.y, model.map.height),
        );
        visual.target.copyFrom(visual.root.position);
        visual.selection.setEnabled(selection.buildingId === building.id);
        visual.targetScale.setAll(1);
        visual.targetPresentationScale.set(
          1,
          building.constructing ? 0.48 : 1,
          1,
        );
        visual.construction?.setEnabled(building.constructing);
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
          0,
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
        visual.removeAt =
          presentationNow + (reducedMotion || lostInFog ? 0 : 560);
        visual.target.copyFrom(visual.root.position);
        visual.stepFrom.copyFrom(visual.root.position);
        visual.targetScale.setAll(reducedMotion ? 0 : 0.08);
        visual.health?.setEnabled(false);
        visual.selection.setEnabled(false);
        carryIcons.remove(visual.id);
        if (visual.kind === "unit" && !lostInFog) {
          playAction(visual, "death", 520, presentationNow);
        }
      }
      clampCameraTarget();
      syncDecorations(model);
      syncEffects(model);
      syncRoute(model, selection);
    };

    scene.onBeforeRenderObservable.add(() => {
      const deltaMs = Math.min(50, engine.getDeltaTime());
      backdrop.update(deltaMs);
      const cameraBlend = reducedMotion ? 1 : motionBlend(deltaMs, 155);
      if (decorationAssetsDirty) {
        decorationAssetsDirty = false;
        decorationSignature = "";
        syncDecorations(currentModel);
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
      const now = presentationNow;
      const facingBlend = reducedMotion ? 1 : motionBlend(deltaMs, 110);
      const scaleBlend = reducedMotion ? 1 : motionBlend(deltaMs, 135);
      for (const [id, visual] of entities) {
        if (visual.removeAt !== null && now >= visual.removeAt) {
          for (const animation of visual.animations) animation.dispose();
          visual.root.dispose();
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
        if (now < visual.actionUntil) continue;
        playClip(visual, locomoting ? "walk" : "idle");
      }
      if (!reducedMotion) {
        const seconds = now / 1000;
        if (rallyMarker.isEnabled()) {
          const pulse = 1 + Math.sin(seconds * 3.2) * 0.07;
          rallyRing.scaling.setAll(pulse);
          rallyCrown.position.y = 1.42 + Math.sin(seconds * 2.6) * 0.08;
          rallyMarker.rotation.y += deltaMs / 900;
        }
        for (const motion of decorationMotions) {
          if (motion.mesh.isDisposed()) continue;
          const wave = Math.sin(seconds * motion.speed + motion.phase);
          motion.mesh.position.y = motion.baseY + wave * motion.amplitude;
          motion.mesh.rotation.y += motion.spin * (deltaMs / 1000);
          const pulse = 1 + wave * 0.06;
          motion.mesh.scaling.set(pulse, 1 + wave * 0.12, pulse);
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
          effect.mesh.visibility = 1 - progress * progress;
          for (const child of effect.mesh.getChildMeshes()) {
            child.visibility = effect.mesh.visibility;
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
          const pulse = 0.8 + Math.sin(progress * Math.PI) * 0.65;
          effect.mesh.scaling.setAll(pulse);
        } else {
          effect.mesh.scaling.setAll(0.25 + progress * 1.85);
          effect.mesh.rotation.y += deltaMs / 280;
        }
        if (progress < 1) continue;
        effect.mesh.dispose();
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
      const result = scene.pick(x, y, (mesh) => mesh.isPickable);
      const metadata = entityMetadata(result?.pickedMesh ?? null);
      const sceneryId = sceneryPlacementId(result?.pickedMesh ?? null);
      // Skinned GLB characters are picked against their bind pose, which need
      // not match what is drawn, so units are hit-tested on screen instead.
      const unitId = unitAtScreenPoint(
        { x: clientX, y: clientY },
        screenTargets(rect),
      );
      // A unit's mesh hit sits up on its body; orders want the ground under it.
      const point =
        metadata?.kind === "ground" && result?.pickedPoint
          ? result.pickedPoint
          : groundPoint(x, y);
      return {
        buildingId: unitId === null ? (metadata?.buildingId ?? null) : null,
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
        sceneryId: unitId === null ? sceneryId : null,
        unitId: unitId ?? metadata?.unitId ?? null,
      };
    };

    /**
     * Projects a world position to viewport CSS pixels.
     * @param position - World-space point
     * @param rect - Canvas client rectangle
     * @returns The point on screen
     */
    const projectToClient = (position: Vector3, rect: DOMRect): ScreenPoint => {
      const viewport = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      const projected = Vector3.Project(
        position,
        Matrix.IdentityReadOnly,
        scene.getTransformMatrix(),
        viewport,
      );
      return {
        x: rect.left + (projected.x / engine.getRenderWidth()) * rect.width,
        y: rect.top + (projected.y / engine.getRenderHeight()) * rect.height,
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
        targets.push({
          feet: projectToClient(visual.root.position, rect),
          head: projectToClient(head, rect),
          id: visual.id,
        });
      }
      return targets;
    };

    /**
     * Projects Hold units into a drag rectangle for box selection.
     * @param box - Drag rectangle in viewport CSS pixels
     * @returns Ids of Hold units whose position falls inside the box
     */
    const unitsInScreenBox = (box: DescentScreenBox): string[] => {
      const rect = canvas.getBoundingClientRect();
      const viewport = camera.viewport.toGlobal(
        engine.getRenderWidth(),
        engine.getRenderHeight(),
      );
      const world = Matrix.Identity();
      const left = Math.min(box.left, box.right);
      const right = Math.max(box.left, box.right);
      const top = Math.min(box.top, box.bottom);
      const bottom = Math.max(box.top, box.bottom);
      const selected: string[] = [];
      for (const visual of entities.values()) {
        if (visual.kind !== "unit" || visual.factionId !== "hold") continue;
        const projected = Vector3.Project(
          visual.root.position,
          world,
          scene.getTransformMatrix(),
          viewport,
        );
        const x =
          rect.left + (projected.x / engine.getRenderWidth()) * rect.width;
        const y =
          rect.top + (projected.y / engine.getRenderHeight()) * rect.height;
        if (x >= left && x <= right && y >= top && y <= bottom) {
          selected.push(visual.id);
        }
      }
      return selected;
    };

    const disposeRuntime = attachBabylonRuntimeLifecycle(engine, scene, window);
    update(initialModel, initialSelection, false);
    void setAssets(initialAssets);
    return {
      dispose: () => {
        if (disposed) return;
        disposed = true;
        window.removeEventListener("keydown", onCameraKey);
        window.removeEventListener("keyup", onCameraKey);
        window.removeEventListener("blur", releaseCameraKeys);
        for (const effect of transientEffects) effect.mesh.dispose();
        transientEffects.length = 0;
        carryIcons.dispose();
        fogOverlay.dispose();
        routeRoot.dispose();
        disposeRuntime();
      },
      focusCamera,
      pick,
      setAssets,
      setInspectRing,
      setPlacementPoint,
      setTextures: backdrop.setTextures,
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
