/**
 * Tools a Mastra agent can call.
 *
 * Add a member to {@link AgentTool}, a matching entry in `AllAgentTools`,
 * and an implementation in
 * `packages/backend/src/mastra/shared/resyncGameFrameworkAgentToolRegistry.ts`.
 * An agent opts in by declaring its own enum whose values are these members.
 */

import { EnumValues, GenericType, VisitorPattern } from "../genericTypes";

export interface AgentBasicTool {
  type: string;
}

/**
 * Every tool the registry can give an agent.
 * The value is the id the model calls.
 */
export enum AgentTool {
  GenerateThreeDModel = "generate-3d-model",
  /**
   * Asks the ProductNow research subagent one question about the Spire, the Reach, or other lore.
   * The subagent loads ProductNow's read tools for the browser session.
   */
  ConsultProductNow = "consult-productnow",
  /**
   * Appends one lore entry to a named document in a game's ProductNow folder,
   * creating the document when it is missing.
   */
  RecordProductNowLore = "record-productnow-lore",
  /** Paints one or more images with Gemini or OpenAI. */
  GenerateImage = "generate-image",
  /** Renders one sound effect, ambience loop, or instrumental bed with ElevenLabs. */
  GenerateAudio = "generate-audio",
}

/**
 * Runs the ProductNow research subagent for one lore question.
 */
export interface ConsultProductNowTool extends AgentBasicTool {
  type: AgentTool.ConsultProductNow;
}

/**
 * Appends one lore entry to a game's ProductNow folder.
 */
export interface RecordProductNowLoreTool extends AgentBasicTool {
  type: AgentTool.RecordProductNowLore;
}

/**
 * Generates one or more images by calling Gemini or OpenAI.
 */
export interface GenerateImageTool extends AgentBasicTool {
  type: AgentTool.GenerateImage;
}

/**
 * Renders one audio clip by calling ElevenLabs.
 */
export interface GenerateAudioTool extends AgentBasicTool {
  type: AgentTool.GenerateAudio;
}

/** Shared agent tools keyed by name. Add an entry here for tools any agent can use. */
export type AllAgentTools = {
  generateThreeDModel: AgentBasicTool & { type: AgentTool.GenerateThreeDModel };
  consultProductNow: ConsultProductNowTool;
  generateAudio: GenerateAudioTool;
  generateImage: GenerateImageTool;
  recordProductNowLore: RecordProductNowLoreTool;
};

/**
 * When adding a new tool, update {@link AgentTool}, `AllAgentTools`, and `AgentTools`.
 */
export type AgentPerformToolCall = GenericType<AllAgentTools>;

/**
 * The id of a tool an agent can call.
 */
export type ToolId = EnumValues<typeof AgentTool>;

/**
 * Tools to give an agent.
 * Pass a list of {@link AgentTool} members, or an enum declared on the agent
 * whose values are those members.
 */
export type AgentToolSelection = readonly ToolId[] | Record<string, string>;

/** Visitor for agent tools. Adding a tool requires a branch here. */
export const AgentTools: VisitorPattern<AllAgentTools> = {
  typeChecks: {
    consultProductNow: (value): value is ConsultProductNowTool =>
      value.type === AgentTool.ConsultProductNow,
    generateAudio: (value): value is GenerateAudioTool =>
      value.type === AgentTool.GenerateAudio,
    generateImage: (value): value is GenerateImageTool =>
      value.type === AgentTool.GenerateImage,
    generateThreeDModel: (
      value,
    ): value is AgentBasicTool & { type: AgentTool.GenerateThreeDModel } =>
      value.type === AgentTool.GenerateThreeDModel,
    recordProductNowLore: (value): value is RecordProductNowLoreTool =>
      value.type === AgentTool.RecordProductNowLore,
  },
  visit: (value, visitor) => {
    if (AgentTools.typeChecks.generateThreeDModel(value))
      return visitor.generateThreeDModel(value);
    if (AgentTools.typeChecks.consultProductNow(value)) {
      return visitor.consultProductNow(value);
    }
    if (AgentTools.typeChecks.generateAudio(value)) {
      return visitor.generateAudio(value);
    }
    if (AgentTools.typeChecks.generateImage(value)) {
      return visitor.generateImage(value);
    }
    if (AgentTools.typeChecks.recordProductNowLore(value)) {
      return visitor.recordProductNowLore(value);
    }

    return visitor.unknown(value);
  },
};
