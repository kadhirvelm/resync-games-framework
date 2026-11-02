"use client";

import { UserRound } from "lucide-react";
import { CardCharacterList } from "../CardCharacterList";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

const CardCharacterGallery = createAssetClassGallery({
  list: (callers) => callers.cardCharacter.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <CardCharacterList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

export const CARD_CHARACTER_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    callers.cardCharacter.cancel({ generationId }),
  category: "Characters",
  dialogDescription:
    "Describe a character. We'll paint four portraits of them facing you, each level stronger than the last.",
  dialogTitle: "Generate Card Character",
  form: {
    hint: "Generates four portraits of the same character facing you, from weakest to strongest.",
    placeholder: "e.g. a soot-covered inventor who builds clockwork wings",
    promptLabel: "Describe the character",
    submitLabel: "Generate 4 levels",
  },
  Gallery: CardCharacterGallery,
  generate: (callers, prompt, generationId) =>
    callers.cardCharacter.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate character",
  Icon: UserRound,
  id: "card-characters",
  subtitle: "card character generation",
  tabLabel: "Card characters",
};
