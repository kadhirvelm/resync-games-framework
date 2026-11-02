import { CardCharacterServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { CardCharacterService } from "./card-character.service";

/** `POST /card-characters/generate` and `POST /card-characters/list`. */
export const CardCharacterController = createAssetClassController(
  CardCharacterServiceDefinition,
  CardCharacterService,
);
