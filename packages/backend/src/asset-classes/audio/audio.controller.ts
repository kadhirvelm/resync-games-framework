import { AudioServiceDefinition } from "@towers-of-coreborn/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { AudioService } from "./audio.service";

/** `generate` and `list` endpoints for audio clips. */
export const AudioController = createAssetClassController(
  AudioServiceDefinition,
  AudioService,
);
