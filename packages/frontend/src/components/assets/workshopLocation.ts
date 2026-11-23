/** Query key that names the generator on screen, e.g. `/assets?generator=audio`. */
export const GENERATOR_QUERY_KEY = "generator";

/**
 * Reads the generator named in a query string, if it is one the workshop has.
 * @param search - `location.search`, with or without the leading `?`
 * @param knownIds - Registered generator ids
 * @returns The generator id, or `null` when absent or unknown
 */
export function readGeneratorFromSearch(
  search: string,
  knownIds: readonly string[],
): string | null {
  const requested = new URLSearchParams(search).get(GENERATOR_QUERY_KEY);
  if (requested === null || !knownIds.includes(requested)) {
    return null;
  }
  return requested;
}

/**
 * Builds the same-page address that selects a generator, keeping any other
 * query values and the hash.
 * @param href - Current absolute address
 * @param generatorId - Generator to select
 * @returns Path, query, and hash for `history.replaceState`
 */
export function hrefWithGenerator(href: string, generatorId: string): string {
  const url = new URL(href);
  url.searchParams.set(GENERATOR_QUERY_KEY, generatorId);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Query key for a prefilled prompt on any generator, e.g. `/assets?prompt=...`. */
export const PROMPT_QUERY_KEY = "prompt";

/** Query key for a preferred generation provider, e.g. `/assets?provider=meshy`. */
export const PROVIDER_QUERY_KEY = "provider";

/** Query key for a canonical asset name, e.g. `/assets?name=Descent+Spirit+Array`. */
export const NAME_QUERY_KEY = "name";

/**
 * Reads a prefilled generation brief from a shared workshop link.
 * @param search - `location.search`, with or without the leading `?`
 * @returns The decoded prompt, or `null` when absent
 */
export function readPromptFromSearch(search: string): string | null {
  const prompt = new URLSearchParams(search).get(PROMPT_QUERY_KEY);
  return prompt === null || prompt.trim() === "" ? null : prompt;
}

/**
 * Builds a workshop link that pre-fills the prompt, provider, and asset name
 * for one-click generate/remix flows from game rosters and saved assets.
 * @param options - Generator id, prompt, optional provider and canonical name
 * @returns Relative `/assets` URL with query parameters
 */
export function workshopGenerateHref(options: {
  generatorId: string;
  prompt: string;
  provider?: string;
  name?: string;
}): string {
  const params = new URLSearchParams({
    [GENERATOR_QUERY_KEY]: options.generatorId,
    [PROMPT_QUERY_KEY]: options.prompt,
  });
  if (options.provider !== undefined) {
    params.set(PROVIDER_QUERY_KEY, options.provider);
  }
  if (options.name !== undefined) {
    params.set(NAME_QUERY_KEY, options.name);
  }
  return `/assets?${params.toString()}`;
}
