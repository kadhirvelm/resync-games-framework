import type { Service, ServiceDefinition } from "../../genericTypes/service";
import {
  ASSET_CLASS_ENDPOINTS,
  type AssetClassServiceApi,
  type AssetGenerationPayload,
} from "./assetClassService";

/** Independent 3D asset categories; never sprite or portrait references. */
export type ThreeDAssetKind = "prop" | "environment" | "character";
/** Model production routes. Demo is deterministic and makes no model calls. */
export type ThreeDProvider = "demo" | "design" | "meshy";
/** Required character clip names in every accepted character GLB. */
export const THREE_D_CHARACTER_ANIMATIONS = [
  "idle",
  "walk",
  "attack",
  "hit",
  "death",
] as const;
/** A structured modeling part, compiled to geometry without executing code. */
export interface ThreeDPart {
  name: string;
  shape: "box" | "cylinder";
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  joint: "body" | "head" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
}
/** Editable low-poly design used by the built-in GLB compiler. */
export interface ThreeDDesign {
  name: string;
  parts: ThreeDPart[];
}
/** Queryable validation results extracted from the actual stored GLB. */
export interface ThreeDValidation {
  valid: true;
  bytes: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  skins: number;
  bounds: { min: number[]; max: number[] };
  animations: { name: string; duration: number }[];
  warnings: string[];
}
/** Persisted model, provenance, and inspection data. */
export interface ThreeDAsset {
  id: string;
  kind: ThreeDAssetKind;
  name: string;
  prompt: string;
  createdAt: string;
  url: string;
  thumbnailUrl: string;
  design?: ThreeDDesign;
  validation: ThreeDValidation;
  provenance: {
    provider: ThreeDProvider | "upload";
    jobIds: string[];
    elapsedMs: number;
    estimatedCredits: number | null;
  };
}
/** Generation options exposed explicitly by the workshop. */
export interface ThreeDGenerationPayload extends AssetGenerationPayload {
  provider?: ThreeDProvider;
  useLore?: boolean;
  design?: ThreeDDesign;
}
/** Capabilities and stored assets returned by each 3D gallery. */
export interface ThreeDAssetList {
  assets: ThreeDAsset[];
  meshyConfigured: boolean;
}
/** Each category follows the existing asset-class generate/list/cancel contract. */
export interface ThreeDAssetServiceApi
  extends AssetClassServiceApi<
    ThreeDAsset,
    ThreeDAssetList,
    ThreeDGenerationPayload
  > {
  ingest: {
    payload: { fileName: string; glbBase64: string; name: string };
    response: ThreeDAsset;
  };
}
/** Prop generation, validation, and manual GLB ingestion. */
export const ThreeDPropServiceDefinition: ServiceDefinition<ThreeDAssetServiceApi> =
  {
    controller: "three-d-props",
    endpoints: { ...ASSET_CLASS_ENDPOINTS, ingest: "ingest" },
  };
/** Environment generation, validation, and manual GLB ingestion. */
export const ThreeDEnvironmentServiceDefinition: ServiceDefinition<ThreeDAssetServiceApi> =
  {
    controller: "three-d-environments",
    endpoints: { ...ASSET_CLASS_ENDPOINTS, ingest: "ingest" },
  };
/** Rigged character generation and strict animation validation. */
export const ThreeDCharacterServiceDefinition: ServiceDefinition<ThreeDAssetServiceApi> =
  {
    controller: "three-d-characters",
    endpoints: { ...ASSET_CLASS_ENDPOINTS, ingest: "ingest" },
  };
/** One model placement in a prototype, with an explicit gameplay role. */
export interface ThreeDPrototypeSlot {
  id: string;
  kind: ThreeDAssetKind;
  name: string;
  prompt: string;
  ownerSlotId?: string;
  position: [number, number, number];
  assetId?: string;
  asset?: ThreeDAsset;
}
/** A self-contained experiment package independent of 2D dungeon JSON. */
export interface ThreeDPrototype {
  id: string;
  name: string;
  prompt: string;
  objective: string;
  createdAt: string;
  slots: ThreeDPrototypeSlot[];
}
/** Billable Meshy submission stages journaled before their task IDs exist. */
export type ThreeDProviderSubmissionPhase =
  | "preview"
  | "refine"
  | "rig"
  | "animation";
/** Persisted generation state allows workshop refreshes during slow jobs. */
export interface ThreeDJob {
  requestHash?: string;
  providerJobIds?: string[];
  providerSubmissionPending?: ThreeDProviderSubmissionPhase;
  generationId: string;
  kind: ThreeDAssetKind;
  prompt: string;
  provider: ThreeDProvider;
  stage: string;
  progress: number;
  startedAt: string;
  prototypeId?: string;
  slotId?: string;
  asset?: ThreeDAsset;
  error?: string;
  state: "running" | "complete" | "failed" | "cancelled";
}
/** Background jobs and independent 3D prototype package operations. */
export interface ThreeDWorkshopServiceApi extends Service {
  list: {
    payload: null;
    response: { prototypes: ThreeDPrototype[]; jobs: ThreeDJob[] };
  };
  create: {
    payload: {
      name: string;
      prompt: string;
      demo?: boolean;
      generationId?: string;
    };
    response: ThreeDPrototype;
  };
  attach: {
    payload: { prototypeId: string; slotId: string; assetId: string };
    response: ThreeDPrototype;
  };
  start: {
    payload: ThreeDGenerationPayload & {
      kind: ThreeDAssetKind;
      prototypeId?: string;
      slotId?: string;
    };
    response: ThreeDJob;
  };
  cancel: { payload: { generationId: string }; response: { stopped: boolean } };
}
/** All workshop operations use generated service callers. */
export const ThreeDWorkshopServiceDefinition: ServiceDefinition<ThreeDWorkshopServiceApi> =
  {
    controller: "three-d-workshop",
    endpoints: {
      attach: "attach",
      cancel: "cancel",
      create: "create",
      list: "list",
      start: "start",
    },
  };
/** Renderer-neutral model placements consumed by the Babylon adapter. */
export interface ThreeDSceneInput {
  environmentId: string;
  entities: {
    id: string;
    kind: ThreeDAssetKind;
    model?: ThreeDAsset;
    position: [number, number, number];
  }[];
  player: {
    position: [number, number, number];
    cameraMode: "orbit" | "follow";
  };
  reducedMotion: boolean;
}
/** Scene signals consumed by pure rules and React HUDs. */
export type ThreeDSceneEvent =
  | { type: "ready" }
  | { type: "input"; x: number; z: number }
  | { type: "interaction"; entityId: string }
  | { type: "finished" };
