import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ThreeDProviderSubmissionPhase } from "@resync-game-framework/api";
import { ConfigurationService } from "src/configuration/configuration.service";
import { normalizeMeshyCharacter } from "./normalizeMeshyCharacter";
import { THREE_D_LIMITS } from "./threeDSchemas";

const MESHY_API_ROOT = "https://api.meshy.ai/openapi";
const TEXT_TO_3D_ROUTE = "/v2/text-to-3d";
const RIGGING_ROUTE = "/v1/rigging";
const ANIMATION_ROUTE = "/v1/animations";
const CHARACTER_ACTION_IDS = [0, 30, 99, 178, 189] as const;

type MeshyTaskRoute =
  | typeof TEXT_TO_3D_ROUTE
  | typeof RIGGING_ROUTE
  | typeof ANIMATION_ROUTE;
type MeshyReport = (
  stage: string,
  progress: number,
  jobId?: string,
) => Promise<void>;
type MeshyBeforeSubmit = (
  phase: ThreeDProviderSubmissionPhase,
) => Promise<void>;

/** Cancel-aware delay that removes its listener after resolving. */
export function providerDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Meshy's asynchronous model, rigging, and animation adapter. */
@Injectable()
export class MeshyProvider {
  public constructor(private readonly configuration: ConfigurationService) {}

  /** @returns Whether a server-side Meshy credential is configured. */
  public configured(): boolean {
    return this.configuration.get("MESHY_API_KEY").length > 0;
  }

