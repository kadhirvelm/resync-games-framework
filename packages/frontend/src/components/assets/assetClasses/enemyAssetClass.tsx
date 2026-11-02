"use client";

import { Skull } from "lucide-react";
import { EnemyList } from "../EnemyList";
import type { AssetClassDefinition } from "./assetClassDefinition";
import { createAssetClassGallery } from "./createAssetClassGallery";

const EnemyGallery = createAssetClassGallery({
  list: (callers) => callers.enemy.list(),
  render: ({
    error,
    isLoading,
    onDismissJob,
    onStopJob,
    pendingJobs,
    result,
  }) => (
    <EnemyList
      error={error}
      isLoading={isLoading}
      onDismissJob={onDismissJob}
      onStopJob={onStopJob}
      pendingJobs={pendingJobs}
      result={result}
    />
  ),
});

export const ENEMY_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) => callers.enemy.cancel({ generationId }),
  category: "Characters",
  dialogDescription:
    "Describe an enemy. We'll check the Lore document, then paint one full-body portrait facing the player and give it a repeating attack cycle.",
  dialogTitle: "Generate Enemy",
  form: {
    hint: "Generates one watercolor creature on a white background, facing left toward the party, with a repeating attack and defend cycle.",
    placeholder:
      "e.g. a feral Coreborn with moss-covered antlers and a cracked bell",
    promptLabel: "Describe the enemy",
    submitLabel: "Generate enemy",
  },
  Gallery: EnemyGallery,
  generate: (callers, prompt, generationId) =>
    callers.enemy.generate({ generationId, prompt }),
  generateButtonLabel: "+ Generate enemy",
  Icon: Skull,
  id: "enemies",
  medium: "2d",
  subtitle: "enemy portrait generation",
  tabLabel: "Enemies",
};
