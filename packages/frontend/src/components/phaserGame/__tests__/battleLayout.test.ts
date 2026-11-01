import { describe, expect, test } from "bun:test";
import {
  layoutBattle,
  layoutCardPanels,
  layoutHealthBar,
} from "../battleLayout";

describe("layoutBattle", () => {
  const layout = layoutBattle(1280, 800, { enemies: 2, hand: 5, party: 3 });

  test("puts the party front nearest the middle and enemies left to right", () => {
    const partyX = layout.party.map((slot) => slot.x);
    expect(partyX).toEqual([...partyX].sort((left, right) => right - left));
    expect(Math.max(...partyX)).toBeLessThan(640);
    const enemyX = layout.enemies.map((slot) => slot.x);
    expect(enemyX).toEqual([...enemyX].sort((left, right) => left - right));
    expect(Math.min(...enemyX)).toBeGreaterThan(640);
  });

  test("stands every unit on the ground line above the hand", () => {
    for (const slot of [...layout.party, ...layout.enemies]) {
      expect(slot.y + slot.height / 2).toBeCloseTo(layout.groundY);
    }
    const handTop = Math.min(
      ...layout.cards.map((card) => card.y - card.height / 2),
    );
    expect(layout.groundY).toBeLessThan(handTop);
  });

  test("overlaps a large hand instead of overflowing the screen", () => {
    const crowded = layoutBattle(800, 700, { enemies: 1, hand: 8, party: 1 });
    const left = Math.min(
      ...crowded.cards.map((card) => card.x - card.width / 2),
    );
    const right = Math.max(
      ...crowded.cards.map((card) => card.x + card.width / 2),
    );
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(800);
  });
});

describe("layoutCardPanels", () => {
  test("stacks title, art, and rules inside the card", () => {
    const panels = layoutCardPanels({ height: 180, width: 124, x: 0, y: 0 });
    expect(panels.title.y).toBeLessThan(panels.art.y);
    expect(panels.art.y).toBeLessThan(panels.rules.y);
    expect(panels.rules.y + panels.rules.height / 2).toBeLessThanOrEqual(90);
  });
});

describe("layoutHealthBar", () => {
  test("clamps health and labels it current over max", () => {
    const bar = layoutHealthBar(
      { height: 160, index: 0, width: 120, x: 0, y: 0 },
      -4,
      30,
    );
    expect(bar.fillRatio).toBe(0);
    expect(bar.label).toBe("0 / 30");
  });
});