  /**
   * Makes one bounded, authenticated Meshy API request without POST retries.
   * @param path - Fixed API-relative task route
   * @param method - Read, create, or best-effort task deletion
   * @param signal - Request cancellation signal
   * @param body - Optional structured task payload
   * @returns Parsed provider JSON
   */
  private async request(
    path: string,
    method: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${MESHY_API_ROOT}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.configuration.get("MESHY_API_KEY")}`,
        "Content-Type": "application/json",
      },
      method,
      signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    });
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Meshy returned ${response.status}. Check API credits, credentials, and provider availability.`,
      );
    if (method === "DELETE") return {};
    return response.json();
  }

  /**
   * Generates one textured static model through preview and refine tasks.
   * @param prompt - Structured art description
   * @param signal - Shared generation cancellation
   * @param report - Durable job progress and provider-id callback
   * @param resumeJobIds - Previously persisted preview and refine task IDs
   * @param beforeSubmit - Journals a potentially billable provider submission
   * @param options - Character pose constraints applied before auto-rigging
   * @returns GLB bytes and both provider task IDs
   */
  public async generate(
    prompt: string,
    signal: AbortSignal,
    report: MeshyReport,
    resumeJobIds: string[] = [],
    beforeSubmit: MeshyBeforeSubmit = async () => undefined,
    options: { character?: boolean } = {},
  ): Promise<{ bytes: Uint8Array; jobIds: string[] }> {
    if (!this.configured())
      throw new BadRequestException(
        "Set MESHY_API_KEY on the backend, or choose Low-poly AI / Demo.",
      );
    this.validateTaskIds(resumeJobIds, 2);
    const jobIds = [...resumeJobIds];
    let activeId = jobIds[0];
    try {
      if (!activeId) {
        await beforeSubmit("preview");
        const preview = await this.request(TEXT_TO_3D_ROUTE, "POST", signal, {
          ai_model: "meshy-6",
          mode: "preview",
          origin_at: options.character ? "bottom" : undefined,
          pose_mode: options.character ? "a-pose" : undefined,
          prompt: prompt.slice(0, 800),
          should_remesh: true,
          target_formats: ["glb"],
          target_polycount: 12_000,
          topology: "triangle",
        });
        activeId = this.readTaskId(preview, "Meshy returned no task id.");
        jobIds.push(activeId);
        await report("Meshy geometry", 10, activeId);
      }
      if (jobIds.length === 1) {
        if (!activeId)
          throw new ServiceUnavailableException("Missing Meshy preview id.");
        await this.poll(TEXT_TO_3D_ROUTE, activeId, signal, report, 10, 40);
        await beforeSubmit("refine");
        const refine = await this.request(TEXT_TO_3D_ROUTE, "POST", signal, {
          enable_pbr: false,
          mode: "refine",
          preview_task_id: activeId,
          target_formats: ["glb"],
          texture_resolution: "2k",
        });
        activeId = this.readTaskId(
          refine,
          "Meshy returned no texture task id.",
        );
        jobIds.push(activeId);
        await report("Meshy textures", 50, activeId);
      }
      activeId = jobIds[1];
      if (!activeId)
        throw new ServiceUnavailableException("Missing Meshy refine id.");
      const task = await this.poll(
        TEXT_TO_3D_ROUTE,
        activeId,
        signal,
        report,
        50,
        40,
      );
      const urls = task.model_urls as { glb?: string } | undefined;
      if (!urls?.glb)
        throw new ServiceUnavailableException(
          "Meshy completed without a GLB result.",
        );
      return {
        bytes: await this.downloadGlb(urls.glb, signal),
        jobIds,
      };
    } catch (error) {
      if (signal.aborted && activeId)
        await this.deleteTask(TEXT_TO_3D_ROUTE, activeId);
      throw error;
    }
  }

  /**
   * Generates, rigs, animates, and normalizes one complete game character.
   * @param prompt - Humanoid character art description
   * @param signal - Shared generation cancellation
   * @param report - Durable job progress and provider-id callback
   * @param resumeJobIds - Preview, refine, rig, and animation task IDs
   * @param beforeSubmit - Journals each potentially billable submission
   * @returns Canonical five-clip character GLB and all four task IDs
   */
  public async generateCharacter(
    prompt: string,
    signal: AbortSignal,
    report: MeshyReport,
    resumeJobIds: string[] = [],
    beforeSubmit: MeshyBeforeSubmit = async () => undefined,
  ): Promise<{ bytes: Uint8Array; jobIds: string[] }> {
    this.validateTaskIds(resumeJobIds, 4);
    const base = await this.generate(
      prompt,
      signal,
      async (stage, progress, id) => report(stage, progress * 0.6, id),
      resumeJobIds.slice(0, 2),
      beforeSubmit,
      { character: true },
    );
    const jobIds = [...base.jobIds, ...resumeJobIds.slice(2)];
    let activeId = jobIds[2];
    let activeRoute: MeshyTaskRoute = RIGGING_ROUTE;
    try {
      if (!activeId) {
        const inputTaskId = jobIds[1];
        if (!inputTaskId)
          throw new ServiceUnavailableException("Missing Meshy refine id.");
        await beforeSubmit("rig");
        const rig = await this.request(RIGGING_ROUTE, "POST", signal, {
          height_meters: 1.75,
          input_task_id: inputTaskId,
        });
        activeId = this.readTaskId(rig, "Meshy returned no rigging task id.");
        jobIds.push(activeId);
        await report("Meshy rigging", 58, activeId);
      }
      await this.poll(RIGGING_ROUTE, activeId, signal, report, 58, 12);
      await report("Meshy rig ready", 70);
      activeRoute = ANIMATION_ROUTE;
      activeId = jobIds[3];
      if (!activeId) {
        const rigTaskId = jobIds[2];
        if (!rigTaskId)
          throw new ServiceUnavailableException("Missing Meshy rigging id.");
        await beforeSubmit("animation");
        const animation = await this.request(ANIMATION_ROUTE, "POST", signal, {
          action_ids: [...CHARACTER_ACTION_IDS],
          rig_task_id: rigTaskId,
        });
        activeId = this.readTaskId(
          animation,
          "Meshy returned no animation task id.",
        );
        jobIds.push(activeId);
        await report("Meshy animations", 74, activeId);
      }
      const task = await this.poll(
        ANIMATION_ROUTE,
        activeId,
        signal,
        report,
        74,
        16,
      );
      const result = task.result as { animation_glb_url?: string } | undefined;
      if (!result?.animation_glb_url)
        throw new ServiceUnavailableException(
          "Meshy completed without an animated GLB result.",
        );
      await report("Normalizing character clips and textures", 92);
      const bytes = await this.downloadGlb(result.animation_glb_url, signal);
      return { bytes: await normalizeMeshyCharacter(bytes), jobIds };
    } catch (error) {
      if (signal.aborted && activeId)
        await this.deleteTask(activeRoute, activeId);
      throw error;
    }
  }

  /** Returns a validated task ID from a create response. */
  private readTaskId(task: Record<string, unknown>, message: string): string {
    if (typeof task.result !== "string" || !/^[a-zA-Z0-9-]+$/.test(task.result))
      throw new ServiceUnavailableException(message);
    return task.result;
  }

  /** Rejects corrupt or excessive resumable task journals. */
  private validateTaskIds(taskIds: string[], maximum: number): void {
    if (
      taskIds.length > maximum ||
      taskIds.some((id) => !/^[a-zA-Z0-9-]+$/.test(id))
    )
      throw new BadRequestException("Invalid saved Meshy task ids.");
  }

  /** Downloads one bounded GLB from Meshy's signed asset hosts. */
  private async downloadGlb(
    source: string,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const url = new URL(source);
    if (
      url.protocol !== "https:" ||
      !["assets.meshy.ai", "assets.meshy.com"].includes(url.hostname)
    )
      throw new ServiceUnavailableException(
        "Meshy returned an unexpected download host.",
      );
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    });
    if (!response.ok || !response.body)
      throw new ServiceUnavailableException("Unable to download Meshy result.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > THREE_D_LIMITS.bytes)
          throw new BadRequestException(
            "Provider GLB exceeds 20 MiB. Use a smaller model.",
          );
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks);
  }

  /** Removes a provider task after local cancellation when Meshy permits it. */
  private async deleteTask(route: MeshyTaskRoute, id: string): Promise<void> {
    await this.request(
      `${route}/${id}`,
      "DELETE",
      AbortSignal.timeout(10_000),
    ).catch(() => undefined);
  }

  /** Polls a bounded task until success or an actionable provider failure. */
  private async poll(
    route: MeshyTaskRoute,
    id: string,
    signal: AbortSignal,
    report: MeshyReport,
    base: number,
    range: number,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const task = await this.request(`${route}/${id}`, "GET", signal);
      if (task.status === "SUCCEEDED") return task;
      if (["FAILED", "CANCELED", "EXPIRED"].includes(String(task.status)))
        throw new ServiceUnavailableException(
          `Meshy task ${id} ${String(task.status).toLowerCase()}.`,
        );
      await report(
        `Meshy ${String(task.status).toLowerCase()}`,
        base +
          (Math.max(0, Math.min(100, Number(task.progress) || 0)) * range) /
            100,
      );
      await providerDelay(3000, signal);
    }
    throw new ServiceUnavailableException(
      `Meshy task ${id} exceeded the polling deadline. Check the provider dashboard before retrying.`,
    );
  }
}
