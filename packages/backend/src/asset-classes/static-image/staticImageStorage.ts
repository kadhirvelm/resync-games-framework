import { createAssetClassStorage } from "../shared/assetClassStorage";

/** Each image is stored under `public/static-images/<id>/`. */
export const STATIC_IMAGE_STORAGE = createAssetClassStorage("static-images");
