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

  test("clears a near-white fringe pixel touching the background", () => {
    const image = createImage(12, 12, WHITE);
    fillRect(image, { bottom: 9, left: 3, right: 9, top: 3 }, OUTLINE);
    fillRect(image, { bottom: 4, left: 3, right: 4, top: 3 }, [230, 230, 230]);

    removeBackground(image, 50);

    expect(alphaAt(image, 3, 3)).toBe(0);
    expect(alphaAt(image, 5, 5)).toBe(255);
  });

  test("turns a pale fringe pixel into a faint outline pixel instead of a white one", () => {
    const image = createImage(12, 12, WHITE);
    fillRect(image, { bottom: 9, left: 3, right: 9, top: 3 }, OUTLINE);
    fillRect(image, { bottom: 4, left: 3, right: 4, top: 3 }, [200, 200, 200]);

    removeBackground(image, 50);

    const alpha = alphaAt(image, 3, 3);
    expect(alpha).toBeGreaterThanOrEqual(1);
    expect(alpha).toBeLessThan(128);
    expect(Math.max(...rgbAt(image, 3, 3))).toBeLessThan(60);
    expect(alphaAt(image, 5, 5)).toBe(255);
  });

  test("softens an anti-aliased rim into partial alpha with the character's color", () => {
    const red: [number, number, number] = [200, 40, 40];
    const image = createImage(30, 30, WHITE);
    fillRect(
      image,
      { bottom: 23, left: 7, right: 23, top: 7 },
      mix(red, 1 / 3),
    );
    fillRect(
      image,
      { bottom: 22, left: 8, right: 22, top: 8 },
      mix(red, 2 / 3),
    );
    fillRect(image, { bottom: 21, left: 9, right: 21, top: 9 }, red);
    fillRect(image, { bottom: 16, left: 14, right: 16, top: 14 }, WHITE);

    removeBackground(image, 50);

    expect(alphaAt(image, 0, 0)).toBe(0);
    expect(alphaAt(image, 6, 15)).toBe(0);
    expect(alphaAt(image, 7, 15)).toBe(85);
    expect(alphaAt(image, 8, 15)).toBe(170);
    expect(alphaAt(image, 9, 15)).toBe(255);
    for (const x of [7, 8, 9]) {
      expectNear(rgbAt(image, x, 15), red);
    }
    expect(alphaAt(image, 14, 14)).toBe(255);
    expect(rgbAt(image, 14, 14)).toEqual(WHITE);
  });

  test("keeps a white highlight just behind a solid outline", () => {
    const image = createImage(14, 14, WHITE);
    fillRect(image, { bottom: 12, left: 2, right: 12, top: 2 }, OUTLINE);
    fillRect(image, { bottom: 8, left: 3, right: 4, top: 6 }, WHITE);

    removeBackground(image, 50);

    expect(alphaAt(image, 2, 6)).toBe(255);
    expect(alphaAt(image, 3, 6)).toBe(255);
    expect(rgbAt(image, 3, 6)).toEqual(WHITE);
  });

  test("leaves a thin dark stroke fully opaque", () => {
    const gray: [number, number, number] = [120, 120, 120];
    const image = createImage(12, 12, WHITE);
    fillRect(image, { bottom: 10, left: 5, right: 7, top: 2 }, gray);

    removeBackground(image, 50);

    expect(alphaAt(image, 5, 5)).toBe(255);
    expect(alphaAt(image, 6, 5)).toBe(255);
    expect(rgbAt(image, 5, 5)).toEqual(gray);
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

/**
 * @param image - Image to read
 * @param x - Column
 * @param y - Row
 * @returns RGB at that pixel
 */
function rgbAt(image: RgbaImage, x: number, y: number): number[] {
  const offset = (y * image.width + x) * 4;
  return Array.from(image.data.subarray(offset, offset + 3));
}

/**
 * @param color - Foreground color
 * @param coverage - Foreground share from 0 to 1
 * @returns `color` blended over white, as an anti-aliased edge would be painted
 */
function mix(
  color: [number, number, number],
  coverage: number,
): [number, number, number] {
  const blend = (channel: number) =>
    Math.round(channel * coverage + 255 * (1 - coverage));
  return [blend(color[0]), blend(color[1]), blend(color[2])];
}

/**
 * Expects each channel to be within a few levels of the wanted color.
 * @param actual - Measured RGB
 * @param expected - Wanted RGB
 */
function expectNear(actual: number[], expected: readonly number[]): void {
  actual.forEach((channel, index) => {
    expect(Math.abs(channel - (expected[index] ?? 0))).toBeLessThan(4);
  });
}
