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
