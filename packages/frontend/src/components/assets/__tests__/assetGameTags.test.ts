import { describe, expect, it } from "bun:test";
import type {
  ListAudioResponse,
  StaticImageAsset,
  ThreeDAsset,
  ThreeDPrototype,
} from "@resync-game-framework/api";
import {
  audioGameTags,
  CROSSWORD_CRYPT_TAG,
  DESCENT_TAG,
  staticImageGameTags,
  THREE_D_SANDBOX_TAG,
  TOWERS_OF_COREBORN_TAG,
  threeDAssetGameTags,
} from "../assetGameTags";

const baseStaticImage: StaticImageAsset = {
  aspectRatio: "1:1",
  createdAt: "2026-11-01T00:00:00.000Z",
  description: "Test image",
  id: "img-1",
  imageSize: "1K",
  imageUrl: "/test.png",
  prompt: "A generic stone icon",
  title: "Stone",
};

const baseAudio: ListAudioResponse["clips"][number] = {
  audioUrl: "/test.mp3",
  createdAt: "2026-11-01T00:00:00.000Z",
  cue: "impact",
  design: "A dull stone thud",
  durationSeconds: 1.2,
  id: "aud-1",
  loop: false,
  prompt: "A dull stone thud",
  role: "effect",
  title: "Stone thud",
  vendor: "elevenlabs",
};

const baseThreeDAsset: ThreeDAsset = {
  createdAt: "2026-11-01T00:00:00.000Z",
  id: "3d-1",
  kind: "prop",
  name: "Custom Shrine",
  prompt: "A small stone shrine",
  provenance: {
    elapsedMs: 1200,
    estimatedCredits: null,
    jobIds: [],
    provider: "design",
  },
  thumbnailUrl: "/thumb.png",
  url: "/model.glb",
  validation: {
    animations: [],
    bounds: { max: [1, 1, 1], min: [-1, 0, -1] },
    bytes: 1024,
    materials: 1,
    meshes: 1,
    skins: 0,
    textures: 0,
    triangles: 120,
    valid: true,
    warnings: [],
  },
};

describe("staticImageGameTags", () => {
  it("tags bundled Descent resource images and Ashen Gate textures", () => {
    expect(
      staticImageGameTags({
        ...baseStaticImage,
        id: "descent-resource-food",
      }),
    ).toEqual([DESCENT_TAG]);

    expect(
      staticImageGameTags({
        ...baseStaticImage,
        prompt: "Descent Ashen Gate ground texture. Basalt stone floor.",
      }),
    ).toEqual([DESCENT_TAG]);
  });

  it("tags Crossword Crypt art", () => {
    expect(
      staticImageGameTags({
        ...baseStaticImage,
        prompt: "Crossword Crypt door closed, ancient stone slab.",
      }),
    ).toEqual([CROSSWORD_CRYPT_TAG]);
  });

  it("tags Towers of Coreborn images and leaves unrelated images empty", () => {
    expect(
      staticImageGameTags({
        ...baseStaticImage,
        prompt: "A jade lantern for Towers of Coreborn",
      }),
    ).toEqual([TOWERS_OF_COREBORN_TAG]);

    expect(staticImageGameTags(baseStaticImage)).toEqual([]);
  });
});

describe("audioGameTags", () => {
  it("tags Descent, Crossword Crypt, and Towers of Coreborn clips", () => {
    expect(
      audioGameTags({
        ...baseAudio,
        prompt: "[descent:ashen-gate:audio:melee-attack] Heavy swing",
      }),
    ).toEqual([DESCENT_TAG]);

    expect(
      audioGameTags({
        ...baseAudio,
        title: "door-opens",
      }),
    ).toEqual([CROSSWORD_CRYPT_TAG]);

    expect(
      audioGameTags({
        ...baseAudio,
        title: "Coreborn victory bell",
      }),
    ).toEqual([TOWERS_OF_COREBORN_TAG]);
  });
});

describe("threeDAssetGameTags", () => {
  it("tags Descent roster models and 3D Sandbox prototype slot models", () => {
    const prototype: ThreeDPrototype = {
      createdAt: "2026-11-01T00:00:00.000Z",
      id: "proto-1",
      name: "Jade Garden",
      objective: "Explore",
      prompt: "A jade garden",
      slots: [
        {
          assetId: "3d-1",
          id: "slot-1",
          kind: "prop",
          name: "Shrine",
          position: [0, 0, 0],
          prompt: "Shrine",
        },
      ],
    };

    expect(threeDAssetGameTags(baseThreeDAsset, [prototype])).toEqual([
      THREE_D_SANDBOX_TAG,
    ]);

    expect(
      threeDAssetGameTags(
        { ...baseThreeDAsset, id: "3d-2", name: "Descent Villager" },
        [prototype],
      ),
    ).toEqual([DESCENT_TAG]);
  });
});
