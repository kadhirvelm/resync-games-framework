/** A rectangle described by its center. */
export type LayoutRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

/** Where one party member or enemy stands. `x`/`y` is the portrait center. */
export type UnitSlot = LayoutRect & {
  index: number;
};

/** Where one hand card rests. */
export type CardSlot = LayoutRect & {
  index: number;
};

/** Illustration and rules areas inside one card. Either may be omitted. */
export type CardPanels = {
  art?: LayoutRect;
  rules?: LayoutRect;
};

/** Every position the battle draws for one frame size. */
export type BattleLayout = {
  aether: { radius: number; x: number; y: number };
  banner: { x: number; y: number };
  cards: CardSlot[];
  discardPile: { x: number; y: number };
  drawPile: { x: number; y: number };
  endTurn: LayoutRect;
  enemies: UnitSlot[];
  /** Line the units stand on */
  groundY: number;
  /** Front of the party is index 0, drawn nearest the enemies. */
  party: UnitSlot[];
};

/** How many of each thing the battle has to place. */
export interface BattleLayoutCounts {
  enemies: number;
  hand: number;
  party: number;
}

/** Portrait boxes use the 3:4 shape of generated character art. */
const PORTRAIT_ASPECT = 3 / 4;
const CARD_ASPECT = 1.45;
/** Tallest a portrait gets, so a small party does not fill the screen. */
const MAX_PORTRAIT_HEIGHT = 250;

/**
 * Places the party on the left with its front nearest the middle, enemies on
 * the right in their on-screen order, and the hand along the bottom.
 * @param width - View width in pixels
 * @param height - View height in pixels
 * @param counts - Party, enemy, and hand sizes
 * @returns Slots for every drawn element
 */
export function layoutBattle(
  width: number,
  height: number,
  counts: BattleLayoutCounts,
): BattleLayout {
  const safeWidth = Math.max(width, 320);
  const safeHeight = Math.max(height, 320);
  const cardWidth = Math.min(132, Math.max(76, safeWidth * 0.1));
  const cardHeight = Math.min(cardWidth * CARD_ASPECT, safeHeight * 0.3);
  const fittedCardWidth = cardHeight / CARD_ASPECT;
  const bottomMargin = Math.min(24, safeHeight * 0.03);
  const cardY = safeHeight - bottomMargin - cardHeight / 2;
  const groundY = Math.min(
    safeHeight * 0.66,
    cardY - cardHeight / 2 - safeHeight * 0.05,
  );
  const fieldTop = safeHeight * 0.16;

  return {
    aether: {
      radius: Math.min(44, safeHeight * 0.06),
      x: Math.min(96, safeWidth * 0.08),
      y: cardY - cardHeight * 0.28,
    },
    banner: { x: safeWidth / 2, y: Math.min(40, safeHeight * 0.06) },
    cards: layoutHand(
      safeWidth,
      counts.hand,
      fittedCardWidth,
      cardHeight,
      cardY,
    ),
    discardPile: {
      x: safeWidth - Math.min(96, safeWidth * 0.08),
      y: cardY + cardHeight * 0.32,
    },
    drawPile: {
      x: Math.min(96, safeWidth * 0.08),
      y: cardY + cardHeight * 0.32,
    },
    endTurn: {
      height: 46,
      width: Math.min(150, safeWidth * 0.13),
      x: safeWidth - Math.min(96, safeWidth * 0.08),
      y: cardY - cardHeight * 0.18,
    },
    enemies: layoutRow({
      count: counts.enemies,
      fieldTop,
      fromRight: false,
      groundY,
      left: safeWidth * 0.54,
      right: safeWidth * 0.96,
    }),
    groundY,
    party: layoutRow({
      count: counts.party,
      fieldTop,
      fromRight: true,
      groundY,
      left: safeWidth * 0.04,
      right: safeWidth * 0.46,
    }),
  };
}

/**
 * Spreads units across one side of the field, feet on the ground line.
 * @param row.count - Units on this side
 * @param row.fieldTop - Highest a portrait may reach, leaving room for intents
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
  const maxHeight = Math.max(60, row.groundY - row.fieldTop - 70);
  const height = Math.min(
    maxHeight,
    MAX_PORTRAIT_HEIGHT,
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

/**
 * Lays the hand out centered. Large hands overlap instead of overflowing.
 * @param width - View width
 * @param count - Cards in hand
 * @param cardWidth - Card width
 * @param cardHeight - Card height
 * @param cardY - Card center line
 * @returns One slot per card, left to right
 */
function layoutHand(
  width: number,
  count: number,
  cardWidth: number,
  cardHeight: number,
  cardY: number,
): CardSlot[] {
  if (count <= 0) {
    return [];
  }
  const available = width * 0.66;
  const preferredGap = Math.max(10, cardWidth * 0.12);
  const fullSpan = count * cardWidth + (count - 1) * preferredGap;
  const step =
    fullSpan <= available || count === 1
      ? cardWidth + preferredGap
      : (available - cardWidth) / (count - 1);
  const span = cardWidth + step * (count - 1);
  const firstX = (width - span) / 2 + cardWidth / 2;
  return Array.from({ length: count }, (_, index) => ({
    height: cardHeight,
    index,
    width: cardWidth,
    x: firstX + index * step,
    y: cardY,
  }));
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
  const width = Math.max(84, Math.min(150, slot.width * 1.05));
  return {
    fillRatio: current / max,
    height: 16,
    label: `${current} / ${max}`,
    width,
    x: slot.x,
    y: slot.y + slot.height / 2 + 30,
  };
}
