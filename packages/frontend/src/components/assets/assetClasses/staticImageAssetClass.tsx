"use client";

import { ImageIcon } from "lucide-react";
import { StaticImageList } from "../StaticImageList";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

const StaticImageGallery = createAssetClassGallery({
  list: (callers) => callers.staticImage.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <StaticImageList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

/** Workshop definition for generic standalone 2D image generation. */
export const STATIC_IMAGE_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    callers.staticImage.cancel({ generationId }),
  category: "Images",
  dialogDescription:
    "Describe a standalone 2D game asset. The generator chooses an appropriate canvas and stores the finished image in the Workshop.",
  dialogTitle: "Generate 2D Image",
  form: {
    hint: "For UI icons and cutouts, ask for a transparent background and a clear silhouette. You can also request illustrations, textures, or backdrops.",
    placeholder:
      "e.g. a hand-painted bundle of golden wheat, isolated on a transparent background, no text or frame",
    promptLabel: "Describe the image",
    submitLabel: "Generate image",
  },
  Gallery: StaticImageGallery,
  generate: (callers, prompt, generationId) =>
    callers.staticImage.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate image",
  Icon: ImageIcon,
  id: "static-images",
  medium: "2d",
  subtitle: "icons, cutouts, textures, and illustrations",
  tabLabel: "Static Images",
};
