import { createTool } from "@mastra/core/tools";
import { Injectable } from "@nestjs/common";
import {
  AgentTool,
  type ThreeDAsset,
  type ThreeDAssetKind,
  type ThreeDGenerationPayload,
} from "@resync-game-framework/api";
import { ThreeDJobs } from "src/asset-classes/three-d/threeDJobs";
import { threeDDesignSchema } from "src/asset-classes/three-d/threeDSchemas";
import { ResyncGameFrameworkAgentService } from "src/mastra/shared/resyncGameFrameworkAgent.service";
import { GenerateThreeDModelToolService } from "src/mastra/tools/generateThreeDModelTool.service";
import { GenerationAbortCoordinator } from "../generationAbort.coordinator";

/** Thin shared runner for category-specific 3D design agents. */
@Injectable()
export class ThreeDDesignAgent {
  public constructor(
    private readonly agents: ResyncGameFrameworkAgentService,
    private readonly generator: GenerateThreeDModelToolService,
    private readonly aborts: GenerationAbortCoordinator,
    private readonly jobs: ThreeDJobs,
  ) {}
  /** Stops a model run through Redis-backed distributed cancellation. */
  public abort(id: string): Promise<boolean> {
    return this.aborts.stop(id);
  }
  /**
   * Asks a modeling agent for structured parts, then executes the controlled
   * provider tool exactly once. Provider selection cannot be changed by the model.
   * @param kind - Owned asset kind
   * @param input - Source description and explicitly selected generation route
   * @returns The validated stored GLB
   */
  public query(
    kind: ThreeDAssetKind,
    input: ThreeDGenerationPayload,
  ): Promise<ThreeDAsset> {
    return this.aborts.run(input.generationId, async (signal) => {
      const deadline = AbortSignal.any([
        signal,
        AbortSignal.timeout(24 * 60_000),
      ]);
      const provider = input.provider ?? "design";
      let design = input.design;
      if (provider === "design" && !design) {
        await this.jobs.progress(
          input.generationId,
          "Designing low-poly geometry",
          15,
        );
        const draftTool = createTool({
          description:
            "Record the complete low-poly model draft. Coordinates are meters; +Y is up, +Z is forward. Each part becomes a flat-shaded box or octagonal cylinder.",
          execute: async (draft) => draft,
          id: "record-3d-design",
          inputSchema: threeDDesignSchema,
        });
        const result = await this.agents.runGenerationCoordinator({
          abortSignal: deadline,
          agentId: `three-d-${kind}-agent`,
          catalogTools: input.useLore ? [AgentTool.ConsultProductNow] : [],
          instructions: `Design one attractive stylized low-poly ${kind}. Use a coordinated color palette, layered silhouettes, readable features, 12–40 purposeful parts. Ground models at y=0. ${kind === "environment" ? "Build an open 18m square arena with a floor centered at y=-0.2; keep the central walkable space clear. Peripheral scenery can reach +/-8m." : "Keep the model centered at x=z=0. Props fit in 2m; characters are 2m tall."} ${kind === "character" ? "Humanoid: head, torso, paired arms and legs. Assign each part to its anatomical joint. The compiler adds the six-joint skin and idle/walk/attack/hit/death clips." : "Set every joint to body."} ${input.useLore ? "First consult-productnow to read the Lore document and ground the design in that answer." : "Use only the supplied creative description; lore research is optional and not requested."} Call record-3d-design once with the complete model. Do not return code.`,
          maxSteps: input.useLore ? 4 : 2,
          outputLabel: "3D modeling draft",
          prompt: input.prompt,
          readToolOutput: (raw) => threeDDesignSchema.parse(raw),
          supportingToolIds: input.useLore ? [AgentTool.ConsultProductNow] : [],
          tool: draftTool,
          toolId: "record-3d-design",
        });
        design = result.toolOutput;
      }
      return this.generator.generate(
        { ...input, design, kind, provider },
        deadline,
      );
    });
  }
}
/** Prop-only agent boundary used by the asset class and prototype slots. */
@Injectable()
export class ThreeDPropAgent {
  public constructor(private readonly agent: ThreeDDesignAgent) {}
  /** @returns One validated static prop for the supplied creative brief. */
  public query(input: ThreeDGenerationPayload): Promise<ThreeDAsset> {
    return this.agent.query("prop", input);
  }
}
/** Environment-only agent boundary. */
@Injectable()
export class ThreeDEnvironmentAgent {
  public constructor(private readonly agent: ThreeDDesignAgent) {}
  /** @returns One validated open arena model. */
  public query(input: ThreeDGenerationPayload): Promise<ThreeDAsset> {
    return this.agent.query("environment", input);
  }
}
/** Character-only agent boundary with the enforced five-clip contract. */
@Injectable()
export class ThreeDCharacterAgent {
  public constructor(private readonly agent: ThreeDDesignAgent) {}
  /** @returns One rigged and animated character. */
  public query(input: ThreeDGenerationPayload): Promise<ThreeDAsset> {
    return this.agent.query("character", input);
  }
}
