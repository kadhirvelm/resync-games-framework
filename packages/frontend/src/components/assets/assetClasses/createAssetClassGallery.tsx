"use client";

import type { ServiceError } from "@resync-game-framework/api";
import type { ReactNode } from "react";
import { useClientServiceCallers } from "@/services/clientServiceCallers";
import type { AvailableServiceCaller } from "@/services/helpers/types";
import { useCallService } from "@/services/useCallService";
import type { AssetGalleryProps } from "./assetClassDefinition";

/** What a gallery render function receives: workshop props plus the list request. */
export interface AssetClassGalleryState<ListResult> extends AssetGalleryProps {
  error: string | null;
  isLoading: boolean;
  result: ListResult | null;
}

/**
 * Builds the gallery component for an asset class. The workshop passes pending
 * jobs and a refresh key; this fetches `list` again whenever that key changes.
 * @param options - How to list this class, and how to render the list
 * @returns A gallery component matching {@link AssetGalleryProps}
 */
export function createAssetClassGallery<ListResult>(options: {
  list: (callers: AvailableServiceCaller) => Promise<ListResult | ServiceError>;
  render: (state: AssetClassGalleryState<ListResult>) => ReactNode;
}) {
  /**
   * @param props - Pending jobs and the refresh key from the workshop page
   */
  function AssetClassGallery(props: AssetGalleryProps) {
    const { clientServiceCallers } = useClientServiceCallers();
    const { error, isLoading, result } = useCallService(
      () => options.list(clientServiceCallers),
      [props.refreshKey],
    );

    return options.render({
      ...props,
      error,
      isLoading,
      result,
    });
  }

  return AssetClassGallery;
}
