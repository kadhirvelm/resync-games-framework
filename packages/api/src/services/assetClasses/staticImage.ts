import type { ServiceDefinition } from "../../genericTypes/service";
import {
  ASSET_CLASS_ENDPOINTS,
  type AssetClassServiceApi,
} from "./assetClassService";

/** Aspect ratios supported by the shared image generator. */
export type StaticImageAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

/** Resolution classes supported by the shared image generator. */
export type StaticImageSize = "1K" | "2K";

/** One generated standalone 2D image. */
export interface StaticImageAsset {
  /** Aspect ratio requested from the image provider. */
  aspectRatio: StaticImageAspectRatio;
  /** When this image was generated. */
  createdAt: string;
  /** Short description of the generated composition. */
  description: string;
  /** Stable folder id under `/static/static-images`. */
  id: string;
  /** Resolution class requested from the image provider. */
  imageSize: StaticImageSize;
  /** Absolute URL clients can use as the image source. */
  imageUrl: string;
  /** Original request from the user. */
  prompt: string;
  /** Short display name for the image. */
  title: string;
}

/** Stored standalone images, newest first. */
export interface ListStaticImagesResponse {
  staticImages: StaticImageAsset[];
}

/** Static images: one prompt becomes one stored 2D image. */
export type StaticImageServiceApi = AssetClassServiceApi<
  StaticImageAsset,
  ListStaticImagesResponse
>;

export const StaticImageServiceDefinition: ServiceDefinition<StaticImageServiceApi> =
  {
    controller: "static-images",
    endpoints: ASSET_CLASS_ENDPOINTS,
  };
