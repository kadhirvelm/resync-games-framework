import type { AssetClassDefinition } from "./assetClassDefinition";
import { AUDIO_ASSET_CLASS } from "./audioAssetClass";
import { BATTLE_BACKGROUND_ASSET_CLASS } from "./battleBackgroundAssetClass";
import { CARD_CHARACTER_ASSET_CLASS } from "./cardCharacterAssetClass";
import { DUNGEON_ASSET_CLASS } from "./dungeonAssetClass";
import { ENEMY_ASSET_CLASS } from "./enemyAssetClass";
import { PLAYABLE_CARD_ASSET_CLASS } from "./playableCardAssetClass";
import { SPRITE_SHEET_ASSET_CLASS } from "./spriteSheetAssetClass";
import { THREE_D_ASSET_CLASS } from "./threeDAssetClasses";

/** Asset classes shown in the workshop sidebar, grouped by category in this order. The first is selected by default. */
export const ASSET_CLASSES: readonly AssetClassDefinition[] = [
  DUNGEON_ASSET_CLASS,
  AUDIO_ASSET_CLASS,
  THREE_D_ASSET_CLASS,
  CARD_CHARACTER_ASSET_CLASS,
  ENEMY_ASSET_CLASS,
  BATTLE_BACKGROUND_ASSET_CLASS,
  PLAYABLE_CARD_ASSET_CLASS,
  SPRITE_SHEET_ASSET_CLASS,
];
