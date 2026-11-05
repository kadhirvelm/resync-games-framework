import { readFile } from "node:fs/promises";
import type {
  AudioAsset,
  AudioGenerationPayload,
  ListAudioResponse,
} from "../packages/api/src/services/assetClasses/audio";
import {
  ASHEN_GATE_AUDIO,
  type AshenGateAudioSpec,
  ashenGateAudioPrompt,
} from "../packages/frontend/src/components/descent/data/layers/ashen_gate/audio";

/** Reads a positive `--concurrency=N`, defaulting to two provider jobs. */
function concurrencyForArguments(arguments_: readonly string[]): number {
  const option = arguments_.find((argument) =>
    argument.startsWith("--concurrency="),
  );
  if (option === undefined) return 2;
  const value = Number.parseInt(option.slice("--concurrency=".length), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Invalid --concurrency value: ${option}`);
  }
  return value;
}

/** Runs async work with a bounded number of provider calls. */
async function mapWithLimit<Input, Output>(
  items: readonly Input[],
  limit: number,
  work: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await work(items[index] as Input);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

/** Generates every missing clip in the Ashen Gate runtime manifest. */
async function generate(): Promise<void> {
  const arguments_ = Bun.argv.slice(2);
  const concurrency = concurrencyForArguments(arguments_);
  const urlArgument = arguments_.find((argument) => !argument.startsWith("--"));
  const configuredBase = process.env.BACKEND_API_URL?.trim();
  const base = new URL(
    urlArgument ?? configuredBase ?? "https://localhost:8080",
  );
  const isConfiguredBackend =
    configuredBase !== undefined &&
    base.origin === new URL(configuredBase).origin;
  if (
    !["localhost", "127.0.0.1"].includes(base.hostname) &&
    !isConfiguredBackend
  ) {
    throw new Error(
      "Descent audio generation must use localhost or the configured BACKEND_API_URL.",
    );
  }
  const tls =
    base.protocol === "https:"
      ? {
          ca: await readFile(
            new URL("../.certs/localhost.pem", import.meta.url),
            "utf8",
          ),
        }
      : undefined;

  /** Calls one audio service endpoint through the local development CA. */
  async function post<Output>(path: string, payload: unknown): Promise<Output> {
    const response = await fetch(new URL(path, base), {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      tls,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(`${path}: ${JSON.stringify(result)}`);
    return result as Output;
  }

  const listed = await post<ListAudioResponse>("/audio/list", {});
  const existing = new Map(
    listed.clips.map((clip) => [clip.prompt, clip] as const),
  );

  /** Returns a matching clip or renders it through the existing audio queue. */
  async function generateClip(spec: AshenGateAudioSpec): Promise<AudioAsset> {
    const prompt = ashenGateAudioPrompt(spec);
    const saved = existing.get(prompt);
    if (saved !== undefined) return saved;
    const payload: AudioGenerationPayload = {
      cue: spec.cue,
      generationId: crypto.randomUUID(),
      loop: spec.loop,
      prompt,
      role: spec.role,
      useLore: false,
    };
    return post<AudioAsset>("/audio/generate", payload);
  }

  const clips = await mapWithLimit(ASHEN_GATE_AUDIO, concurrency, generateClip);
  // biome-ignore lint/suspicious/noConsole: This developer command reports generated ids.
  console.log(
    JSON.stringify(
      {
        clips: clips.map((clip) => ({
          cue: clip.cue,
          id: clip.id,
          role: clip.role,
          title: clip.title,
        })),
        count: clips.length,
      },
      null,
      2,
    ),
  );
}

await generate();
