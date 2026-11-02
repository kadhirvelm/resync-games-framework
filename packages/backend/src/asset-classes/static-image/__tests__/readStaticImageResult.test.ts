import { describe, expect, test } from "bun:test";
import { readStaticImageResult } from "../readStaticImageResult";

describe("readStaticImageResult", () => {
  test("accepts one supported generated image", () => {
    const result = readStaticImageResult({
      aspectRatio: "1:1",
      imageSize: "1K",
      images: [
        {
          filePath: "/tmp/resource.png",
          name: "Golden Wheat",
          notes: "A tied golden wheat sheaf with a bold readable silhouette.",
        },
      ],
    });

    expect(result.aspectRatio).toBe("1:1");
    expect(result.image.name).toBe("Golden Wheat");
  });

  test("rejects multiple images", () => {
    expect(() =>
      readStaticImageResult({
        aspectRatio: "1:1",
        imageSize: "1K",
        images: [
          {
            filePath: "/tmp/one.png",
            name: "One",
            notes: "A long enough first image description.",
          },
          {
            filePath: "/tmp/two.png",
            name: "Two",
            notes: "A long enough second image description.",
          },
        ],
      }),
    ).toThrow();
  });
});
