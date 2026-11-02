import { readFile } from "node:fs/promises";
import type {
  ThreeDAsset,
  ThreeDJob,
  ThreeDPrototype,
} from "../packages/api/src/services/assetClasses/threeD";

/** Local-only end-to-end demo verification. Never submits paid/model-provider jobs. */
async function verify(): Promise<void> {
  const base = new URL(process.env.BACKEND_API_URL ?? "https://localhost:8080");
  if (!["localhost", "127.0.0.1"].includes(base.hostname))
    throw new Error(
      "Smoke verification is local-only. Point BACKEND_API_URL at localhost.",
    );
  const tls =
    base.protocol === "https:"
      ? {
          ca: await readFile(
            new URL("../.certs/localhost.pem", import.meta.url),
            "utf8",
          ),
        }
      : undefined;
  /** Calls a local 3D service and reports an actionable API failure. */
  async function post<T>(path: string, payload: unknown): Promise<T> {
    const response = await fetch(new URL(path, base), {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      tls,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${path}: ${JSON.stringify(result)}`);
    return result as T;
  }
  const prototype = await post<ThreeDPrototype>("/three-d-workshop/create", {
    demo: true,
    name: "Starter garden · verified demo",
    prompt: "A jade garden, wandering keeper, and three aether beacons",
  });
  const assets: ThreeDAsset[] = [];
  for (const slot of prototype.slots) {
    const job = await post<ThreeDJob>("/three-d-workshop/start", {
      generationId: crypto.randomUUID(),
      kind: slot.kind,
      prompt: slot.prompt,
      prototypeId: prototype.id,
      provider: "demo",
      slotId: slot.id,
    });
    const deadline = Date.now() + 30_000;
    let asset: ThreeDAsset | undefined;
    while (Date.now() < deadline) {
      const state = await post<{ jobs: ThreeDJob[] }>(
        "/three-d-workshop/list",
        {},
      );
      const current = state.jobs.find(
        (entry) => entry.generationId === job.generationId,
      );
      if (current?.error) throw new Error(current.error);
      if (current?.asset) {
        asset = current.asset;
        break;
      }
      await Bun.sleep(100);
    }
    if (!asset) throw new Error(`Timed out generating ${slot.name}`);
    const model = await fetch(asset.url, { tls });
    if (
      !model.ok ||
      (await model.arrayBuffer()).byteLength !== asset.validation.bytes
    )
      throw new Error(`Stored GLB is unreachable: ${asset.name}`);
    const preview = await fetch(asset.thumbnailUrl, { tls });
    if (
      !preview.ok ||
      !preview.headers.get("content-type")?.includes("image/png")
    )
      throw new Error(`Preview is unreachable: ${asset.name}`);
    assets.push(asset);
  }
  const source = assets.find((asset) => asset.kind === "prop");
  if (!source) throw new Error("Missing generated prop for ingestion check.");
  const importedBytes = new Uint8Array(
    await (await fetch(source.url, { tls })).arrayBuffer(),
  );
  const imported = await post<ThreeDAsset>("/three-d-props/ingest", {
    fileName: "beacon.glb",
    glbBase64: Buffer.from(importedBytes).toString("base64"),
    name: "Imported verification beacon",
  });
  if (!imported.validation.valid || imported.provenance.provider !== "upload")
    throw new Error("Manual GLB ingestion failed.");
  const state = await post<{ prototypes: ThreeDPrototype[] }>(
    "/three-d-workshop/list",
    {},
  );
  const saved = state.prototypes.find((value) => value.id === prototype.id);
  if (!saved || saved.slots.some((slot) => !slot.asset))
    throw new Error("Package did not hydrate all generated slots.");
  // biome-ignore lint/suspicious/noConsole: This is a developer verification script.
  console.log(
    JSON.stringify(
      {
        models: assets.map((asset) => ({
          animations: asset.validation.animations.map((clip) => clip.name),
          bytes: asset.validation.bytes,
          kind: asset.kind,
          triangles: asset.validation.triangles,
        })),
        play: `/three-d-sandbox?prototype=${prototype.id}`,
        prototypeId: prototype.id,
      },
      null,
      2,
    ),
  );
}

await verify();
