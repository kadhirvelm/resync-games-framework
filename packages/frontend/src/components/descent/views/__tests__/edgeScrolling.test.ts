import { describe, expect, test } from "bun:test";
import {
  cameraPanDirection,
  EDGE_SCROLL_MARGIN_PX,
  type EdgeScrollRect,
  edgeScrollPanDirection,
  emptyCameraKeys,
  isPointerInEdgeScrollBand,
} from "../cameraControls";

const OPENING_ALPHA = -Math.PI / 2;
const VIEWPORT: EdgeScrollRect = {
  bottom: 650,
  left: 100,
  right: 900,
  top: 50,
};

/** A zero ground vector for readable inactive-edge assertions. */
const ZERO = { x: 0, z: 0 };

describe("edgeScrollPanDirection", () => {
  test("is inactive without a pointer, outside the viewport, or in its interior", () => {
    expect(edgeScrollPanDirection(null, VIEWPORT, OPENING_ALPHA)).toEqual(ZERO);
    expect(
      edgeScrollPanDirection({ x: 99, y: 55 }, VIEWPORT, OPENING_ALPHA),
    ).toEqual(ZERO);
    expect(
      edgeScrollPanDirection({ x: 900, y: 55 }, VIEWPORT, OPENING_ALPHA),
    ).toEqual(ZERO);
    expect(
      edgeScrollPanDirection({ x: 500, y: 300 }, VIEWPORT, OPENING_ALPHA),
    ).toEqual(ZERO);
  });

  test("moves in all four screen directions at the opening heading", () => {
    const top = edgeScrollPanDirection(
      { x: 500, y: 55 },
      VIEWPORT,
      OPENING_ALPHA,
    );
    expect(top.x).toBeCloseTo(0);
    expect(top.z).toBeCloseTo(1);
    const bottom = edgeScrollPanDirection(
      { x: 500, y: 645 },
      VIEWPORT,
      OPENING_ALPHA,
    );
    expect(bottom.x).toBeCloseTo(0);
    expect(bottom.z).toBeCloseTo(-1);
    const left = edgeScrollPanDirection(
      { x: 105, y: 300 },
      VIEWPORT,
      OPENING_ALPHA,
    );
    expect(left.x).toBeCloseTo(-1);
    expect(left.z).toBeCloseTo(0);
    const right = edgeScrollPanDirection(
      { x: 895, y: 300 },
      VIEWPORT,
      OPENING_ALPHA,
    );
    expect(right.x).toBeCloseTo(1);
    expect(right.z).toBeCloseTo(0);
  });

  test("normalizes corners and follows the same rotated heading as key panning", () => {
    const alpha = 0.7;
    const edge = edgeScrollPanDirection({ x: 895, y: 55 }, VIEWPORT, alpha);
    const keys = cameraPanDirection(
      { ...emptyCameraKeys(), forward: true, right: true },
      alpha,
    );
    expect(edge.x).toBeCloseTo(keys.x);
    expect(edge.z).toBeCloseTo(keys.z);
    expect(Math.hypot(edge.x, edge.z)).toBeCloseTo(1);
  });

  test("uses a 24px band by default and supports a custom band", () => {
    expect(EDGE_SCROLL_MARGIN_PX).toBe(24);
    expect(
      edgeScrollPanDirection(
        { x: VIEWPORT.left + EDGE_SCROLL_MARGIN_PX, y: 300 },
        VIEWPORT,
        OPENING_ALPHA,
      ),
    ).toEqual(ZERO);
    expect(
      edgeScrollPanDirection(
        { x: VIEWPORT.left + 31, y: 300 },
        VIEWPORT,
        OPENING_ALPHA,
        { edgeSize: 32 },
      ).x,
    ).toBeCloseTo(-1);
    expect(
      edgeScrollPanDirection(
        { x: VIEWPORT.left, y: 300 },
        VIEWPORT,
        OPENING_ALPHA,
        { edgeSize: 0 },
      ),
    ).toEqual(ZERO);
  });

  test("stays inactive over HUD rectangles and predicate hits", () => {
    let hudChecks = 0;
    expect(
      edgeScrollPanDirection({ x: 500, y: 300 }, VIEWPORT, OPENING_ALPHA, {
        isPointerOverHud: () => {
          hudChecks += 1;
          return true;
        },
      }),
    ).toEqual(ZERO);
    expect(hudChecks).toBe(0);
    const pointer = { x: 895, y: 300 };
    const hudRects = [{ bottom: 400, left: 850, right: 900, top: 200 }];
    expect(
      edgeScrollPanDirection(pointer, VIEWPORT, OPENING_ALPHA, { hudRects }),
    ).toEqual(ZERO);
    expect(
      edgeScrollPanDirection(pointer, VIEWPORT, OPENING_ALPHA, {
        isPointerOverHud: (point) => point.x === pointer.x,
      }),
    ).toEqual(ZERO);
    expect(
      edgeScrollPanDirection(pointer, VIEWPORT, OPENING_ALPHA, {
        hudRects,
        isPointerOverHud: () => false,
      }),
    ).toEqual(ZERO);
  });
});

describe("isPointerInEdgeScrollBand", () => {
  test("tests all four 24px edges against the canvas rect rather than window bounds", () => {
    expect(isPointerInEdgeScrollBand(null, VIEWPORT)).toBe(false);
    // Offset canvas: top is 50, bottom is 650.
    expect(isPointerInEdgeScrollBand({ x: 500, y: 55 }, VIEWPORT)).toBe(true);
    expect(isPointerInEdgeScrollBand({ x: 500, y: 645 }, VIEWPORT)).toBe(true);
    expect(isPointerInEdgeScrollBand({ x: 105, y: 300 }, VIEWPORT)).toBe(true);
    expect(isPointerInEdgeScrollBand({ x: 895, y: 300 }, VIEWPORT)).toBe(true);
    // Interior and outside the canvas rect are inactive.
    expect(isPointerInEdgeScrollBand({ x: 500, y: 300 }, VIEWPORT)).toBe(false);
    expect(isPointerInEdgeScrollBand({ x: 500, y: 20 }, VIEWPORT)).toBe(false);
    expect(isPointerInEdgeScrollBand({ x: 500, y: 660 }, VIEWPORT)).toBe(false);
  });
});
