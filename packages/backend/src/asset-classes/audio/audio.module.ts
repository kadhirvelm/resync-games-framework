import { createAssetClassModule } from "../shared/createAssetClassModule";
import { AudioController } from "./audio.controller";
import { AudioService } from "./audio.service";

export const AudioModule = createAssetClassModule({
  controller: AudioController,
  providers: [AudioService],
});
