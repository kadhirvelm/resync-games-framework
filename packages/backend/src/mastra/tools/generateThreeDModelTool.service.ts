import { createTool } from "@mastra/core/tools";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  AgentTool,
  type ThreeDAsset,
  type ThreeDAssetKind,
  type ThreeDDesign,
  type ThreeDProvider,
} from "@towers-of-coreborn/api";
import {
  compileThreeDDesign,
  demoThreeDDesign,
} from "src/asset-classes/three-d/compileThreeDDesign";
import { MeshyProvider } from "src/asset-classes/three-d/meshyProvider";
import { ThreeDAssetStore } from "src/asset-classes/three-d/threeDAssetStore";
import { ThreeDJobs } from "src/asset-classes/three-d/threeDJobs";
import { threeDDesignSchema } from "src/asset-classes/three-d/threeDSchemas";
import { z } from "zod";

/** Owned structured generation input; provider and budget never come from executable code. */
const schema = z.object({
  design: threeDDesignSchema.optional(),
  generationId: z.uuid(),
  kind: z.enum(["prop", "environment", "character"]),
  prompt: z.string().min(1).max(4000),
  provider: z.enum(["demo", "design", "meshy"]),
});
/** Shared registry tool that compiles or downloads models, validates and persists them. */
@Injectable()
export class GenerateThreeDModelToolService {
  private readonly logger = new Logger(GenerateThreeDModelToolService.name);
  public constructor(
    private readonly store: ThreeDAssetStore,
    private readonly meshy: MeshyProvider,
    private readonly jobs: ThreeDJobs,
  ) {}
  /** @returns The shared Mastra generate-3d-model tool. */
  public createTool() {
    return createTool({
      description:
        "Generate a budgeted GLB from a structured design or Meshy job. Returns only validated stored model references. Characters use the built-in six-joint rig.",
      execute: (input, context) =>
        this.generate(
          input,
          context?.abortSignal ?? new AbortController().signal,
        ),
      id: AgentTool.GenerateThreeDModel,
      inputSchema: schema,
    });
  }
  /**
   * Produces and validates one model through the selected adapter.
   * @param input - Enforced provider, category, source prompt, optional design
   * @param signal - Shared distributed generation cancellation
   * @returns Validated persisted asset and generation telemetry
   */
  public async generate(
    input: {
      generationId: string;
      kind: ThreeDAssetKind;
      provider: ThreeDProvider;
      prompt: string;
      design?: ThreeDDesign;
    },
    signal: AbortSignal,
  ): Promise<ThreeDAsset> {
    const request = schema.parse(input);
    const previousJob = await this.jobs.get(request.generationId);
    const started = previousJob
      ? Date.parse(previousJob.startedAt)
      : Date.now();
    signal.throwIfAborted();
    let bytes: Uint8Array;
    let jobIds: string[] = [];
    let design = request.design;
    if (request.provider === "meshy") {
      if (previousJob?.providerSubmissionPending)
        throw new BadRequestException(
          "Meshy submission outcome is unknown. Inspect the provider dashboard before retrying with a new generation id.",
        );
      if (request.kind === "character")
        throw new BadRequestException(
          "Use Low-poly AI for rigged characters. Meshy character rigging is not enabled.",
        );
      const generated = await this.meshy.generate(
        request.prompt,
        signal,
        async (stage, progress, id) => {
          if (id) jobIds.push(id);
          await this.jobs.progress(
            request.generationId,
            id ? `${stage} · ${id}` : stage,
            progress,
            id,
          );
        },
        previousJob?.providerJobIds ?? [],
        (phase) => this.jobs.submitting(request.generationId, phase),
      );
      bytes = generated.bytes;
      jobIds = generated.jobIds;
    } else {
      if (request.provider === "demo") design = demoThreeDDesign(request.kind);
      if (!design)
        throw new BadRequestException(
          "A structured design is required for Low-poly AI.",
        );
      await this.jobs.progress(
        request.generationId,
        "Building model and animation clips",
        65,
      );
      bytes = await compileThreeDDesign(design, request.kind);
    }
    signal.throwIfAborted();
    await this.jobs.progress(
      request.generationId,
      "Validating geometry, textures and animations",
      90,
    );
    const asset = await this.store.save(
      {
        bytes,
        design,
        id: request.generationId,
        kind: request.kind,
        name: design?.name ?? request.prompt.slice(0, 60),
        prompt: request.prompt,
        provenance: {
          elapsedMs: Date.now() - started,
          estimatedCredits: request.provider === "meshy" ? 30 : null,
          jobIds,
          provider: request.provider,
        },
      },
      signal,
    );
    this.logger.log(
      {
        assetId: asset.id,
        bytes: bytes.length,
        elapsedMs: Date.now() - started,
        estimatedCredits: asset.provenance.estimatedCredits,
        kind: asset.kind,
        provider: request.provider,
      },
      "3D asset accepted",
    );
    return asset;
  }
}
