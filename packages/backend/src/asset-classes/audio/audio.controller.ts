import { AudioServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { AudioService } from "./audio.service";

/** `generate` and `list` endpoints for audio clips. */
export const AudioController = createAssetClassController(
  AudioServiceDefinition,
  AudioService,
);
