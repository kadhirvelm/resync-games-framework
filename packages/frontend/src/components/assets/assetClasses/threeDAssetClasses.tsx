import { Boxes } from "lucide-react";
import { threeDAssetCaller } from "@/services/threeDService";
import { ThreeDWorkshop } from "../threeD/ThreeDWorkshop";
import type { AssetClassDefinition } from "./assetClassDefinition";

/**
 * One studio for every 3D category (props, environments, characters). The
 * studio owns its own kind switcher, job tracking, and preview dialogs, so it
 * is registered once instead of once per category.
 * @returns The studio, defaulting to the prop category
 */
function ThreeDGallery() {
  return <ThreeDWorkshop />;
}

/** Single sidebar entry for the whole 3D model studio. */
export const THREE_D_ASSET_CLASS: AssetClassDefinition = {
  // The studio manages its own category switcher, job polling, and generate
  // controls; this entry point is required by the shared interface but the
  // workshop's generic prompt dialog is never shown for it.
  cancel: (callers, generationId) =>
    threeDAssetCaller(callers, "prop").cancel({ generationId }),
  category: "3D models",
  customGeneration: true,
  dialogDescription:
    "Plan a small world, or generate one model and inspect the validated GLB.",
  dialogTitle: "Build a 3D asset",
  form: {
    placeholder: "Describe a model",
    promptLabel: "Creative brief",
    submitLabel: "Generate",
  },
  Gallery: ThreeDGallery,
  generate: (callers, prompt, generationId) =>
    threeDAssetCaller(callers, "prop").generate({ generationId, prompt }),
  generateButtonLabel: "Generate 3D model",
  Icon: Boxes,
  id: "three-d-models",
  subtitle: "3D world and model studio",
  tabLabel: "3D models",
};
