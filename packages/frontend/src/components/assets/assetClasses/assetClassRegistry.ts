import type { AssetClassDefinition } from "./assetClassDefinition";
import { AUDIO_ASSET_CLASS } from "./audioAssetClass";
import { BATTLE_BACKGROUND_ASSET_CLASS } from "./battleBackgroundAssetClass";
import { CARD_CHARACTER_ASSET_CLASS } from "./cardCharacterAssetClass";
import { DUNGEON_ASSET_CLASS } from "./dungeonAssetClass";
import { ENEMY_ASSET_CLASS } from "./enemyAssetClass";
import { PLAYABLE_CARD_ASSET_CLASS } from "./playableCardAssetClass";
import { SPRITE_SHEET_ASSET_CLASS } from "./spriteSheetAssetClass";
import { STATIC_IMAGE_ASSET_CLASS } from "./staticImageAssetClass";
import { THREE_D_ASSET_CLASSES } from "./threeDAssetClasses";

/**
 * Asset classes shown in the workshop sidebar. Order inside a medium is the
 * category order; the sidebar then splits them into 2D, 3D, and Both. The
 * first class is selected by default.
 */
export const ASSET_CLASSES: readonly AssetClassDefinition[] = [
  DUNGEON_ASSET_CLASS,
  CARD_CHARACTER_ASSET_CLASS,
  ENEMY_ASSET_CLASS,
  BATTLE_BACKGROUND_ASSET_CLASS,
  PLAYABLE_CARD_ASSET_CLASS,
  SPRITE_SHEET_ASSET_CLASS,
  STATIC_IMAGE_ASSET_CLASS,
  ...THREE_D_ASSET_CLASSES,
  AUDIO_ASSET_CLASS,
];
