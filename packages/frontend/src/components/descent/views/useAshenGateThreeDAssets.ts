"use client";

import { isServiceError, type ThreeDAsset } from "@resync-game-framework/api";
import { useEffect, useState } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import {
  ASHEN_GATE_3D_ASSETS,
  type AshenGateAssetSet,
  resolveAshenGateAssets,
} from "../data/layers/ashen_gate/threeDAssets";

/** Result of loading the optional generated Ashen Gate model roster. */
export interface AshenGateThreeDAssetsState {
  assets: AshenGateAssetSet;
  message: string;
}

/**
 * Loads generated character, prop, and environment manifests. Gameplay does
 * not wait for this request; missing or unreachable models keep stand-ins.
 * @returns The resolved model roster and a short renderer status message
 */
export function useAshenGateThreeDAssets(): AshenGateThreeDAssetsState {
  const { clientServiceCallers } = useClientServiceCallers();
  const [state, setState] = useState<AshenGateThreeDAssetsState>({
    assets: {},
    message: "Loading generated Ashen Gate models…",
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      const results = await Promise.all([
        clientServiceCallers.threeDCharacter.list(),
        clientServiceCallers.threeDEnvironment.list(),
        clientServiceCallers.threeDProp.list(),
      ]);
      if (!active) return;
      const assets: ThreeDAsset[] = [];
      for (const result of results) {
        if (isServiceError(result)) {
          setState({
            assets: {},
            message: "Asset service offline · procedural army active",
          });
          return;
        }
        assets.push(...result.assets);
      }
      const resolved = resolveAshenGateAssets(assets);
      const count = Object.keys(resolved).length;
      setState({
        assets: resolved,
        message:
          count === 0
            ? "Generated roster not found · procedural army active"
            : `${count}/${ASHEN_GATE_3D_ASSETS.length} generated Ashen Gate models ready`,
      });
    };
    void load().catch(() => {
      if (!active) return;
      setState({
        assets: {},
        message: "Asset service offline · procedural army active",
      });
    });
    return () => {
      active = false;
    };
  }, [clientServiceCallers]);

  return state;
}
