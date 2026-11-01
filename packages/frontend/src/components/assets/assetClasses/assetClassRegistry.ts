import type { AssetClassDefinition } from "./assetClassDefinition";
import { BATTLE_BACKGROUND_ASSET_CLASS } from "./battleBackgroundAssetClass";
import { CARD_CHARACTER_ASSET_CLASS } from "./cardCharacterAssetClass";
import { DUNGEON_ASSET_CLASS } from "./dungeonAssetClass";
import { ENEMY_ASSET_CLASS } from "./enemyAssetClass";
import { PLAYABLE_CARD_ASSET_CLASS } from "./playableCardAssetClass";
import { SPRITE_SHEET_ASSET_CLASS } from "./spriteSheetAssetClass";

/** Asset classes shown as tabs in the workshop, in tab order. The first is selected by default. */
export const ASSET_CLASSES: readonly AssetClassDefinition[] = [
  DUNGEON_ASSET_CLASS,
  CARD_CHARACTER_ASSET_CLASS,
  ENEMY_ASSET_CLASS,
  BATTLE_BACKGROUND_ASSET_CLASS,
  PLAYABLE_CARD_ASSET_CLASS,
  SPRITE_SHEET_ASSET_CLASS,
];
