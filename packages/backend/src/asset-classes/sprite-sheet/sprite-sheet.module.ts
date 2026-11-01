import { createAssetClassModule } from "../shared/createAssetClassModule";
import { SpriteSheetController } from "./sprite-sheet.controller";
import { SpriteSheetService } from "./sprite-sheet.service";

export const SpriteSheetModule = createAssetClassModule({
  controller: SpriteSheetController,
  providers: [SpriteSheetService],
});
