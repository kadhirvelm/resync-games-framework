import { describe, expect, test } from "bun:test";
import {
  findGapSplits,
  measureFrame,
  nominalSplits,
  planNormalizedFrames,
  type RgbaImage,
  removeBackground,
  splitAxis,
} from "../spriteFrameGeometry";

const WHITE: [number, number, number] = [255, 255, 255];
const OUTLINE: [number, number, number] = [30, 20, 40];

describe("removeBackground", () => {
  test("removes edge-connected white and keeps a small white highlight", () => {
    const image = createImage(20, 20, WHITE);
    fillRect(image, { bottom: 16, left: 4, right: 16, top: 4 }, OUTLINE);
    fillRect(image, { bottom: 9, left: 8, right: 10, top: 7 }, WHITE);

    const background = removeBackground(image, 50);

    expect(background).toEqual(WHITE);
    expect(alphaAt(image, 0, 0)).toBe(0);
    expect(alphaAt(image, 19, 19)).toBe(0);
    expect(alphaAt(image, 5, 5)).toBe(255);
    expect(alphaAt(image, 8, 7)).toBe(255);
  });

  test("removes a large enclosed white gap, such as between an arm and the body", () => {
    const image = createImage(30, 30, WHITE);
    fillRect(image, { bottom: 28, left: 2, right: 28, top: 2 }, OUTLINE);
    fillRect(image, { bottom: 24, left: 6, right: 24, top: 6 }, WHITE);

    removeBackground(image, 50);

    expect(alphaAt(image, 10, 10)).toBe(0);
    expect(alphaAt(image, 3, 3)).toBe(255);
  });

  test("keeps a large enclosed area of shaded white cloth", () => {
    const image = createImage(30, 30, WHITE);
    fillRect(image, { bottom: 28, left: 2, right: 28, top: 2 }, OUTLINE);
    for (let y = 6; y < 24; y += 1) {
      for (let x = 6; x < 24; x += 1) {
        const shade = (x + y) % 2 === 0 ? 240 : 225;
        fillRect(image, { bottom: y + 1, left: x, right: x + 1, top: y }, [
          shade,
          shade,
          shade + 10,
        ]);
      }
    }

    removeBackground(image, 50);

    expect(alphaAt(image, 10, 10)).toBe(255);
    expect(alphaAt(image, 11, 10)).toBe(255);
  });

  test("clears a pale fringe pixel touching the background", () => {
    const image = createImage(12, 12, WHITE);
    fillRect(image, { bottom: 9, left: 3, right: 9, top: 3 }, OUTLINE);
    fillRect(image, { bottom: 4, left: 3, right: 4, top: 3 }, [200, 200, 200]);

    removeBackground(image, 50);

    expect(alphaAt(image, 3, 3)).toBe(0);
    expect(alphaAt(image, 5, 5)).toBe(255);
  });
});

describe("findGapSplits", () => {
  test("splits at the midpoints of the gaps between opaque runs", () => {
    const profile = [0, 0, 9, 9, 9, 0, 0, 0, 9, 9, 9, 0];

    expect(findGapSplits(profile, 2)).toEqual([0, 7, 12]);
  });

  test("merges a detached speck into its nearest run", () => {
    const profile = [9, 9, 9, 0, 9, 0, 0, 0, 0, 9, 9, 9];

    expect(findGapSplits(profile, 2)).toEqual([0, 7, 12]);
  });

  test("returns undefined when frames touch and no gap separates them", () => {
    expect(findGapSplits([9, 9, 9, 9, 9, 9], 2)).toBeUndefined();
  });

  test("returns undefined when a span is far from the grid size", () => {
    const profile = [9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9];

    expect(findGapSplits(profile, 3)).toBeUndefined();
  });

  test("ignores rows with only a couple of noise pixels", () => {
    const profile = [0, 2, 9, 9, 0, 1, 0, 9, 9, 0];

    expect(findGapSplits(profile, 2)).toEqual([0, 6, 10]);
  });
});

describe("splitAxis", () => {
  test("falls back to the even grid when gaps are missing", () => {
    expect(splitAxis([9, 9, 9, 9, 9, 9, 9, 9, 9], 3)).toEqual(
      nominalSplits(9, 3),
    );
    expect(nominalSplits(9, 3)).toEqual([0, 3, 6, 9]);
  });
});

