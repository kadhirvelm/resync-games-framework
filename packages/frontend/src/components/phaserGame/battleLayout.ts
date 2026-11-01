import type { HandFanOptions } from "./handFan";

/** A rectangle described by its center. */
export type LayoutRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

/** Where one party member or enemy stands. `x`/`y` is the figure's center. */
export type UnitSlot = LayoutRect & {
  index: number;
};

/** Illustration and rules areas inside one card. Either may be omitted. */
export type CardPanels = {
  art?: LayoutRect;
  rules?: LayoutRect;
};

/** Every position the battle draws for one view size. */
export type BattleLayout = {
  aether: { radius: number; x: number; y: number };
  banner: { x: number; y: number };
  discardPile: { x: number; y: number };
  drawPile: { x: number; y: number };
  endTurn: LayoutRect;
  enemies: UnitSlot[];
  /** Line the units stand on */
  groundY: number;
  /** Fan geometry for the hand */
  hand: HandFanOptions;
  /** Where a card waits while the player aims it */
  aimPose: { x: number; y: number };
  /** Front of the party is index 0, drawn nearest the enemies. */
  party: UnitSlot[];
  /** Releasing a card above this line plays it */
  playLineY: number;
};

/** How many of each thing the battle has to place. */
export interface BattleLayoutCounts {
  enemies: number;
  party: number;
}

/** Figure boxes use the 3:4 shape of generated character art. */
const PORTRAIT_ASPECT = 3 / 4;
/** Card height over width. */
const CARD_ASPECT = 1.4;
/** Tallest a figure gets, so a small party does not fill the screen. */
const MAX_FIGURE_HEIGHT = 300;
/** Share of a resting card's height that hangs below the view. */
const CARD_TUCK_SHARE = 0.16;
/** Room kept above each figure for its intent and labels. */
const ABOVE_FIGURE_ROOM = 84;

/**
 * Places the party on the left with its front nearest the middle, enemies on
 * the right in their on-screen order, and the hand fanned along the bottom
 * between the draw pile and the discard pile.
 * @param width - View width in pixels
 * @param height - View height in pixels
 * @param counts - Party and enemy sizes
 * @returns Positions for every drawn element
 */
export function layoutBattle(
  width: number,
  height: number,
  counts: BattleLayoutCounts,
): BattleLayout {
  const safeWidth = Math.max(width, 320);
  const safeHeight = Math.max(height, 320);
  const cardHeight = Math.min(
    250,
    Math.max(130, safeHeight * 0.27),
    safeWidth * 0.14 * CARD_ASPECT,
  );
  const cardWidth = cardHeight / CARD_ASPECT;
  const restY = safeHeight - cardHeight * (0.5 - CARD_TUCK_SHARE);
  const handTop = restY - cardHeight / 2;
  const groundY = Math.min(safeHeight * 0.7, handTop - safeHeight * 0.03);
  const fieldTop = safeHeight * 0.12;
  const sideReserve = Math.min(190, safeWidth * 0.15);
  const corner = Math.min(78, safeWidth * 0.07);

  return {
    aether: {
      radius: Math.min(42, safeHeight * 0.05),
      x: sideReserve * 0.55,
      y: safeHeight - corner * 0.85 - Math.min(108, safeHeight * 0.12),
    },
    aimPose: { x: safeWidth / 2, y: handTop - cardHeight * 0.18 },
    banner: { x: safeWidth / 2, y: Math.min(36, safeHeight * 0.05) },
    discardPile: { x: safeWidth - corner, y: safeHeight - corner * 0.85 },
    drawPile: { x: corner, y: safeHeight - corner * 0.85 },
    endTurn: {
      height: 50,
      width: Math.min(150, safeWidth * 0.13),
      x: safeWidth - sideReserve * 0.62,
      y: handTop - safeHeight * 0.005,
    },
    enemies: layoutRow({
      count: counts.enemies,
      fieldTop,
      fromRight: false,
      groundY,
      left: safeWidth * 0.55,
      right: safeWidth * 0.97,
    }),
    groundY,
    hand: {
      cardHeight,
      cardWidth,
      centerX: safeWidth / 2,
      maxSpan: Math.max(cardWidth, safeWidth - sideReserve * 2),
      restY,
      viewBottom: safeHeight,
    },
    party: layoutRow({
      count: counts.party,
      fieldTop,
      fromRight: true,
      groundY,
      left: safeWidth * 0.03,
      right: safeWidth * 0.45,
    }),
    playLineY: handTop - cardHeight * 0.25,
  };
}

