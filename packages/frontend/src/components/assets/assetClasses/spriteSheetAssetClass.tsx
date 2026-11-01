"use client";

import { SpriteSheetList } from "../SpriteSheetList";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

const SpriteSheetGallery = createAssetClassGallery({
  list: (callers) => callers.spriteSheet.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <SpriteSheetList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

export const SPRITE_SHEET_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    callers.spriteSheet.cancel({ generationId }),
  dialogDescription:
    "Describe a character. We'll check the Lore document, paint a pixel-art identity anchor, then paint one sheet from it and split it into idle, attack, defend, and hurt animations.",
  dialogTitle: "Generate Sprite Sheet",
  form: {
    hint: "Party members face right and enemies face left. Each animation is cut out, put on a transparent background, and lined up on the same foot baseline.",
    placeholder:
      "e.g. a soot-covered inventor who swings a wrench and guards with clockwork wings",
    promptLabel: "Describe the character to animate",
    submitLabel: "Generate sprite sheet",
  },
  Gallery: SpriteSheetGallery,
  generate: (callers, prompt, generationId) =>
    callers.spriteSheet.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate sprite sheet",
  id: "sprite-sheets",
  subtitle: "animated sprite sheet generation",
  tabLabel: "Sprite sheets",
};
