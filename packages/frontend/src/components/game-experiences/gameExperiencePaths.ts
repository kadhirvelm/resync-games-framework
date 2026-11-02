import type { GameExperienceId } from "./gameExperienceTypes";

/** Game ids that own a top-level path. */
export const GAME_EXPERIENCE_IDS = [
  "descent",
  "three-d-sandbox",
  "towers-of-coreborn",
] as const satisfies readonly GameExperienceId[];

/** Query keys a game may keep when an old library link is redirected. */
const PLAY_QUERY_KEYS = ["asset", "kind", "prototype"] as const;

/**
 * @param value - Path segment or `experience` query value
 * @returns Whether it names a registered game
 */
export function isGameExperienceId(value: string): value is GameExperienceId {
  return (GAME_EXPERIENCE_IDS as readonly string[]).includes(value);
}

/**
 * @param id - Registered game
 * @returns Path that stays on that game across refresh
 */
export function gameExperiencePath(id: GameExperienceId): string {
  return `/${id}`;
}

/**
 * @param query - Optional playground deep-link fields
 * @returns The 3D sandbox path, with a query string when one was provided
 */
export function threeDSandboxHref(
  query: { asset?: string; kind?: string; prototype?: string } = {},
): string {
  const params = new URLSearchParams();
  if (query.prototype) params.set("prototype", query.prototype);
  if (query.asset) params.set("asset", query.asset);
  if (query.kind) params.set("kind", query.kind);
  const search = params.toString();
  const path = gameExperiencePath("three-d-sandbox");
  return search === "" ? path : `${path}?${search}`;
}

/**
 * Turns a legacy `/?experience=` library link into that game's path.
 * Playground fields (`prototype`, `asset`, `kind`) are kept.
 * @param search - Home-route query
 * @returns The game path, or null when the query is not a game link
 */
export function legacyExperienceRedirectTarget(
  search: Record<string, string | string[] | undefined>,
): string | null {
  const experience = firstQueryValue(search.experience);
  if (experience === undefined || !isGameExperienceId(experience)) {
    return null;
  }
  const params = new URLSearchParams();
  for (const key of PLAY_QUERY_KEYS) {
    const value = firstQueryValue(search[key]);
    if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  const path = gameExperiencePath(experience);
  return query === "" ? path : `${path}?${query}`;
}

/**
 * @param value - One query field, which Next may repeat
 * @returns The first string value
 */
function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
