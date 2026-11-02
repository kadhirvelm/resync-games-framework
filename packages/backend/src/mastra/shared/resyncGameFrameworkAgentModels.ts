// ---------------------------------------------------------------------------
// Gemini model resolution helpers
// ---------------------------------------------------------------------------

import { createVertex, GoogleVertexProvider } from "@ai-sdk/google-vertex/edge";
import { AgentConfig } from "@mastra/core/agent";
import { ResyncGameFrameworkAgentConfig } from "./resyncGameFrameworkAgent";

/**
 * The model ID type accepted by the Vertex provider.
 * Extracted from `GoogleVertexProvider`'s callable signature so we don't
 * depend on an unexported internal type alias.
 */
export type VertexModelId = Parameters<GoogleVertexProvider>[0];

/**
 * Configuration for a Gemini model served through Google Vertex AI.
 *
 * When this object appears in the `model` field of {@link ResyncGameFrameworkAgentConfig}
 * it is resolved by `ResyncGameFrameworkAgentService` into a Mastra-compatible
 * `LanguageModel` backed by the Vertex AI SDK, using the `GEMINI_CREDENTIALS`
 * environment variable.
 *
 * @example
 * ```ts
 * // Pass as part of a mixed model fallback chain:
 * agentConfig: {
 *   model: [
 *     { provider: "google-vertex", model: "gemini-2.5-pro", maxRetries: 3 },
 *     { id: "fallback-anthropic", model: "anthropic/claude-sonnet-4-5", maxRetries: 2 },
 *   ],
 * }
 *
 * // Or use a preset from agentDefaults:
 * import { GEMINI_MODEL_CONFIG } from "./agentDefaults";
 * agentConfig: { model: GEMINI_MODEL_CONFIG }
 * ```
 */
export interface GeminiModelConfig {
  /** Discriminator - must be `"google-vertex"`. */
  provider: "google-vertex";
  /** Vertex model ID, e.g. `"gemini-2.5-pro"` or `"gemini-2.5-flash"`. */
  model: VertexModelId;
  /** Optional stable identifier used for logging / observability. */
  id?: string;
  /** Maximum retries on transient failures (default: 0). */
  maxRetries?: number;
  /** Whether this model entry is active in a fallback chain (default: true). */
  enabled?: boolean;
}

/**
 * A model entry that can appear in a mixed fallback array: either a standard
 * Mastra model-with-retries entry or a {@link GeminiModelConfig}.
 */
export type MixedModelEntry =
  | GeminiModelConfig
  | {
      id?: string;
      model: AgentConfig["model"] | Record<string, unknown>;
      maxRetries?: number;
      enabled?: boolean;
    };

/**
 * Runtime type-guard for {@link GeminiModelConfig}.
 */
function isGeminiModelConfig(value: unknown): value is GeminiModelConfig {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).provider === "google-vertex" &&
    typeof (value as Record<string, unknown>).model === "string"
  );
}

function getVertexProvider(
  geminiCredentials: string | undefined,
): GoogleVertexProvider | undefined {
  try {
    if (geminiCredentials == null) {
      return undefined;
    }

    const credentials = JSON.parse(geminiCredentials);
    const projectId = credentials.project_id;
    if (typeof projectId !== "string" || projectId.length === 0) {
      return undefined;
    }

    return createVertex({
      googleCredentials: {
        clientEmail: credentials.client_email,
        privateKey: credentials.private_key,
        privateKeyId: credentials.private_key_id,
      },
      location: "global",
      project: projectId,
    });
  } catch {
    return undefined;
  }
}

/**
 * Converts a single {@link GeminiModelConfig} into a Mastra-compatible
 * `ModelWithRetries`-shaped object whose `model` field is a concrete
 * `LanguageModel` from the Vertex AI SDK.
 */
function resolveGeminiEntry(
  entry: GeminiModelConfig,
  geminiCredentials: string | undefined,
) {
  const vertex = getVertexProvider(geminiCredentials);
  if (vertex == null) {
    throw new Error(
      "Cannot use a GeminiModelConfig: GEMINI_CREDENTIALS is not set or is invalid. " +
        "Please configure the environment variable with a valid Google service-account key.",
    );
  }

  return {
    enabled: entry.enabled ?? true,
    id: entry.id ?? `vertex-${entry.model}`,
    maxRetries: entry.maxRetries ?? 0,
    model: vertex(entry.model),
  };
}

/**
 * If `model` contains any {@link GeminiModelConfig} entries, resolve them into
 * concrete Vertex AI SDK language-model instances. Non-Gemini entries are passed
 * through unchanged.
 *
 * Handles three shapes:
 *  1. A single `GeminiModelConfig` object - resolved into an array with one entry.
 *  2. An array that may mix `GeminiModelConfig` with standard entries - each
 *     Gemini entry is resolved in-place.
 *  3. Any other value (string, LanguageModel, function, etc.) - returned as-is.
 */
export function resolveModelConfig(
  model: MixedModelEntry | MixedModelEntry[],
  geminiCredentials: string | undefined,
): AgentConfig["model"] {
  // Single GeminiModelConfig
  if (isGeminiModelConfig(model)) {
    return [resolveGeminiEntry(model, geminiCredentials)];
  }

  // Array - may mix Gemini and non-Gemini entries
  if (Array.isArray(model)) {
    const hasGemini = model.some((entry) => isGeminiModelConfig(entry));
    if (!hasGemini) {
      return model as AgentConfig["model"];
    }

    return model.map((entry) => {
      if (isGeminiModelConfig(entry)) {
        return resolveGeminiEntry(entry, geminiCredentials);
      }

      return entry;
    }) as AgentConfig["model"];
  }

  // Everything else (string id, LanguageModel instance, function, etc.)
  return model as AgentConfig["model"];
}
