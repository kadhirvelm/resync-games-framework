import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes an asset into a private sibling directory and publishes it with one rename.
 * If another retry already published the same deterministic id, its complete
 * directory wins and the duplicate staging directory is discarded.
 * @param finalDirectory - Public directory named by the generation id
 * @param write - Callback that writes every required file into a private directory
 */
export async function writeAssetDirectoryAtomically(
  finalDirectory: string,
  write: (pendingDirectory: string) => Promise<void>,
): Promise<void> {
  await mkdir(dirname(finalDirectory), { recursive: true });
  const pendingDirectory = `${finalDirectory}.pending-${randomUUID()}`;
  await mkdir(pendingDirectory);
  try {
    await write(pendingDirectory);
    try {
      await rename(pendingDirectory, finalDirectory);
    } catch (error) {
      if (!(await pathExists(finalDirectory))) throw error;
    }
  } finally {
    await rm(pendingDirectory, { force: true, recursive: true });
  }
}

/** @returns Whether a path exists without exposing filesystem error details. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
