import { StaticImageServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { StaticImageService } from "./static-image.service";

/** Generate, cancel, and list endpoints for standalone 2D images. */
export const StaticImageController = createAssetClassController(
  StaticImageServiceDefinition,
  StaticImageService,
);
