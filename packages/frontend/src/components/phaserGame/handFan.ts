/** Where one hand card sits: center, tilt in radians, and scale. */
export interface CardPose {
  rotation: number;
  scale: number;
  x: number;
  y: number;
}

/** A point on the canvas. */
export interface Point {
  x: number;
  y: number;
}

/** Hand geometry for one view size. */
export interface HandFanOptions {
  cardHeight: number;
  cardWidth: number;
  /** Horizontal center of the fan */
  centerX: number;
  /** Widest the fan may spread, from the first card's left edge to the last card's right edge */
  maxSpan: number;
  /** Center line of the middle card at rest */
  restY: number;
  /** Bottom edge of the view. A hovered card rises until it sits fully above it. */
  viewBottom: number;
}

/** Scale of a hovered card, so its rules can be read. */
export const HAND_HOVER_SCALE = 1.32;

/** Tilt between neighboring cards, in radians, before a big hand narrows it. */
const TILT_PER_CARD = 0.06;

/** Most tilt the outermost card may have, in radians. */
const MAX_EDGE_TILT = 0.3;

/** Radius of the arc the fan follows, as a multiple of card height. */
const ARC_RADIUS_IN_CARDS = 4;

/** Widest gap between card centers, as a share of card width. */
const MAX_STEP_SHARE = 0.86;

/** Gap kept between a hovered card's bottom edge and the view bottom. */
const HOVER_BOTTOM_GAP = 6;

/**
 * Fans the hand along a shallow arc, like cards held in one hand. When a
 * card is hovered it straightens, rises fully into view, and grows, and its
 * neighbors slide away so it is not covered.
 * @param count - Cards in hand
 * @param options - Card size and fan bounds
 * @param hovered - Index of the hovered card, if any
 * @returns One pose per card, left to right
 */
export function layoutHandFan(
  count: number,
  options: HandFanOptions,
  hovered?: number,
): CardPose[] {
  if (count <= 0) {
    return [];
  }
  const step = fanStep(count, options);
  const middle = (count - 1) / 2;
  const tilt = Math.min(TILT_PER_CARD, MAX_EDGE_TILT / Math.max(1, middle));
  const radius = options.cardHeight * ARC_RADIUS_IN_CARDS;
  const spread = hoverSpread(step, options.cardWidth);

  return Array.from({ length: count }, (_, index) => {
    const offset = index - middle;
    const rotation = offset * tilt;
    const rest: CardPose = {
      rotation,
      scale: 1,
      x: options.centerX + offset * step,
      y: options.restY + (1 - Math.cos(rotation)) * radius,
    };
    if (hovered === undefined || hovered < 0 || hovered >= count) {
      return rest;
    }
    if (index === hovered) {
      return {
        rotation: 0,
        scale: HAND_HOVER_SCALE,
        x: rest.x,
        y:
          options.viewBottom -
          (options.cardHeight * HAND_HOVER_SCALE) / 2 -
          HOVER_BOTTOM_GAP,
      };
    }
    const distance = index - hovered;
    return {
      ...rest,
      x: rest.x + (Math.sign(distance) * spread) / Math.abs(distance),
    };
  });
}

/**
 * @param count - Cards in hand
 * @param options - Card size and fan bounds
 * @returns Distance between neighboring card centers
 */
function fanStep(count: number, options: HandFanOptions): number {
  const preferred = options.cardWidth * MAX_STEP_SHARE;
  if (count <= 1) {
    return preferred;
  }
  const fitted = (options.maxSpan - options.cardWidth) / (count - 1);
  return Math.max(0, Math.min(preferred, fitted));
}

/**
 * @param step - Distance between neighboring card centers
 * @param cardWidth - Card width at rest
 * @returns How far the hovered card's nearest neighbors slide aside
 */
function hoverSpread(step: number, cardWidth: number): number {
  const hoveredHalf = (cardWidth * HAND_HOVER_SCALE) / 2;
  const neighborHalf = cardWidth / 2;
  return Math.max(0, (hoveredHalf + neighborHalf - step) * 0.55);
}

/**
 * Finds the card under the pointer. Inside the hand band the card whose
 * resting center is nearest the pointer wins, so moving sideways steps
 * cleanly from card to card. Above the band, only the raised hovered card
 * still counts, so its text can be read without it dropping.
 * @param pointer - Pointer position
 * @param rest - Resting pose of each card
 * @param size - Card size at rest
 * @param hovered - Currently hovered card and its raised pose
 * @returns Index of the card under the pointer, if any
 */
export function pickHandCard(
  pointer: Point,
  rest: readonly CardPose[],
  size: { height: number; width: number },
  hovered?: { index: number; pose: CardPose },
): number | undefined {
  if (rest.length === 0) {
    return undefined;
  }
  const bandTop = Math.min(...rest.map((pose) => pose.y)) - size.height / 2;
  const left = Math.min(...rest.map((pose) => pose.x)) - size.width / 2;
  const right = Math.max(...rest.map((pose) => pose.x)) + size.width / 2;
  const inBand =
    pointer.y >= bandTop && pointer.x >= left && pointer.x <= right;
  if (inBand) {
    return nearestByX(pointer.x, rest);
  }
  if (hovered && containsPoint(hovered.pose, size, pointer)) {
    return hovered.index;
  }
  return undefined;
}

/**
 * @param x - Pointer x
 * @param poses - Card poses
 * @returns Index of the pose whose center is nearest `x`
 */
function nearestByX(x: number, poses: readonly CardPose[]): number {
  let best = 0;
  poses.forEach((pose, index) => {
    const current = poses[best] as CardPose;
    if (Math.abs(pose.x - x) < Math.abs(current.x - x)) {
      best = index;
    }
  });
  return best;
}

/**
 * @param pose - Untilted card pose
 * @param size - Card size before scaling
 * @param point - Point to test
 * @returns Whether the point lies inside the scaled card
 */
function containsPoint(
  pose: CardPose,
  size: { height: number; width: number },
  point: Point,
): boolean {
  const halfWidth = (size.width * pose.scale) / 2;
  const halfHeight = (size.height * pose.scale) / 2;
  return (
    Math.abs(point.x - pose.x) <= halfWidth &&
    Math.abs(point.y - pose.y) <= halfHeight
  );
}

/**
 * Moves a value toward a target with a frame-rate independent ease.
 * Snaps once the remainder is within `snapDistance`, so nothing creeps
 * for the rest of the battle.
 * @param current - Current value
 * @param target - Value to approach
 * @param deltaMs - Frame time in milliseconds
 * @param settleMs - Time constant; smaller values arrive sooner
 * @param snapDistance - Remaining distance that counts as arrived
 * @returns The next value
 */
export function approach(
  current: number,
  target: number,
  deltaMs: number,
  settleMs: number,
  snapDistance = 0.35,
): number {
  if (settleMs <= 0) {
    return target;
  }
  if (deltaMs <= 0) {
    return current;
  }
  const blended =
    current + (target - current) * (1 - Math.exp(-deltaMs / settleMs));
  if (Math.abs(target - blended) <= snapDistance) {
    return target;
  }
  return blended;
}