/**
 * Spreads units across one side of the field, feet on the ground line.
 * @param row.count - Units on this side
 * @param row.fieldTop - Highest a figure may reach, leaving room for intents
 * @param row.fromRight - Whether index 0 sits at the right edge
 * @param row.groundY - Line the units stand on
 * @param row.left - Left edge of the side
 * @param row.right - Right edge of the side
 * @returns One slot per unit
 */
function layoutRow(row: {
  count: number;
  fieldTop: number;
  fromRight: boolean;
  groundY: number;
  left: number;
  right: number;
}): UnitSlot[] {
  if (row.count <= 0) {
    return [];
  }
  const span = row.right - row.left;
  const slotWidth = span / Math.max(row.count, 2);
  const maxHeight = Math.max(
    60,
    row.groundY - row.fieldTop - ABOVE_FIGURE_ROOM,
  );
  const height = Math.min(
    maxHeight,
    MAX_FIGURE_HEIGHT,
    (slotWidth * 0.92) / PORTRAIT_ASPECT,
  );
  const width = height * PORTRAIT_ASPECT;
  const used = slotWidth * row.count;
  const start = row.fromRight
    ? row.right - (span - used) / 2
    : row.left + (span - used) / 2;
  return Array.from({ length: row.count }, (_, index) => {
    const offset = (index + 0.5) * slotWidth;
    return {
      height,
      index,
      width,
      x: row.fromRight ? start - offset : start + offset,
      y: row.groundY - height / 2,
    };
  });
}

const CARD_PANEL_PADDING = 7;
const CARD_RULES_SHARE = 0.46;
const CARD_TITLE_HEIGHT = 20;

/**
 * Splits a card into a title strip, an illustration, and a rules caption.
 * @param card - Card rectangle
 * @returns Centers and sizes of the title, art, and rules panels
 */
export function layoutCardPanels(card: LayoutRect): {
  art: LayoutRect;
  rules: LayoutRect;
  title: LayoutRect;
} {
  const innerWidth = Math.max(1, card.width - CARD_PANEL_PADDING * 2);
  const top = card.y - card.height / 2 + CARD_PANEL_PADDING;
  const innerHeight = Math.max(1, card.height - CARD_PANEL_PADDING * 2);
  const titleHeight = Math.min(CARD_TITLE_HEIGHT, innerHeight * 0.16);
  const rulesHeight = innerHeight * CARD_RULES_SHARE;
  const artHeight = Math.max(1, innerHeight - titleHeight - rulesHeight - 4);
  return {
    art: {
      height: artHeight,
      width: innerWidth,
      x: card.x,
      y: top + titleHeight + 2 + artHeight / 2,
    },
    rules: {
      height: rulesHeight,
      width: innerWidth,
      x: card.x,
      y: top + titleHeight + artHeight + 4 + rulesHeight / 2,
    },
    title: {
      height: titleHeight,
      width: innerWidth,
      x: card.x,
      y: top + titleHeight / 2,
    },
  };
}

/** Health bar geometry under a unit. */
export type HealthBarLayout = LayoutRect & {
  fillRatio: number;
  label: string;
};

/**
 * Places a health bar under a unit and labels it `current / max`.
 * @param slot - Unit slot
 * @param hitPoints - Current health
 * @param maxHitPoints - Maximum health
 * @returns Bar center, size, fill ratio, and label
 */
export function layoutHealthBar(
  slot: UnitSlot,
  hitPoints: number,
  maxHitPoints: number,
): HealthBarLayout {
  const max = Math.max(maxHitPoints, 1);
  const current = Math.min(Math.max(hitPoints, 0), max);
  const width = Math.max(84, Math.min(150, slot.width * 0.95));
  return {
    fillRatio: current / max,
    height: 14,
    label: `${current} / ${max}`,
    width,
    x: slot.x,
    y: slot.y + slot.height / 2 + 20,
  };
}
