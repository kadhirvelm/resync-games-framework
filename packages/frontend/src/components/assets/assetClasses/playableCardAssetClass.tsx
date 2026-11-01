"use client";

import { Layers } from "lucide-react";
import { PlayableCardList } from "../PlayableCardList";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

const PlayableCardGallery = createAssetClassGallery({
  list: (callers) => callers.playableCard.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <PlayableCardList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

export const PLAYABLE_CARD_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    callers.playableCard.cancel({ generationId }),
  category: "Cards",
  dialogDescription:
    "Describe a card. We'll search the Lore document, then write its flavor, rules, and illustration.",
  dialogTitle: "Generate Playable Card",
  form: {
    hint: "Needs ProductNow connected. The description is written from Lore passages, and the effects stay in the combat toolkit.",
    placeholder: "e.g. a card about bonding a Coreborn on the lower floors",
    promptLabel: "Describe the card",
    submitLabel: "Generate card",
  },
  Gallery: PlayableCardGallery,
  generate: (callers, prompt, generationId) =>
    callers.playableCard.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate card",
  Icon: Layers,
  id: "playable-cards",
  subtitle: "playable card generation",
  tabLabel: "Playable cards",
};
