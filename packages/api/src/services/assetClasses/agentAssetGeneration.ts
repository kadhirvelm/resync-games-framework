import type { AssetGenerationPayload } from "./assetClassService";
import type { AudioGenerationPayload } from "./audio";
import type { ThreeDGenerationPayload } from "./threeD";

/** Asset classes that coding agents can submit to the durable queue. */
export const AGENT_ASSET_CLASSES = [
  "audio",
  "battle-background",
  "card-character",
  "enemy",
  "playable-card",
  "sprite-sheet",
  "static-image",
  "three-d-character",
  "three-d-environment",
  "three-d-prop",
] as const;

/** One asset class accepted by the agent-facing generation API. */
export type AgentAssetClass = (typeof AGENT_ASSET_CLASSES)[number];

/** Classes whose generation input is just an id and natural-language prompt. */
export type PromptAgentAssetClass = Exclude<
  AgentAssetClass,
  "audio" | `three-d-${string}`
>;

/** A prompt-only generation submitted by a coding agent. */
export interface PromptAgentAssetGenerationRequest
  extends Partial<Pick<AssetGenerationPayload, "generationId">>,
    Pick<AssetGenerationPayload, "prompt"> {
  assetClass: PromptAgentAssetClass;
}

/** An audio generation with optional runtime cue constraints. */
export interface AudioAgentAssetGenerationRequest
  extends Partial<Pick<AudioGenerationPayload, "generationId">>,
    Omit<AudioGenerationPayload, "generationId"> {
  assetClass: "audio";
}

/** A 3D generation with its storage category encoded in the asset class. */
export interface ThreeDAgentAssetGenerationRequest
  extends Partial<Pick<ThreeDGenerationPayload, "generationId">>,
    Omit<ThreeDGenerationPayload, "generationId"> {
  assetClass: `three-d-${"character" | "environment" | "prop"}`;
}

/** Body accepted by `POST /agent/assets/generations`. */
export type AgentAssetGenerationRequest =
  | AudioAgentAssetGenerationRequest
  | PromptAgentAssetGenerationRequest
  | ThreeDAgentAssetGenerationRequest;

/** Queue lifecycle states exposed without leaking BullMQ terminology. */
export type AgentAssetGenerationState =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "unknown";

/** Immediate acknowledgement returned after a job is durably queued. */
export interface AgentAssetGenerationAccepted {
  assetClass: AgentAssetClass;
  jobId: string;
  status: AgentAssetGenerationState;
  /** Relative URL that can be polled on the same backend origin. */
  statusUrl: string;
}

/** Poll response for one retained generation job. */
export interface AgentAssetGenerationStatus {
  assetClass: string;
  attemptsMade: number;
  createdAt: string;
  error?: string;
  finishedAt?: string;
  jobId: string;
  result?: unknown;
  startedAt?: string;
  status: AgentAssetGenerationState;
}
