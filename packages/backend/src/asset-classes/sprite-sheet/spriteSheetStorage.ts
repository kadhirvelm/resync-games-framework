import { createAssetClassStorage } from "../shared/assetClassStorage";

/**
 * Each sprite sheet is a folder `public/sprite-sheets/<id>/` with the painted
 * sheet, the transparent anchor, one PNG strip per animation, and a manifest.
 */
export const SPRITE_SHEET_STORAGE = createAssetClassStorage("sprite-sheets");