describe("measureFrame", () => {
  test("returns tight bounds and the feet center, not the bounds center", () => {
    const image = createImage(40, 40, WHITE);
    fillRect(image, { bottom: 30, left: 10, right: 16, top: 10 }, OUTLINE);
    fillRect(image, { bottom: 16, left: 16, right: 30, top: 12 }, OUTLINE);
    removeBackground(image, 50);

    const measured = measureFrame(image, {
      bottom: 40,
      left: 0,
      right: 40,
      top: 0,
    });

    expect(measured?.bounds).toEqual({
      bottom: 30,
      left: 10,
      right: 30,
      top: 10,
    });
    expect(measured?.anchorX).toBe(13);
  });

  test("returns undefined for an empty cell", () => {
    const image = createImage(10, 10, WHITE);
    removeBackground(image, 50);

    expect(
      measureFrame(image, { bottom: 10, left: 0, right: 10, top: 0 }),
    ).toBeUndefined();
  });
});

describe("planNormalizedFrames", () => {
  test("puts every feet center on the canvas center and every foot on one baseline", () => {
    const plan = planNormalizedFrames([
      [
        frame({ bottom: 100, left: 10, right: 30, top: 40 }, 20),
        frame({ bottom: 120, left: 50, right: 70, top: 60 }, 55),
      ],
    ]);

    const [first, second] = plan.animations[0] ?? [];
    if (first === undefined || second === undefined) {
      throw new Error("Expected two placed frames.");
    }
    expect(first.targetTop + first.targetHeight).toBe(plan.frameHeight - 8);
    expect(second.targetTop + second.targetHeight).toBe(plan.frameHeight - 8);
    expect(first.targetLeft + 10).toBe(plan.frameWidth / 2);
    expect(second.targetLeft + 5).toBe(plan.frameWidth / 2);
  });

  test("scales a smaller animation toward the first animation's height, within limits", () => {
    const plan = planNormalizedFrames([
      [frame({ bottom: 100, left: 0, right: 20, top: 0 }, 10)],
      [frame({ bottom: 90, left: 0, right: 20, top: 0 }, 10)],
      [frame({ bottom: 40, left: 0, right: 20, top: 0 }, 10)],
    ]);

    expect(plan.animations[1]?.[0]?.targetHeight).toBe(100);
    expect(plan.animations[2]?.[0]?.targetHeight).toBe(50);
  });

  test("keeps an empty frame empty", () => {
    const plan = planNormalizedFrames([
      [frame({ bottom: 50, left: 0, right: 10, top: 0 }, 5), undefined],
    ]);

    expect(plan.animations[0]?.[1]).toBeUndefined();
  });

  test("rejects an animation with no visible frames", () => {
    let message = "";
    try {
      planNormalizedFrames([
        [frame({ bottom: 50, left: 0, right: 10, top: 0 }, 5)],
        [undefined, undefined],
      ]);
    } catch (error) {
      message = error instanceof Error ? error.message : "";
    }

    expect(message).toContain("no visible frames");
  });
});

/**
 * @param bounds - Opaque bounds
 * @param anchorX - Feet center
 * @returns A frame measurement
 */
function frame(
  bounds: { bottom: number; left: number; right: number; top: number },
  anchorX: number,
) {
  return { anchorX, bounds };
}

/**
 * @param width - Image width
 * @param height - Image height
 * @param color - Fill color
 * @returns An opaque image filled with one color
 */
function createImage(
  width: number,
  height: number,
  color: [number, number, number],
): RgbaImage {
  const image = { data: new Uint8Array(width * height * 4), height, width };
  fillRect(image, { bottom: height, left: 0, right: width, top: 0 }, color);
  return image;
}

/**
 * @param image - Image to paint
 * @param region - Area to fill; right and bottom are exclusive
 * @param color - Opaque fill color
 */
function fillRect(
  image: RgbaImage,
  region: { bottom: number; left: number; right: number; top: number },
  color: [number, number, number],
): void {
  for (let y = region.top; y < region.bottom; y += 1) {
    for (let x = region.left; x < region.right; x += 1) {
      image.data.set([...color, 255], (y * image.width + x) * 4);
    }
  }
}

/**
 * @param image - Image to read
 * @param x - Column
 * @param y - Row
 * @returns Alpha at that pixel
 */
function alphaAt(image: RgbaImage, x: number, y: number): number {
  return image.data[(y * image.width + x) * 4 + 3] ?? -1;
}
