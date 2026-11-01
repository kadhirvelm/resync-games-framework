const MAX_RETURN_PATH_LENGTH = 512;

/**
 * Accepts a same-origin frontend path to return to after OAuth.
 * Absolute URLs, protocol-relative paths, and backslash tricks are refused so
 * the callback cannot redirect off the frontend.
 * @param value - Untrusted `returnTo` query value
 * @returns The path, or undefined when it is missing or unsafe
 */
export function sanitizeReturnPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (value.length === 0 || value.length > MAX_RETURN_PATH_LENGTH) {
    return undefined;
  }
  if (!value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  if (/[\\\s]/.test(value)) {
    return undefined;
  }
  return value;
}

/**
 * Builds the frontend URL the OAuth callback redirects to.
 * @param frontendUrl - Frontend origin, with or without a trailing slash
 * @param returnTo - Sanitized path, or undefined for the home route
 * @param params - Query parameters to add, such as `productNow=connected`
 * @returns Absolute redirect URL on the frontend origin
 */
export function buildFrontendRedirect(
  frontendUrl: string,
  returnTo: string | undefined,
  params: Record<string, string>,
): string {
  const origin = frontendUrl.replace(/\/$/, "");
  const url = new URL(`${origin}${returnTo ?? "/"}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}
