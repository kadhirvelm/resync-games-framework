import type { CardTargeting } from "../tower/logic/cardRules";
import type { Point } from "./handFan";

/** One chevron along the targeting arrow. */
export interface ArrowMark extends Point {
  /** Direction of travel at this point, in radians */
  angle: number;
}

/**
 * Samples the curved targeting arrow from a held card to the pointer. The
 * curve leaves the card straight up and bends toward the pointer, the way
 * a drawn bow string would.
 * @param from - Top of the held card
 * @param to - Pointer
 * @param marks - Chevrons to place, not counting the start
 * @returns Evenly spaced points from just past `from` to `to`, each with its heading
 */
export function arrowCurve(from: Point, to: Point, marks: number): ArrowMark[] {
  const control: Point = { x: from.x, y: to.y };
  const count = Math.max(1, Math.floor(marks));
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / count;
    const inverse = 1 - t;
    const x =
      inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x;
    const y =
      inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y;
    const dx = 2 * inverse * (control.x - from.x) + 2 * t * (to.x - control.x);
    const dy = 2 * inverse * (control.y - from.y) + 2 * t * (to.y - control.y);
    return { angle: Math.atan2(dy, dx), x, y };
  });
}

/**
 * @param from - Top of the held card
 * @param to - Pointer
 * @param spacing - Preferred distance between chevrons
 * @returns How many chevrons fit along the arrow, at least two
 */
export function arrowMarkCount(
  from: Point,
  to: Point,
  spacing: number,
): number {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(2, Math.round(length / Math.max(1, spacing)));
}

/** What letting go of a held card does. */
export type CardRelease =
  | { kind: "play"; targetId?: string }
  | { kind: "cancel" };

/** Where a held card was let go. */
export interface CardReleaseInput {
  /** Living unit under the pointer that this card may be aimed at */
  hoveredTargetId?: string;
  /** The only legal target, when there is exactly one */
  onlyTargetId?: string;
  pointerY: number;
  /** Releasing above this line plays a card that needs no target */
  playLineY: number;
  targeting: CardTargeting;
}

/**
 * Decides whether a released card is played. A card with no target plays
 * once it is pulled above the hand. An aimed card plays on the unit under
 * the arrow; with only one legal target, pulling it above the hand is
 * enough.
 * @param input - Card targeting and where it was released
 * @returns Play, with the target when one applies, or cancel
 */
export function resolveCardRelease(input: CardReleaseInput): CardRelease {
  const aboveHand = input.pointerY < input.playLineY;
  if (input.targeting === "none") {
    return aboveHand ? { kind: "play" } : { kind: "cancel" };
  }
  if (input.hoveredTargetId !== undefined) {
    return { kind: "play", targetId: input.hoveredTargetId };
  }
  if (aboveHand && input.onlyTargetId !== undefined) {
    return { kind: "play", targetId: input.onlyTargetId };
  }
  return { kind: "cancel" };
}
