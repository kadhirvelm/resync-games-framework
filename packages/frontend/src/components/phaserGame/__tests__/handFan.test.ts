import { describe, expect, test } from "bun:test";
import {
  approach,
  HAND_HOVER_SCALE,
  type HandFanOptions,
  layoutHandFan,
  pickHandCard,
} from "../handFan";

const OPTIONS: HandFanOptions = {
  cardHeight: 200,
  cardWidth: 140,
  centerX: 640,
  maxSpan: 800,
  restY: 760,
  viewBottom: 800,
};

describe("layoutHandFan", () => {
  test("fans cards symmetrically along an arc that dips at the edges", () => {
    const poses = layoutHandFan(5, OPTIONS);
    const [first, , middle, , last] = poses;
    expect(middle?.x).toBeCloseTo(640);
    expect(middle?.rotation).toBeCloseTo(0);
    expect(first?.rotation).toBeLessThan(0);
    expect(last?.rotation).toBeCloseTo(-(first?.rotation ?? 0));
    expect(first?.y).toBeGreaterThan(middle?.y ?? 0);
    expect(first?.y).toBeCloseTo(last?.y ?? 0);
  });

  test("squeezes a big hand inside the span", () => {
    const poses = layoutHandFan(10, OPTIONS);
    const left = (poses[0]?.x ?? 0) - OPTIONS.cardWidth / 2;
    const right = (poses[9]?.x ?? 0) + OPTIONS.cardWidth / 2;
    expect(right - left).toBeLessThanOrEqual(OPTIONS.maxSpan + 0.001);
  });

  test("raises a hovered card fully into view and pushes neighbors aside", () => {
    const rest = layoutHandFan(5, OPTIONS);
    const hovered = layoutHandFan(5, OPTIONS, 2);
    const lifted = hovered[2];
    expect(lifted?.rotation).toBe(0);
    expect(lifted?.scale).toBe(HAND_HOVER_SCALE);
    expect(
      (lifted?.y ?? 0) + (OPTIONS.cardHeight * HAND_HOVER_SCALE) / 2,
    ).toBeLessThanOrEqual(OPTIONS.viewBottom);
    expect(hovered[1]?.x).toBeLessThan(rest[1]?.x ?? 0);
    expect(hovered[3]?.x).toBeGreaterThan(rest[3]?.x ?? 0);
    expect(hovered[0]?.y).toBe(rest[0]?.y as number);
  });

  test("an empty hand has no poses", () => {
    expect(layoutHandFan(0, OPTIONS)).toEqual([]);
  });
});

describe("pickHandCard", () => {
  const rest = layoutHandFan(5, OPTIONS);
  const size = { height: OPTIONS.cardHeight, width: OPTIONS.cardWidth };

  test("inside the hand, the nearest card center wins", () => {
    const target = rest[3];
    expect(pickHandCard({ x: (target?.x ?? 0) + 5, y: 780 }, rest, size)).toBe(
      3,
    );
  });

  test("above the hand, only the raised card still counts", () => {
    const raised = layoutHandFan(5, OPTIONS, 1)[1];
    if (!raised) {
      throw new Error("missing pose");
    }
    const pointer = { x: raised.x, y: raised.y - 100 };
    expect(pickHandCard(pointer, rest, size)).toBeUndefined();
    expect(pickHandCard(pointer, rest, size, { index: 1, pose: raised })).toBe(
      1,
    );
  });

  test("outside the hand nothing is picked", () => {
    expect(pickHandCard({ x: 10, y: 790 }, rest, size)).toBeUndefined();
  });
});

describe("approach", () => {
  test("eases toward the target and snaps when close", () => {
    const next = approach(0, 100, 16, 90);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(100);
    expect(approach(99.8, 100, 16, 90)).toBe(100);
  });

  test("a zero settle time jumps straight to the target", () => {
    expect(approach(0, 50, 16, 0)).toBe(50);
  });

  test("no elapsed time leaves the value alone", () => {
    expect(approach(10, 50, 0, 90)).toBe(10);
  });
});
