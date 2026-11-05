import { isServiceError, type ThreeDAsset } from "@resync-game-framework/api";
import type { AvailableServiceCaller } from "@/services/helpers/types";
import {
  type AshenGateTextureSet,
  resolveAshenGateTextures,
} from "../data/layers/ashen_gate/environmentArt";
import {
  type AshenGateAssetSet,
  resolveAshenGateAssets,
} from "../data/layers/ashen_gate/threeDAssets";

/** Result of loading the optional generated Ashen Gate model roster. */
export interface AshenGateThreeDAssetsState {
  assets: AshenGateAssetSet;
  /** Generated ground, cliff, and lava paintings that exist so far. */
  textures: AshenGateTextureSet;
}

/**
 * Lists generated character, prop, and environment models and the painted
 * terrain textures, then picks the ones Ashen Gate uses. Missing or
 * unreachable art resolves to an empty set so procedural stand-ins stay.
 * @param callers - Browser service callers
 * @returns The resolved models and textures; never rejects
 */
export async function loadAshenGateThreeDAssets(
  callers: AvailableServiceCaller,
): Promise<AshenGateThreeDAssetsState> {
  try {
    const [images, ...results] = await Promise.all([
      callers.staticImage.list(),
      callers.threeDCharacter.list(),
      callers.threeDEnvironment.list(),
      callers.threeDProp.list(),
    ]);
    const textures = isServiceError(images)
      ? {}
      : resolveAshenGateTextures(images.staticImages);
    const assets: ThreeDAsset[] = [];
    for (const result of results) {
      if (isServiceError(result)) return { assets: {}, textures };
      assets.push(...result.assets);
    }
    return { assets: resolveAshenGateAssets(assets), textures };
  } catch {
    return { assets: {}, textures: {} };
  }
}
