import { SpriteSheetServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { SpriteSheetService } from "./sprite-sheet.service";

/** `generate`, `cancel`, and `list` endpoints for animated sprite sheets. */
export const SpriteSheetController = createAssetClassController(
  SpriteSheetServiceDefinition,
  SpriteSheetService,
);
