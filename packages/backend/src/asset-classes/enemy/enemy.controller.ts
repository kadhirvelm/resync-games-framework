import { EnemyServiceDefinition } from "@resync-game-framework/api";
import { createAssetClassController } from "../shared/createAssetClassController";
import { EnemyService } from "./enemy.service";

/** `generate`, `cancel`, and `list` endpoints for enemy portraits. */
export const EnemyController = createAssetClassController(
  EnemyServiceDefinition,
  EnemyService,
);
