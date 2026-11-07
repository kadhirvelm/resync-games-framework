import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Walks up from the current working directory until it finds a directory
 * containing `bun.lock`, which marks the monorepo root.
 * Throws if the root cannot be found.
 *
 * We do this to ensure we're able to run in any CI environment, especially Vercel's
 * environment.
 */
export function getRoot(): string {
  let dir = process.cwd();

  while (true) {
    if (existsSync(join(dir, "bun.lock"))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Root not found: no bun.lock found walking up from ${process.cwd()}`,
      );
    }

    dir = parent;
  }
}
