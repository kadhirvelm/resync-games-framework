import { Box, Globe2, Mountain, PersonStanding } from "lucide-react";
import { threeDAssetCaller } from "@/services/threeDService";
import { ThreeDWorkshop } from "../threeD/ThreeDWorkshop";
import type { AssetClassDefinition } from "./assetClassDefinition";

/** @returns The package-oriented 3D world planner. */
function ThreeDWorldGallery() {
  return <ThreeDWorkshop mode="worlds" />;
}

/** @returns Character generation, imports, previews, and character library. */
function ThreeDCharacterGallery() {
  return <ThreeDWorkshop initialKind="character" mode="assets" />;
}

/** @returns Prop generation, imports, previews, and prop library. */
function ThreeDPropGallery() {
  return <ThreeDWorkshop initialKind="prop" mode="assets" />;
}

/** @returns Environment generation, imports, previews, and environment library. */
function ThreeDEnvironmentGallery() {
  return <ThreeDWorkshop initialKind="environment" mode="assets" />;
}

/** Dedicated package-planning entry, separate from individual model libraries. */
export const THREE_D_WORLD_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    threeDAssetCaller(callers, "prop").cancel({ generationId }),
  category: "Models",
  customGeneration: true,
  dialogDescription:
    "Plan a coherent world package, fill its model slots, and launch it in the playground.",
  dialogTitle: "Plan a 3D world",
  form: {
    placeholder: "Describe a small 3D world",
    promptLabel: "Creative brief",
    submitLabel: "Plan world",
  },
  Gallery: ThreeDWorldGallery,
  generate: (callers, prompt, generationId) =>
    threeDAssetCaller(callers, "prop").generate({ generationId, prompt }),
  generateButtonLabel: "Plan 3D world",
  Icon: Globe2,
  id: "three-d-worlds",
  medium: "3d",
  subtitle: "Multi-model world packages",
  tabLabel: "Worlds",
};

/** Character-only workshop entry with a directly filtered library. */
export const THREE_D_CHARACTER_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    threeDAssetCaller(callers, "character").cancel({ generationId }),
  category: "Models",
  customGeneration: true,
  dialogDescription:
    "Create, import, inspect, and animate game-ready 3D characters.",
  dialogTitle: "Create a 3D character",
  form: {
    placeholder: "Describe a character",
    promptLabel: "Character brief",
    submitLabel: "Generate character",
  },
  Gallery: ThreeDCharacterGallery,
  generate: (callers, prompt, generationId) =>
    threeDAssetCaller(callers, "character").generate({
      generationId,
      prompt,
    }),
  generateButtonLabel: "Generate character",
  Icon: PersonStanding,
  id: "three-d-characters",
  medium: "3d",
  subtitle: "Rigged characters and animation clips",
  tabLabel: "Characters",
};

/** Prop-only workshop entry with a directly filtered library. */
export const THREE_D_PROP_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    threeDAssetCaller(callers, "prop").cancel({ generationId }),
  category: "Models",
  customGeneration: true,
  dialogDescription:
    "Create, import, inspect, and reuse buildings, resources, and set dressing.",
  dialogTitle: "Create a 3D prop",
  form: {
    placeholder: "Describe a prop or building",
    promptLabel: "Prop brief",
    submitLabel: "Generate prop",
  },
  Gallery: ThreeDPropGallery,
  generate: (callers, prompt, generationId) =>
    threeDAssetCaller(callers, "prop").generate({ generationId, prompt }),
  generateButtonLabel: "Generate prop",
  Icon: Box,
  id: "three-d-props",
  medium: "3d",
  subtitle: "Buildings, objects, and set dressing",
  tabLabel: "Props",
};

/** Environment-only workshop entry with a directly filtered library. */
export const THREE_D_ENVIRONMENT_ASSET_CLASS: AssetClassDefinition = {
  cancel: (callers, generationId) =>
    threeDAssetCaller(callers, "environment").cancel({ generationId }),
  category: "Models",
  customGeneration: true,
  dialogDescription:
    "Create, import, inspect, and reuse complete 3D battle environments.",
  dialogTitle: "Create a 3D environment",
  form: {
    placeholder: "Describe an open battle environment",
    promptLabel: "Environment brief",
    submitLabel: "Generate environment",
  },
  Gallery: ThreeDEnvironmentGallery,
  generate: (callers, prompt, generationId) =>
    threeDAssetCaller(callers, "environment").generate({
      generationId,
      prompt,
    }),
  generateButtonLabel: "Generate environment",
  Icon: Mountain,
  id: "three-d-environments",
  medium: "3d",
  subtitle: "Battlefields and playable spaces",
  tabLabel: "Environments",
};

/** All 3D tabs in their intended sidebar order. */
export const THREE_D_ASSET_CLASSES = [
  THREE_D_WORLD_ASSET_CLASS,
  THREE_D_CHARACTER_ASSET_CLASS,
  THREE_D_PROP_ASSET_CLASS,
  THREE_D_ENVIRONMENT_ASSET_CLASS,
] as const;
