import { createAssetClassModule } from "../shared/createAssetClassModule";
import { StaticImageController } from "./static-image.controller";
import { StaticImageService } from "./static-image.service";

export const StaticImageModule = createAssetClassModule({
  controller: StaticImageController,
  providers: [StaticImageService],
});
