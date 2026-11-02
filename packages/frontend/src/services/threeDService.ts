import type { ThreeDAssetKind } from "@resync-game-framework/api";
import type { AvailableServiceCaller } from "./helpers/types";

/** Returns the generated API client for a 3D category. */
export function threeDAssetCaller(
  callers: AvailableServiceCaller,
  kind: ThreeDAssetKind,
) {
  if (kind === "character") return callers.threeDCharacter;
  if (kind === "environment") return callers.threeDEnvironment;
  return callers.threeDProp;
}

/** Encodes a bounded browser GLB for the ingestion service. */
export async function readGlbUpload(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith(".glb") || file.size > 20 * 1024 * 1024)
    throw new Error("Choose a self-contained .glb file under 20 MiB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read GLB file."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}
