import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigurationService } from "src/configuration/configuration.service";
import { THREE_D_LIMITS } from "./threeDSchemas";

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

/** Meshy's asynchronous preview/refine adapter; credentials never leave the backend. */
@Injectable()
export class MeshyProvider {
  public constructor(private readonly configuration: ConfigurationService) {}
  /** @returns Whether a server-side Meshy credential is configured. */
  public configured(): boolean {
    return this.configuration.get("MESHY_API_KEY").length > 0;
  }

  /**
   * Makes one bounded, authenticated Meshy API request without automatic POST retries.
   * @param path - Fixed API-relative task route
   * @param method - Read, create, or best-effort pending-task deletion
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
    const response = await fetch(
      `https://api.meshy.ai/openapi/v2/text-to-3d${path}`,
      {
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          Authorization: `Bearer ${this.configuration.get("MESHY_API_KEY")}`,
          "Content-Type": "application/json",
        },
        method,
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
      },
    );
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Meshy returned ${response.status}. Check API credits, credentials, and provider availability.`,
      );
    if (method === "DELETE") return {};
    return response.json();
  }

  /**
   * Submits geometry and texture jobs, polls status and downloads a bounded GLB.
   * In-progress jobs cannot be cancelled by Meshy; pending jobs are removed best effort.
   * @param prompt - Structured art description
   * @param signal - Shared generation cancellation
   * @param report - Durable job progress and provider-id callback
   * @returns GLB bytes and both provider task ids
   */
  public async generate(
    prompt: string,
    signal: AbortSignal,
    report: (stage: string, progress: number, jobId?: string) => Promise<void>,
    resumeJobIds: string[] = [],
    beforeSubmit: (phase: "preview" | "refine") => Promise<void> = async () =>
      undefined,
  ): Promise<{ bytes: Uint8Array; jobIds: string[] }> {
    if (!this.configured())
      throw new BadRequestException(
        "Set MESHY_API_KEY on the backend, or choose Low-poly AI / Demo.",
      );
    if (
      resumeJobIds.length > 2 ||
      resumeJobIds.some((id) => !/^[a-zA-Z0-9-]+$/.test(id))
    )
      throw new BadRequestException("Invalid saved Meshy task ids.");
    const jobIds = [...resumeJobIds];
    let activeId = jobIds[0];
    try {
      if (!activeId) {
        await beforeSubmit("preview");
        const preview = await this.request("", "POST", signal, {
          ai_model: "meshy-6",
          mode: "preview",
          prompt: prompt.slice(0, 800),
          should_remesh: true,
          target_formats: ["glb"],
          target_polycount: 12000,
          topology: "triangle",
        });
        if (
          typeof preview.result !== "string" ||
          !/^[a-zA-Z0-9-]+$/.test(preview.result)
        )
          throw new ServiceUnavailableException("Meshy returned no task id.");
        activeId = preview.result;
        jobIds.push(activeId);
        await report("Meshy geometry", 10, activeId);
      }
      if (jobIds.length === 1) {
        if (!activeId)
          throw new ServiceUnavailableException("Missing Meshy preview id.");
        await this.poll(activeId, signal, report, 10, 40);
        await beforeSubmit("refine");
        const refine = await this.request("", "POST", signal, {
          enable_pbr: false,
          mode: "refine",
          preview_task_id: activeId,
          target_formats: ["glb"],
          texture_resolution: "2k",
        });
        if (
          typeof refine.result !== "string" ||
          !/^[a-zA-Z0-9-]+$/.test(refine.result)
        )
          throw new ServiceUnavailableException(
            "Meshy returned no texture task id.",
          );
        activeId = refine.result;
        jobIds.push(activeId);
        await report("Meshy textures", 50, activeId);
      }
      activeId = jobIds[1];
      if (!activeId)
        throw new ServiceUnavailableException("Missing Meshy refine id.");
      const task = await this.poll(activeId, signal, report, 50, 40);
      const urls = task.model_urls as { glb?: string } | undefined;
      if (!urls?.glb)
        throw new ServiceUnavailableException(
          "Meshy completed without a GLB result.",
        );
      const url = new URL(urls.glb);
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
        throw new ServiceUnavailableException(
          "Unable to download Meshy result.",
        );
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
      return { bytes: Buffer.concat(chunks), jobIds };
    } catch (error) {
      if (signal.aborted && activeId) {
        await this.request(
          `/${activeId}`,
          "DELETE",
          AbortSignal.timeout(10_000),
        ).catch(() => undefined);
      }
      throw error;
    }
  }

  /** Polls a bounded job until success or actionable provider failure. */
  private async poll(
    id: string,
    signal: AbortSignal,
    report: (stage: string, progress: number) => Promise<void>,
    base: number,
    range: number,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const task = await this.request(`/${id}`, "GET", signal);
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
