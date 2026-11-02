import { BattleBackgroundServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { BattleBackgroundService } from "./battle-background.service";

/** `generate` and `list` endpoints for battle-room backgrounds. */
export const BattleBackgroundController = createAssetClassController(
  BattleBackgroundServiceDefinition,
  BattleBackgroundService,
);
