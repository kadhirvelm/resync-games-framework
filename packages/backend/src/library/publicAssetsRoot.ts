import { isAbsolute, join, resolve } from "node:path";

/** URL prefix `runtimes/main.ts` serves the public assets directory under. */
export const PUBLIC_ASSETS_URL_PREFIX = "/static";

/**
 * Absolute directory served at {@link PUBLIC_ASSETS_URL_PREFIX}. Development
 * and tests read and write `packages/backend/src/public` so generated files
 * survive rebuilds; production uses the copy under `dist/public`.
 * Resolved from this file, so it is the same for every caller.
 * @returns Absolute path to the public assets directory
 */
export function getPublicAssetsRootPath(): string {
  const configuredRoot = process.env.PUBLIC_ASSETS_ROOT?.trim();
  if (configuredRoot) {
    return isAbsolute(configuredRoot)
      ? configuredRoot
      : resolve(process.cwd(), configuredRoot);
  }
  const backendPackageRoot = join(__dirname, "..", "..");
  if (process.env.NODE_ENV === "production") {
    return join(backendPackageRoot, "dist", "public");
  }
  return join(backendPackageRoot, "src", "public");
}

/**
 * Builds a public URL path under {@link PUBLIC_ASSETS_URL_PREFIX}, encoding each segment.
 * @param segments - Path segments below the public root, e.g. `["card-characters", "set-1", "a.webp"]`
 * @returns A path such as `/static/card-characters/set-1/a.webp`
 */
export function buildPublicAssetUrlPath(...segments: string[]): string {
  const encoded = segments
    .flatMap((segment) => segment.split("/"))
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment));
  return [PUBLIC_ASSETS_URL_PREFIX, ...encoded].join("/");
}
